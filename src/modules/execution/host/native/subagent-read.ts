import { constants, type Stats } from "node:fs";
import { type FileHandle, open, realpath, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { WorkerReadOwner } from "../../../../platform/node/reads/public";
import { nativeSubagentResultText } from "../../../../platform/omp/protocol/public";

const taskSchema = z.strictObject({
  operationId: z.uuid(),
  traceId: z.uuid(),
  parentSessionFile: z.string().max(8192),
  parentSessionId: z.string().min(1).max(512),
  owner: z.strictObject({
    id: z.string().min(1).max(512),
    parentToolCallId: z.string().min(1).max(512),
    sessionFile: z.string().max(8192),
  }),
});
export type NativeSubagentReadTask = z.infer<typeof taskSchema>;
const identity = { operationId: z.uuid(), traceId: z.uuid() };
export const NativeSubagentReadReplySchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...identity,
    status: z.literal("available"),
    text: z.string().max(65536),
    truncated: z.boolean(),
    childSessionId: z.string().min(1).max(512),
  }),
  z.strictObject({
    ...identity,
    status: z.literal("unavailable"),
    reason: z.enum([
      "transcript-unavailable",
      "transcript-too-large",
      "transcript-empty",
    ]),
  }),
]);
export type NativeSubagentReadReply = z.infer<
  typeof NativeSubagentReadReplySchema
>;
const headerSchema = z.object({
  type: z.literal("session"),
  id: z.string().min(1).max(512),
  parentSession: z.string().optional(),
});
const messageSchema = z.object({
  type: z.literal("message"),
  message: z.object({ role: z.literal("assistant"), content: z.unknown() }),
});
const titleTypeSchema = z.object({ type: z.literal("title") });
function parseHeader(lines: string[]) {
  const first: unknown = JSON.parse(lines[0] ?? "");
  // OMP's physical title slot is optional and precedes the session header.
  // Permit that single preamble only, never search later records for an identity.
  return headerSchema.parse(
    titleTypeSchema.safeParse(first).success
      ? JSON.parse(lines[1] ?? "")
      : first,
  );
}
async function header(file: FileHandle) {
  const bytes = Buffer.alloc(65536);
  const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
  const end = bytes.subarray(0, bytesRead).lastIndexOf(10);
  if (end < 0) throw Error("Missing complete native header");
  return parseHeader(bytes.subarray(0, end).toString("utf8").split("\n", 2));
}
function sameFile(a: Stats, b: Stats) {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs
  );
}
function sameParent(a: Stats, b: Stats) {
  return a.dev === b.dev && a.ino === b.ino;
}
/** Fixed OMP 18.8.9 child JSONL. Never follows a supplied arbitrary transcript. */
export async function runNativeSubagentWorker(
  raw: unknown,
): Promise<NativeSubagentReadReply> {
  const task = taskSchema.parse(raw);
  const unavailable = (
    reason:
      | "transcript-unavailable"
      | "transcript-too-large"
      | "transcript-empty",
  ): NativeSubagentReadReply => ({
    operationId: task.operationId,
    traceId: task.traceId,
    status: "unavailable",
    reason,
  });
  let parent: FileHandle | undefined, child: FileHandle | undefined;
  try {
    if (
      !task.parentSessionFile.endsWith(".jsonl") ||
      !/^[^/\\.][^/\\]*$/.test(task.owner.id)
    )
      return unavailable("transcript-unavailable");
    const parentPath = await realpath(task.parentSessionFile);
    if (!parentPath.endsWith(".jsonl"))
      return unavailable("transcript-unavailable");
    const expected = join(parentPath.slice(0, -6), `${task.owner.id}.jsonl`);
    if (
      task.owner.sessionFile !==
        join(task.parentSessionFile.slice(0, -6), `${task.owner.id}.jsonl`) ||
      (await realpath(task.owner.sessionFile)) !== expected
    )
      return unavailable("transcript-unavailable");
    const artifactDirectory = dirname(expected);
    const directoryBefore = await stat(artifactDirectory);
    const sourceBefore = await stat(expected);
    if (!directoryBefore.isDirectory() || !sourceBefore.isFile())
      return unavailable("transcript-unavailable");
    parent = await open(parentPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const parentBefore = await parent.stat();
    if (
      !parentBefore.isFile() ||
      (await header(parent)).id !== task.parentSessionId
    )
      return unavailable("transcript-unavailable");
    child = await open(expected, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await child.stat();
    if (!before.isFile() || !sameFile(sourceBefore, before))
      return unavailable("transcript-unavailable");
    if (before.size > 1048576) return unavailable("transcript-too-large");
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await child.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!read.bytesRead) return unavailable("transcript-unavailable");
      offset += read.bytesRead;
    }
    const end = bytes.lastIndexOf(10);
    if (end < 0) return unavailable("transcript-empty");
    const lines = bytes.subarray(0, end).toString("utf8").split("\n");
    if (lines.length > 1000) return unavailable("transcript-too-large");
    const childHeader = parseHeader(lines);
    if (childHeader.parentSession !== task.parentSessionFile)
      return unavailable("transcript-unavailable");
    let text = "";
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const entry = messageSchema.safeParse(JSON.parse(line));
      if (!entry.success) continue;
      const result = nativeSubagentResultText(entry.data.message.content);
      if (result) text = result;
    }
    // O_NOFOLLOW covers only the leaf. Freeze the validated directory/file
    // identity and recheck canonical containment after all parsing as well.
    if (
      (await realpath(task.owner.sessionFile)) !== expected ||
      !sameParent(directoryBefore, await stat(artifactDirectory)) ||
      !sameFile(before, await child.stat()) ||
      !sameFile(before, await stat(expected)) ||
      !sameParent(parentBefore, await stat(parentPath)) ||
      (await header(parent)).id !== task.parentSessionId
    )
      return unavailable("transcript-unavailable");
    if (!text) return unavailable("transcript-empty");
    const output = Buffer.from(text, "utf8");
    let limit = Math.min(output.length, 65536);
    while (limit < output.length && (output[limit]! & 0xc0) === 0x80) limit--;
    return {
      operationId: task.operationId,
      traceId: task.traceId,
      status: "available",
      childSessionId: childHeader.id,
      text: output.subarray(0, limit).toString("utf8"),
      truncated: limit < output.length || end + 1 < bytes.length,
    };
  } catch {
    return unavailable("transcript-unavailable");
  } finally {
    await Promise.allSettled([parent?.close(), child?.close()]);
  }
}
/** One physical budget for every SessionHost scope in this utility process. */
export function createNativeSubagentReader(entry: URL) {
  const workers = new WorkerReadOwner(entry, { maxActive: 2, timeoutMs: 5000 });
  return {
    read: (task: z.infer<typeof taskSchema>, signal: AbortSignal) =>
      workers.run(
        task,
        (raw) => {
          const reply = NativeSubagentReadReplySchema.parse(raw);
          if (
            reply.operationId !== task.operationId ||
            reply.traceId !== task.traceId
          )
            throw Error("Read identity mismatch");
          return reply;
        },
        signal,
      ),
    close: () => workers.close(),
    snapshot: () => workers.snapshot(),
  };
}
