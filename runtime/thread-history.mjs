// Fixed OMP adapters only. No tools, extensions, provider or agent execution.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { FileSessionStorage } from "@oh-my-pi/pi-coding-agent/session/session-storage";

if ((await new Response(Bun.stdin).text()).trim() !== "permit")
  throw Error("History operation not permitted");
const input = JSON.parse(process.env.D_PI_THREAD_HISTORY);
// History writes have the same bounded lifetime as their real Main owner.
// The timer lives here so a Main exit cannot strand a detached writer.
const terminate = () => {
  try {
    process.kill(-process.pid, "SIGKILL");
  } catch {
    process.exit(1);
  }
};
const deadline = setTimeout(terminate, 30000);
deadline.unref();
let checking = false;
const watchdog = setInterval(() => {
  if (!input.mainPid || checking) return;
  try {
    process.kill(input.mainPid, 0);
  } catch (error) {
    if (error.code === "ESRCH") terminate();
  }
  checking = true;
  execFile(
    "/bin/ps",
    ["-p", String(input.mainPid), "-o", "lstart="],
    { timeout: 1500 },
    (error, output) => {
      checking = false;
      if (!error && output.trim().replace(/\s+/g, " ") !== input.mainBirth)
        terminate();
    },
  );
}, 500);
watchdog.unref();
if (input.mainPid) {
  const birth = await new Promise((resolve) =>
    execFile(
      "/bin/ps",
      ["-p", String(input.mainPid), "-o", "lstart="],
      { timeout: 1500 },
      (error, output) =>
        resolve(error ? null : output.trim().replace(/\s+/g, " ")),
    ),
  );
  if (!birth || birth !== input.mainBirth)
    throw Error("History owner unavailable");
}
const root = await realpath(input.root);
const parent = await realpath(dirname(input.file));
const within = relative(root, parent);
if (
  isAbsolute(within) ||
  within.startsWith("..") ||
  parent !== dirname(input.file) ||
  !input.file.endsWith(".jsonl")
)
  throw Error("Unmanaged history");
let exists = true;
try {
  if (
    !(await lstat(input.file)).isFile() ||
    (await realpath(input.file)) !== input.file
  )
    throw Error("History identity changed");
  const handle = await open(input.file, "r");
  let header;
  try {
    const bytes = Buffer.alloc(65536);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const prefix = bytes.subarray(0, bytesRead);
    const newline = prefix.lastIndexOf(10);
    if (newline < 0) throw Error("History header unavailable");
    for (const line of prefix
      .subarray(0, newline)
      .toString("utf8")
      .split("\n")) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line);
      if (entry.type === "session") {
        header = entry;
        break;
      }
    }
  } finally {
    await handle.close();
  }
  if (
    !header ||
    header.id !== input.sessionId ||
    header.cwd !== input.directory
  )
    throw Error("History identity changed");
} catch (error) {
  if (error.code === "ENOENT" && input.kind === "delete" && input.retry)
    exists = false;
  else throw error;
}
async function artifactsFingerprint(directory) {
  try {
    if (!(await lstat(directory)).isDirectory())
      throw Error("Invalid artifacts directory");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const entries = [];
  async function walk(path, name) {
    if (entries.length >= 10000)
      throw Error("Artifacts verification budget exceeded");
    const stat = await lstat(path);
    if (stat.isDirectory()) {
      entries.push([name, "directory"]);
      for (const child of (await readdir(path)).sort())
        await walk(join(path, child), join(name, child));
    } else if (stat.isFile()) {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      entries.push([name, hash.digest("hex")]);
    } else throw Error("Unsupported artifact identity");
  }
  await walk(directory, "");
  return JSON.stringify(entries);
}
if (input.kind === "delete") {
  class DeletionStorage extends FileSessionStorage {
    async unlink(file) {
      try {
        await super.unlink(file);
      } catch (error) {
        if (error.code !== "ENOENT" || exists) throw error;
      }
    }
  }
  await new DeletionStorage().deleteSessionWithArtifacts(input.file);
  process.stdout.write(JSON.stringify({ kind: "deleted" }));
} else {
  const manager = await SessionManager.open(
    input.file,
    input.destination,
    undefined,
    {
      initialCwd: input.directory,
      throwIfMissing: true,
      suppressBreadcrumb: true,
    },
  );
  if (
    manager.getSessionId() !== input.sessionId ||
    manager.getCwd() !== input.directory
  )
    throw Error("History identity changed");
  const leaf = manager.getLeafId();
  if (!leaf) throw Error("No branch to fork");
  const expectedArtifacts = await artifactsFingerprint(input.file.slice(0, -6));
  const file = manager.createBranchedSession(leaf, { copyArtifacts: true });
  await manager.ensureOnDisk();
  const sessionId = manager.getSessionId();
  await manager.close();
  if (!file) throw Error("Fork not persisted");
  if ((await artifactsFingerprint(file.slice(0, -6))) !== expectedArtifacts) {
    await new FileSessionStorage().deleteSessionWithArtifacts(file);
    throw Error("Fork artifacts incomplete");
  }
  process.stdout.write(JSON.stringify({ kind: "forked", file, sessionId }));
}
