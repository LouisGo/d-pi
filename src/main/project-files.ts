import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { FileReply } from "../features/files/contracts";

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
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : null;
  if (code === "ENOENT" || code === "ENOTDIR") return unavailable("missing");
  if (code === "EACCES" || code === "EPERM" || code === "ELOOP")
    return unavailable("denied");
  return unavailable("failed");
}
async function resolveInProject(
  root: string,
  path: string,
): Promise<{ base: string; target: string } | FileReply> {
  if (!pathValid(path)) return unavailable("denied");
  const base = await realpath(root);
  if (base !== root) return unavailable("changed");
  const target = await realpath(join(base, path));
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
): Promise<FileReply> {
  try {
    const canonical = await canonicalRoot(root);
    if (typeof canonical !== "string") return canonical;
    const resolved = await resolveInProject(canonical, path);
    if (isFailure(resolved)) return resolved;
    const before = await stat(resolved.target);
    if (!before.isDirectory()) return unavailable("not-file");
    const entries = await readdir(resolved.target, { withFileTypes: true });
    const shown = entries
      .filter((entry) => entry.name !== ".git")
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_ENTRIES);
    const result = await Promise.all(
      shown.map(async (entry) => {
        const full = join(resolved.target, entry.name);
        const info = await lstat(full);
        return {
          path: path ? `${path}/${entry.name}` : entry.name,
          name: entry.name,
          kind: info.isSymbolicLink()
            ? ("symlink" as const)
            : info.isDirectory()
              ? ("directory" as const)
              : info.isFile()
                ? ("file" as const)
                : ("other" as const),
        };
      }),
    );
    const after = await stat(resolved.target);
    if (
      before.ino !== after.ino ||
      before.dev !== after.dev ||
      before.mtimeMs !== after.mtimeMs ||
      (await realpath(join(canonical, path))) !== resolved.target
    )
      return unavailable("changed");
    return {
      kind: "entries",
      path,
      entries: result,
      truncated: entries.length > MAX_ENTRIES,
    };
  } catch (error) {
    return reasonOf(error);
  }
}
export async function readProjectFile(
  root: string,
  path: string,
  maxBytes = MAX_VIEW_BYTES,
  afterRead?: () => Promise<void>,
): Promise<FileReply> {
  try {
    const canonical = await canonicalRoot(root);
    if (typeof canonical !== "string") return canonical;
    const resolved = await resolveInProject(canonical, path);
    if (isFailure(resolved)) return resolved;
    // FIFOs, sockets and devices must never reach a blocking open: `lstat`
    // itself never blocks, and `O_NONBLOCK` keeps the open itself from
    // waiting when the target is swapped between the check and the open.
    // The post-open `fstat` recheck below stays as the race-safe verdict.
    const pre = await lstat(resolved.target);
    if (!pre.isFile()) return unavailable("not-file");
    const file = await open(
      resolved.target,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await file.stat();
      if (!before.isFile()) return unavailable("not-file");
      if (before.size > maxBytes) return unavailable("too-large");
      const buffer = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          offset,
          buffer.length - offset,
          offset,
        );
        if (!bytesRead) return unavailable("changed");
        offset += bytesRead;
      }
      await afterRead?.();
      const after = await file.stat();
      if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs ||
        (await realpath(join(canonical, path))) !== resolved.target
      )
        return unavailable("changed");
      if (buffer.includes(0)) return unavailable("binary");
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        return unavailable("invalid-encoding");
      }
      return {
        kind: "text",
        path,
        text,
        bytes: buffer.length,
        version: `sha256:${createHash("sha256").update(buffer).digest("hex")}`,
        capturedAt: new Date().toISOString(),
        coverage: "complete",
      };
    } finally {
      await file.close();
    }
  } catch (error) {
    return reasonOf(error);
  }
}
