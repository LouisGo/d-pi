import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import {
  ReadCancelledError,
  ReadOperationError,
  throwIfReadCancelled,
} from "../../../shared/read-operation";
import type { FileReply } from "../contracts/public";

export const MAX_VIEW_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 500;

function inside(root: string, target: string): boolean {
  const part = relative(root, target);
  return (
    part === "" ||
    (!isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`))
  );
}
function pathValid(path: string): boolean {
  return (
    !isAbsolute(path) &&
    !path.includes("\0") &&
    path.split(/[\\/]/).every((part) => part !== "..")
  );
}
function unavailable(
  reason: Extract<FileReply, { kind: "unavailable" }>["reason"],
): FileReply {
  return { kind: "unavailable", reason };
}
function reasonOf(error: unknown): FileReply {
  if (
    error instanceof ReadCancelledError ||
    error instanceof ReadOperationError
  )
    throw error;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : null;
  if (code === "ENOENT" || code === "ENOTDIR") return unavailable("missing");
  if (code === "EACCES" || code === "EPERM" || code === "ELOOP")
    return unavailable("denied");
  if (typeof code !== "string" || code.startsWith("ERR_")) throw error;
  throw new ReadOperationError("io", true, { cause: error });
}
async function resolveInProject(
  root: string,
  path: string,
  signal?: AbortSignal,
): Promise<{ base: string; target: string } | FileReply> {
  if (!pathValid(path)) return unavailable("denied");
  const base = await realpath(root);
  throwIfReadCancelled(signal);
  if (base !== root) return unavailable("changed");
  const target = await realpath(join(base, path));
  throwIfReadCancelled(signal);
  if (!inside(base, target)) return unavailable("denied");
  return { base, target };
}
function isFailure(
  value: { base: string; target: string } | FileReply,
): value is FileReply {
  return "kind" in value;
}
async function canonicalRoot(root: string): Promise<string | FileReply> {
  try {
    return await realpath(root);
  } catch (error) {
    return reasonOf(error);
  }
}
export async function listProjectFiles(
  root: string,
  path: string,
  signal?: AbortSignal,
): Promise<FileReply> {
  try {
    throwIfReadCancelled(signal);
    const canonical = await canonicalRoot(root);
    throwIfReadCancelled(signal);
    if (typeof canonical !== "string") return canonical;
    const resolved = await resolveInProject(canonical, path, signal);
    if (isFailure(resolved)) return resolved;
    const before = await stat(resolved.target);
    throwIfReadCancelled(signal);
    if (!before.isDirectory()) return unavailable("not-file");
    throwIfReadCancelled(signal);
    const directory = await opendir(resolved.target);
    const result: Extract<FileReply, { kind: "entries" }>["entries"] = [];
    let visited = 0;
    let namesBytes = 0;
    let found = 0;
    let bounded = false;
    const deadline = performance.now() + 5000;
    try {
      while (true) {
        throwIfReadCancelled(signal);
        const entry = await directory.read();
        throwIfReadCancelled(signal);
        if (!entry) break;
        visited++;
        namesBytes += Buffer.byteLength(entry.name);
        if (
          visited > 50_000 ||
          namesBytes > 4 * 1024 * 1024 ||
          performance.now() >= deadline
        ) {
          bounded = true;
          break;
        }
        if (entry.name === ".git") continue;
        found++;
        const item = {
          path: path ? `${path}/${entry.name}` : entry.name,
          name: entry.name,
          kind: entry.isSymbolicLink()
            ? ("symlink" as const)
            : entry.isDirectory()
              ? ("directory" as const)
              : entry.isFile()
                ? ("file" as const)
                : ("other" as const),
        };
        if (
          result.length === MAX_ENTRIES &&
          item.name.localeCompare(result[result.length - 1]!.name) >= 0
        )
          continue;
        let low = 0;
        let high = result.length;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (result[middle]!.name.localeCompare(item.name) < 0)
            low = middle + 1;
          else high = middle;
        }
        result.splice(low, 0, item);
        if (result.length > MAX_ENTRIES) result.pop();
      }
    } finally {
      await directory.close();
    }
    throwIfReadCancelled(signal);
    const after = await stat(resolved.target);
    throwIfReadCancelled(signal);
    if (
      before.ino !== after.ino ||
      before.dev !== after.dev ||
      before.mtimeMs !== after.mtimeMs ||
      (await realpath(join(canonical, path))) !== resolved.target
    )
      return unavailable("changed");
    throwIfReadCancelled(signal);
    return {
      kind: "entries",
      path,
      entries: result,
      truncated: bounded || found > MAX_ENTRIES,
    };
  } catch (error) {
    return reasonOf(error);
  }
}
export async function readProjectBytes(
  root: string,
  path: string,
  maxBytes = MAX_VIEW_BYTES,
  afterRead?: () => Promise<void>,
  signal?: AbortSignal,
): Promise<
  | FileReply
  | { kind: "bytes"; bytes: Uint8Array; version: string; capturedAt: string }
> {
  try {
    throwIfReadCancelled(signal);
    const canonical = await canonicalRoot(root);
    throwIfReadCancelled(signal);
    if (typeof canonical !== "string") return canonical;
    const resolved = await resolveInProject(canonical, path, signal);
    if (isFailure(resolved)) return resolved;
    // FIFOs, sockets and devices must never reach a blocking open: `lstat`
    // itself never blocks, and `O_NONBLOCK` keeps the open itself from
    // waiting when the target is swapped between the check and the open.
    // The post-open `fstat` recheck below stays as the race-safe verdict.
    const pre = await lstat(resolved.target);
    throwIfReadCancelled(signal);
    if (!pre.isFile()) return unavailable("not-file");
    throwIfReadCancelled(signal);
    const file = await open(
      resolved.target,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      throwIfReadCancelled(signal);
      const before = await file.stat();
      throwIfReadCancelled(signal);
      if (!before.isFile()) return unavailable("not-file");
      if (before.size > maxBytes) return unavailable("too-large");
      const buffer = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < buffer.length) {
        throwIfReadCancelled(signal);
        const { bytesRead } = await file.read(
          buffer,
          offset,
          Math.min(64 * 1024, buffer.length - offset),
          offset,
        );
        throwIfReadCancelled(signal);
        if (!bytesRead) return unavailable("changed");
        offset += bytesRead;
      }
      throwIfReadCancelled(signal);
      await afterRead?.();
      throwIfReadCancelled(signal);
      const after = await file.stat();
      throwIfReadCancelled(signal);
      if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs ||
        (await realpath(join(canonical, path))) !== resolved.target
      )
        return unavailable("changed");
      throwIfReadCancelled(signal);
      return {
        kind: "bytes",
        bytes: buffer,
        version: `sha256:${createHash("sha256").update(buffer).digest("hex")}`,
        capturedAt: new Date().toISOString(),
      };
    } finally {
      await file.close();
    }
  } catch (error) {
    return reasonOf(error);
  }
}

export async function readProjectFile(
  root: string,
  path: string,
  maxBytes = MAX_VIEW_BYTES,
  afterRead?: () => Promise<void>,
  signal?: AbortSignal,
): Promise<FileReply> {
  const result = await readProjectBytes(
    root,
    path,
    maxBytes,
    afterRead,
    signal,
  );
  throwIfReadCancelled(signal);
  if (result.kind !== "bytes") return result;
  if (result.bytes.includes(0)) return unavailable("binary");
  try {
    return {
      kind: "text",
      path,
      text: new TextDecoder("utf-8", { fatal: true }).decode(result.bytes),
      bytes: result.bytes.byteLength,
      version: result.version,
      capturedAt: result.capturedAt,
      coverage: "complete",
    };
  } catch {
    return unavailable("invalid-encoding");
  }
}
