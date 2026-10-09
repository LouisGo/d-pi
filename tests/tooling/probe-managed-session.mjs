import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { managedSessionManager } from "../../runtime/managed-session.mjs";

const root = await realpath(
  await mkdtemp(join(tmpdir(), "d-pi-empty-session-")),
);
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
const { SessionManager } = await import(
  "@oh-my-pi/pi-coding-agent/session/session-manager"
);
const cwd = join(root, "project"),
  directory = join(root, "sessions");
await mkdir(cwd);
await mkdir(directory);
let manager;
try {
  manager = await managedSessionManager(SessionManager, {
    cwd,
    directory,
    resume: null,
  });
  const resume = {
    sessionFile: manager.getSessionFile(),
    sessionId: manager.getSessionId(),
  };
  assert.ok(resume.sessionFile);
  assert.match(
    await readFile(resume.sessionFile, "utf8"),
    new RegExp(resume.sessionId),
  );
  await manager.close();
  manager = await managedSessionManager(SessionManager, {
    cwd,
    directory,
    resume,
  });
  assert.equal(manager.getSessionId(), resume.sessionId);
  assert.equal(manager.getSessionFile(), resume.sessionFile);
  assert.equal(
    manager.getBranch().filter((e) => e.type === "message").length,
    0,
  );
  manager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "persisted question" }],
    timestamp: Date.now(),
  });
  await manager.flush();
  await manager.close();
  manager = await managedSessionManager(SessionManager, {
    cwd,
    directory,
    resume,
  });
  assert.ok(
    manager
      .getBranch()
      .some(
        (e) =>
          e.type === "message" &&
          e.message.content[0].text === "persisted question",
      ),
  );
  await manager.close();
  const before = await readFile(resume.sessionFile, "utf8");
  await assert.rejects(
    managedSessionManager(SessionManager, {
      cwd,
      directory,
      resume: { ...resume, sessionId: "other" },
    }),
  );
  assert.equal(await readFile(resume.sessionFile, "utf8"), before);
  await rm(resume.sessionFile);
  await assert.rejects(
    managedSessionManager(SessionManager, { cwd, directory, resume }),
  );
  await assert.rejects(
    managedSessionManager(SessionManager, { cwd, directory, resume }),
  );
  const blocked = join(root, "blocked");
  await writeFile(blocked, "not a directory");
  await assert.rejects(
    managedSessionManager(SessionManager, {
      cwd,
      directory: blocked,
      resume: null,
    }),
  );
  console.log(
    "PASS empty restart, message restart, identity conflict, missing history/retry, persistence failure",
  );
} finally {
  await manager?.close();
  await rm(root, { recursive: true, force: true });
}
