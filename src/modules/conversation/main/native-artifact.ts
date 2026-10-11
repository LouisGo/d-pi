import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ToolArtifact } from "../../resources/contracts/public";
import type { NativeSessionBinding } from "../../threads/contracts/public";

type Reply =
  | { kind: "artifact"; text: string; revision: string; complete: boolean }
  | { kind: "unavailable"; reason: "missing" | "identity-changed" | "limit" };

/** Called only after proving a native record's structured artifact reference. */
export async function readNativeArtifact(
  binding: NativeSessionBinding,
  artifact: ToolArtifact,
): Promise<Reply> {
  if (
    !binding.sessionFile.endsWith(".jsonl") ||
    !/^\d{1,20}$/.test(artifact.key)
  )
    return { kind: "unavailable", reason: "identity-changed" };
  // Fixed OMP SessionManager.artifactsDirectoryFor: same basename without .jsonl.
  try {
    // Normalize trusted parent aliases (e.g. macOS /var); deny the artifact
    // directory itself becoming a symlink to another session/resource.
    const directory = join(
      await realpath(dirname(binding.sessionFile)),
      basename(binding.sessionFile, ".jsonl"),
    );
    if ((await realpath(directory)) !== directory)
      return { kind: "unavailable", reason: "identity-changed" };
    const matches: string[] = [];
    let count = 0;
    for await (const entry of await opendir(directory)) {
      if (++count > 2048) return { kind: "unavailable", reason: "limit" };
      if (
        entry.name.startsWith(`${artifact.key}.`) &&
        /^\d{1,20}\.[A-Za-z0-9_-]{1,64}\.log$/.test(entry.name)
      )
        matches.push(entry.name);
      if (matches.length > 1)
        return { kind: "unavailable", reason: "identity-changed" };
    }
    const name = matches[0];
    if (!name) return { kind: "unavailable", reason: "missing" };
    const path = join(directory, name);
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await file.stat();
      if (!before.isFile())
        return { kind: "unavailable", reason: "identity-changed" };
      if (before.size > 16 * 1024 * 1024)
        return { kind: "unavailable", reason: "limit" };
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const read = await file.read(
          bytes,
          offset,
          bytes.length - offset,
          offset,
        );
        if (!read.bytesRead)
          return { kind: "unavailable", reason: "identity-changed" };
        offset += read.bytesRead;
      }
      const [after, current] = await Promise.all([file.stat(), lstat(path)]);
      if (
        !current.isFile() ||
        current.dev !== before.dev ||
        current.ino !== before.ino ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs ||
        (await realpath(directory)) !== directory
      )
        return { kind: "unavailable", reason: "identity-changed" };
      return {
        kind: "artifact",
        text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        revision: createHash("sha256").update(bytes).digest("hex"),
        complete:
          artifact.coverage === "complete" &&
          artifact.expectedBytes === bytes.byteLength,
      };
    } finally {
      await file.close();
    }
  } catch (error) {
    return {
      kind: "unavailable",
      reason:
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
          ? "missing"
          : "identity-changed",
    };
  }
}
