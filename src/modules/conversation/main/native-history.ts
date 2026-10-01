import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { z } from "zod";
import type { NativeSessionBinding } from "../../threads/contracts/public";
import type {
  HistoryCursor,
  HistoryEntry,
  HistoryPage,
  HistoryToolEffect,
} from "../contracts/history";

const HeaderSchema = z.object({
  type: z.literal("session"),
  version: z.literal(3),
  id: z.string(),
});
const EntrySchema = z.object({
  type: z.literal("message"),
  id: z.string(),
  parentId: z.string().nullable(),
  message: z.object({
    role: z.string(),
    content: z.union([z.string(), z.array(z.unknown())]),
    toolCallId: z.string().max(256).optional(),
    toolName: z.string().max(120).optional(),
    isError: z.boolean().optional(),
  }),
});
const TextPartSchema = z.object({ type: z.literal("text"), text: z.string() });
const PAGE_BYTES = 1024 * 1024;
const MUTATING_TOOL_NAMES = new Set([
  "write",
  "edit",
  "delete",
  "apply_patch",
  "ast_edit",
]);
const NON_MUTATING_TOOL_NAMES = new Set(["read"]);

function classifyToolEffect(toolName: string): HistoryToolEffect {
  if (MUTATING_TOOL_NAMES.has(toolName)) return "mutation";
  if (NON_MUTATING_TOOL_NAMES.has(toolName)) return "no-mutation";
  return "unknown";
}

export async function readNativeHistory(
  root: string,
  binding: NativeSessionBinding,
  cursor: HistoryCursor | null = null,
  signal?: AbortSignal,
  projectDirectory?: string,
): Promise<HistoryPage> {
  try {
    signal?.throwIfAborted();
    const [base, path] = await Promise.all([
      realpath(root),
      realpath(binding.sessionFile),
    ]);
    const within = relative(base, path);
    if (
      isAbsolute(within) ||
      within.startsWith("..") ||
      (!projectDirectory && !within.startsWith(`${binding.threadId}${sep}`))
    )
      return { kind: "unavailable", reason: "denied" };
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile()) return { kind: "unavailable", reason: "denied" };
      const identity = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
      const prefix = Buffer.alloc(Math.min(65536, info.size));
      const prefixRead = await file.read(prefix, 0, prefix.length, 0);
      const lines = prefix
        .subarray(0, prefixRead.bytesRead)
        .toString("utf8")
        .split("\n");
      // Official v3 may have a fixed title slot before the session header.
      const first: unknown = JSON.parse(lines[0] ?? "");
      const title = z
        .object({ type: z.literal("title") })
        .safeParse(first).success;
      const rawHeader: unknown = title ? JSON.parse(lines[1] ?? "") : first;
      const header = HeaderSchema.safeParse(rawHeader);
      if (!header.success)
        return { kind: "unavailable", reason: "unsupported" };
      if (projectDirectory) {
        const cwd = z.object({ cwd: z.string() }).safeParse(rawHeader);
        if (
          !cwd.success ||
          (await realpath(cwd.data.cwd)) !== (await realpath(projectDirectory))
        )
          return { kind: "unavailable", reason: "denied" };
      }
      if (header.data.id !== binding.sessionId)
        return { kind: "unavailable", reason: "changed" };
      const source = createHash("sha256")
        .update(`${identity}:${binding.configContextId}:${header.data.id}`)
        .digest("hex");
      if (
        cursor &&
        (cursor.threadId !== binding.threadId ||
          cursor.source !== source ||
          cursor.offset > info.size)
      )
        return { kind: "unavailable", reason: "changed" };
      const offset = cursor?.offset ?? 0;
      const buffer = Buffer.alloc(Math.min(PAGE_BYTES, info.size - offset));
      signal?.throwIfAborted();
      const read = await file.read(buffer, 0, buffer.length, offset);
      const bytes = buffer.subarray(0, read.bytesRead);
      const lastNewline = bytes.lastIndexOf(10);
      if (lastNewline < 0 && offset + bytes.length < info.size)
        return { kind: "unavailable", reason: "unsupported" };
      const complete = bytes.subarray(0, lastNewline + 1);
      const utf8 = new TextDecoder("utf-8", { fatal: true });
      const entries: HistoryEntry[] = [];
      let omitted = 0;
      for (const line of utf8.decode(complete).split("\n")) {
        if (!line.trim()) continue;
        const raw: unknown = JSON.parse(line);
        const record = EntrySchema.safeParse(raw);
        if (!record.success) {
          const type = z.object({ type: z.string() }).safeParse(raw);
          if (
            type.success &&
            type.data.type !== "session" &&
            type.data.type !== "title"
          )
            omitted++;
          continue;
        }
        const { id, parentId, message } = record.data;
        const text =
          typeof message.content === "string"
            ? message.content
            : message.content
                .flatMap((part) => {
                  const text = TextPartSchema.safeParse(part);
                  return text.success ? [text.data.text] : [];
                })
                .join("\n");
        const toolEvidence =
          message.role === "toolResult" &&
          message.toolCallId &&
          message.toolName
            ? {
                toolCallId: message.toolCallId,
                toolName: message.toolName,
                isError: message.isError ?? null,
                effect: classifyToolEffect(message.toolName),
                coverage: "text-parts-only" as const,
                nonTextParts: Array.isArray(message.content)
                  ? message.content.filter(
                      (part) => !TextPartSchema.safeParse(part).success,
                    ).length
                  : 0,
              }
            : undefined;
        entries.push({
          id,
          parentId,
          role: message.role,
          text,
          ...(toolEvidence ? { toolEvidence } : {}),
        });
      }
      signal?.throwIfAborted();
      const after = await file.stat();
      if (
        `${after.dev}:${after.ino}:${after.size}:${after.mtimeMs}:${after.ctimeMs}` !==
          identity ||
        (await realpath(binding.sessionFile)) !== path
      )
        return { kind: "unavailable", reason: "changed" };
      const nextOffset = offset + complete.length;
      const atEnd = offset + bytes.length >= info.size;
      return {
        kind: "page",
        entries,
        source,
        coverage: "append-order",
        incompleteTail: atEnd && complete.length !== bytes.length,
        omitted,
        next: !atEnd
          ? { threadId: binding.threadId, source, offset: nextOffset }
          : null,
      };
    } finally {
      await file.close();
    }
  } catch (error) {
    if (signal?.aborted) return { kind: "unavailable", reason: "cancelled" };
    const code = z.object({ code: z.string() }).safeParse(error);
    if (code.success && code.data.code === "ENOENT")
      return { kind: "unavailable", reason: "missing" };
    if (code.success && ["EACCES", "EPERM", "ELOOP"].includes(code.data.code))
      return { kind: "unavailable", reason: "denied" };
    return { kind: "unavailable", reason: "invalid" };
  }
}
