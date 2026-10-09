import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";

// Explicit App binding only; never resume the latest CLI session or mint a replacement.
export async function managedSessionManager(
  SessionManager,
  {
    cwd = process.cwd(),
    directory = process.env.PI_CODING_AGENT_SESSION_DIR,
    resume = JSON.parse(process.env.D_PI_RESUME_SESSION ?? "null"),
  } = {},
) {
  if (resume === null) {
    const manager = SessionManager.create(cwd, directory);
    try {
      // The SDK is lazy until an assistant message. Publish only after the same
      // session has crossed its explicit persistence gate, even when empty.
      await manager.ensureOnDisk();
      return manager;
    } catch (error) {
      await manager.close();
      throw error;
    }
  }
  if (
    !resume ||
    typeof resume.sessionFile !== "string" ||
    typeof resume.sessionId !== "string" ||
    !directory
  )
    throw Error("Invalid native resume binding");
  const root = await realpath(directory);
  const file = await realpath(resume.sessionFile);
  const within = relative(root, file);
  if (
    within.startsWith("..") ||
    isAbsolute(within) ||
    file !== resume.sessionFile ||
    !(await lstat(file)).isFile()
  )
    throw Error("Unmanaged native resume binding");
  const handle = await open(file, "r");
  let header;
  try {
    const bytes = Buffer.alloc(65536);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const prefix = bytes.subarray(0, bytesRead);
    const newline = prefix.lastIndexOf(10);
    if (newline < 0) throw Error("Native session header unavailable");
    // OMP can put its fixed-width title slot before the session header.
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
    header.type !== "session" ||
    header.id !== resume.sessionId ||
    typeof header.cwd !== "string" ||
    (await realpath(header.cwd)) !== cwd
  )
    throw Error("Native session header identity conflict");
  const manager = await SessionManager.open(file, directory, undefined, {
    initialCwd: cwd,
    throwIfMissing: true,
    suppressBreadcrumb: true,
  });
  if (
    manager.getSessionId() !== resume.sessionId ||
    manager.getSessionFile() !== file ||
    (await realpath(manager.getCwd())) !== (await realpath(cwd))
  ) {
    await manager.close();
    throw Error("Recovered native session identity conflict");
  }
  return manager;
}
