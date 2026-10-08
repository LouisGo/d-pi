import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
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
const MAX_RECORD_BYTES = 32 * 1024 * 1024;
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
      // Read a frozen committed prefix, independent of current execution. The
      // native writer appends records or atomically replaces the file; appends
      // must not invalidate an older page, replacements must. Never use busy
      // RPC history reads or a growing EOF as this snapshot's boundary.
      const endOffset = cursor?.endOffset ?? info.size;
      if (endOffset > info.size)
        return { kind: "unavailable", reason: "changed" };
      const identity = `${info.dev}:${info.ino}:${info.birthtimeMs}`;
      const prefix = Buffer.alloc(Math.min(65536, endOffset));
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
      const prefixHash = createHash("sha256")
        .update(prefix.subarray(0, prefixRead.bytesRead))
        .digest("hex");
      const source = createHash("sha256")
        .update(
          `${identity}:${binding.configContextId}:${header.data.id}:${endOffset}:${prefixHash}`,
        )
        .digest("hex");
      if (
        cursor &&
        (cursor.threadId !== binding.threadId ||
          cursor.source !== source ||
          cursor.offset > endOffset ||
          cursor.prefixHash !== prefixHash)
      )
        return { kind: "unavailable", reason: "changed" };
      const offset = cursor?.offset ?? 0;
      let buffer = Buffer.alloc(Math.min(PAGE_BYTES, endOffset - offset));
      signal?.throwIfAborted();
      let read = await file.read(buffer, 0, buffer.length, offset);
      let bytes = buffer.subarray(0, read.bytesRead);
      let lastNewline = bytes.lastIndexOf(10);
      // A single long message is still one record and one continuous body.
      // Grow only when the first record exceeds a page, with an explicit cap.
      while (
        lastNewline < 0 &&
        offset + bytes.length < endOffset &&
        buffer.length < MAX_RECORD_BYTES
      ) {
        buffer = Buffer.alloc(
          Math.min(buffer.length * 2, MAX_RECORD_BYTES, endOffset - offset),
        );
        signal?.throwIfAborted();
        read = await file.read(buffer, 0, buffer.length, offset);
        bytes = buffer.subarray(0, read.bytesRead);
        lastNewline = bytes.lastIndexOf(10);
      }
      if (lastNewline < 0 && offset + bytes.length < endOffset)
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
      const currentPath = await stat(path);
      if (
        `${after.dev}:${after.ino}:${after.birthtimeMs}` !== identity ||
        currentPath.dev !== info.dev ||
        currentPath.ino !== info.ino ||
        after.size < endOffset ||
        (after.size === info.size &&
          (after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs)) ||
        (await realpath(binding.sessionFile)) !== path
      )
        return { kind: "unavailable", reason: "changed" };
      const nextOffset = offset + complete.length;
      const atEnd = offset + bytes.length >= endOffset;
      return {
        kind: "page",
        entries,
        source,
        coverage: "append-order",
        incompleteTail: atEnd && complete.length !== bytes.length,
        omitted,
        next: !atEnd
          ? {
              threadId: binding.threadId,
              source,
              offset: nextOffset,
              endOffset,
              prefixHash,
            }
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
