import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";
import type { NativeSessionBinding } from "../../threads/contracts/public";
import type {
  HistoryCursor,
  HistoryEntry,
  HistoryImageReply,
  HistoryPage,
  HistoryToolEffect,
} from "../contracts/history";
import { nativeMessageTime } from "../contracts/message-time";
import {
  NativeImagePartSchema,
  nativeImageDigest,
  readNativeImagePart,
} from "./native-image";

const HeaderSchema = z.object({
  type: z.literal("session"),
  version: z.literal(3),
  id: z.string(),
});
const EntrySchema = z.object({
  type: z.literal("message"),
  id: z.string(),
  parentId: z.string().nullable(),
  timestamp: z.unknown().optional(),
  message: z.object({
    role: z.string(),
    content: z.union([z.string(), z.array(z.unknown())]),
    toolCallId: z.string().max(256).optional(),
    toolName: z.string().max(120).optional(),
    isError: z.boolean().optional(),
    stopReason: z.string().optional(),
    errorMessage: z.string().optional(),
    timestamp: z.unknown().optional(),
  }),
});
const TextPartSchema = z.object({ type: z.literal("text"), text: z.string() });
const ThinkingPartSchema = z.object({
  type: z.literal("thinking"),
  thinking: z.string(),
});
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
  imageRequest?: {
    recordId: string;
    index: number;
    blobsDirectory?: string | undefined;
    receive: (image: HistoryImageReply) => void;
  },
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
      let endOffset = cursor?.endOffset ?? info.size;
      if (endOffset > info.size)
        return { kind: "unavailable", reason: "changed" };
      const identity = `${info.dev}:${info.ino}:${info.birthtimeMs}`;
      let prefix = Buffer.alloc(Math.min(65536, endOffset));
      let prefixRead = await file.read(prefix, 0, prefix.length, 0);
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
        if (!cwd.success || !isAbsolute(cwd.data.cwd))
          return { kind: "unavailable", reason: "denied" };
        try {
          if (
            (await realpath(cwd.data.cwd)) !==
            (await realpath(projectDirectory))
          )
            return { kind: "unavailable", reason: "denied" };
        } catch (error) {
          // A lost worktree does not destroy its saved messages. This metadata
          // fallback grants no execution and still requires the exact bound file.
          const missing = z
            .object({ code: z.literal("ENOENT") })
            .safeParse(error);
          if (
            !missing.success ||
            resolve(cwd.data.cwd) !== cwd.data.cwd ||
            cwd.data.cwd !== projectDirectory
          )
            return { kind: "unavailable", reason: "denied" };
        }
      }
      if (header.data.id !== binding.sessionId)
        return { kind: "unavailable", reason: "changed" };
      let prefixHash = createHash("sha256")
        .update(prefix.subarray(0, prefixRead.bytesRead))
        .digest("hex");
      let source = createHash("sha256")
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
      if (cursor?.append) {
        // Verify the old frozen prefix before extending it. A short prefix hash
        // changes on append; older page/image cursors must keep their old hash.
        if (imageRequest || cursor.endOffset === undefined)
          return { kind: "unavailable", reason: "changed" };
        endOffset = info.size;
        if (prefix.length !== Math.min(65536, endOffset)) {
          prefix = Buffer.alloc(Math.min(65536, endOffset));
          prefixRead = await file.read(prefix, 0, prefix.length, 0);
          prefixHash = createHash("sha256")
            .update(prefix.subarray(0, prefixRead.bytesRead))
            .digest("hex");
        }
        source = createHash("sha256")
          .update(
            `${identity}:${binding.configContextId}:${header.data.id}:${endOffset}:${prefixHash}`,
          )
          .digest("hex");
      }
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
      let lineOffset = offset;
      for (const line of utf8.decode(complete).split("\n")) {
        const recordOffset = lineOffset;
        lineOffset += Buffer.byteLength(line, "utf8") + 1;
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
        if (imageRequest) {
          if (imageRequest.recordId !== id) continue;
          if (message.role === "user" && Array.isArray(message.content)) {
            const image = message.content.flatMap((part) => {
              const parsed = NativeImagePartSchema.safeParse(part);
              return parsed.success ? [parsed.data] : [];
            })[imageRequest.index];
            if (image)
              imageRequest.receive(
                await readNativeImagePart(image, imageRequest.blobsDirectory),
              );
          }
          break;
        }
        const timestamp =
          nativeMessageTime(message.timestamp) ??
          nativeMessageTime(record.data.timestamp);
        const text =
          typeof message.content === "string"
            ? message.content
            : message.content
                .flatMap((part) => {
                  const text = TextPartSchema.safeParse(part);
                  return text.success ? [text.data.text] : [];
                })
                .join("\n");
        const images =
          message.role === "user" && Array.isArray(message.content)
            ? message.content
                .flatMap((part) => {
                  const parsed = NativeImagePartSchema.safeParse(part);
                  return parsed.success ? [parsed.data] : [];
                })
                .slice(0, 128)
            : [];
        const imageMarkers = [
          ...text.matchAll(/(?:^|\n)\[image: ([^\n]+)\](?=\n|$)/g),
        ];
        const paired =
          images.length > 0 && imageMarkers.length === images.length;
        const imageMetadata = images.map((image, index) => ({
          index,
          mimeType: image.mimeType,
          digest: nativeImageDigest(image),
          ...(paired
            ? { name: (imageMarkers[index]?.[1] ?? "").slice(0, 512) }
            : {}),
        }));
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
        const thinking =
          message.role === "assistant" && Array.isArray(message.content)
            ? message.content
                .flatMap((part) => {
                  const parsed = ThinkingPartSchema.safeParse(part);
                  return parsed.success ? [parsed.data.thinking] : [];
                })
                .join("\n")
            : "";
        entries.push({
          id,
          parentId,
          role: message.role,
          text,
          ...(timestamp !== undefined ? { timestamp } : {}),
          ...(images.length
            ? {
                images: imageMetadata,
                mediaCursor: {
                  threadId: binding.threadId,
                  source,
                  offset: recordOffset,
                  endOffset,
                  prefixHash,
                },
              }
            : {}),
          ...(paired
            ? {
                displayText: text
                  .replace(/(?:^|\n)\[image: ([^\n]+)\](?=\n|$)/g, "")
                  .trim(),
              }
            : {}),
          ...(thinking ? { thinking } : {}),
          ...(message.stopReason === "aborted"
            ? { state: "aborted" as const }
            : message.stopReason === "error" ||
                message.isError ||
                message.errorMessage
              ? { state: "failed" as const }
              : {}),
          ...(message.errorMessage
            ? { detail: message.errorMessage.slice(0, 4096) }
            : {}),
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
        continuation: {
          threadId: binding.threadId,
          source,
          offset: nextOffset,
          endOffset,
          prefixHash,
        },
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

/** Same bound file and frozen prefix as its page. Never accepts a path or an arbitrary resource. */
export async function readNativeImage(
  root: string,
  binding: NativeSessionBinding,
  cursor: HistoryCursor,
  recordId: string,
  index: number,
  projectDirectory?: string,
  blobsDirectory?: string,
): Promise<HistoryImageReply> {
  let image: HistoryImageReply | undefined;
  const page = await readNativeHistory(
    root,
    binding,
    cursor,
    undefined,
    projectDirectory,
    {
      recordId,
      index,
      blobsDirectory,
      receive: (value) => {
        image = value;
      },
    },
  );
  return page.kind === "unavailable"
    ? page
    : (image ?? { kind: "unavailable", reason: "missing" });
}
