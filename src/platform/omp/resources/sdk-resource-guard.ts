import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

// One OS-backed mutex per managed SDK root, shared by Main and preparation.
// Its location deliberately ignores HOME/TMPDIR and never writes app resources.
// Keep the database inode: unlinking it could let two open files hold separate locks.
const held = new Map<string, () => void>();
function canonicalRoot(directory: string): string {
  const path = resolve(directory);
  try {
    if (!lstatSync(path).isDirectory())
      throw Error(
        "Managed SDK root must be a directory, without a root symlink",
      );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  return join(realpathSync(dirname(path)), basename(path));
}

export function acquireSdkResourceGuard(directory: string): () => void {
  const root = canonicalRoot(directory);
  const uid = process.getuid?.();
  if (uid === undefined)
    throw Error("SDK resource guard requires a POSIX user identity");
  const guards = `/tmp/d-pi-sdk-resource-guards-${uid}`;
  try {
    mkdirSync(guards, { mode: 0o700 });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST"))
      throw error;
  }
  const folder = lstatSync(guards);
  if (
    !folder.isDirectory() ||
    folder.uid !== uid ||
    (folder.mode & 0o777) !== 0o700
  )
    throw Error("SDK resource guard directory is not private");
  const path = join(
    guards,
    `${createHash("sha256").update(root).digest("hex")}.sqlite`,
  );
  const file = openSync(
    path,
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const stat = fstatSync(file);
    if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o777) !== 0o600)
      throw Error("SDK resource guard file is not private");
  } finally {
    closeSync(file);
  }
  const birth = execFileSync(
    "/bin/ps",
    ["-p", String(process.pid), "-o", "lstart="],
    {
      encoding: "utf8",
      timeout: 2000,
    },
  )
    .trim()
    .replace(/\s+/g, " ");
  if (!birth) throw Error("SDK resource guard owner identity unavailable");
  const connection = new DatabaseSync(path);
  try {
    // COMMIT keeps EXCLUSIVE locking_mode until this connection closes. A process
    // crash releases the kernel lock; old PID/birth rows do not grant ownership.
    connection.exec(
      "PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS owner(id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL, birth TEXT NOT NULL, resource_root TEXT NOT NULL);",
    );
    connection
      .prepare("INSERT OR REPLACE INTO owner VALUES(1,?,?,?)")
      .run(process.pid, birth, root);
    connection.exec("COMMIT");
  } catch (cause) {
    connection.close();
    throw Error(
      "SDK resources are in use or the shared resource guard is unavailable; close d-pi before preparing resources",
      { cause },
    );
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    connection.close();
  };
}

export function holdSdkResources(directory: string): void {
  const root = canonicalRoot(directory);
  if (!held.has(root)) held.set(root, acquireSdkResourceGuard(root));
}
process.once("exit", () => {
  for (const release of held.values()) release();
  held.clear();
});
