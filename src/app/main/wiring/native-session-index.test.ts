import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { AppStorage } from "./app-storage";
import { DesktopCommandService } from "./desktop-command-service";
import { NativeSessionIndex } from "./native-session-index";

const fixtures: { root: string; store: AppStorage }[] = [];
afterEach(() => {
  for (const { root, store } of fixtures.splice(0)) {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), "dpi-native-index-"));
  const store = AppStorage.open(join(root, "app.sqlite"));
  fixtures.push({ root, store });
  const project = join(root, "project"),
    sessions = join(root, "sessions");
  mkdirSync(project);
  mkdirSync(join(sessions, "bucket"), { recursive: true });
  const file = join(sessions, "bucket", "session.jsonl"),
    id = crypto.randomUUID();
  const contents = `${JSON.stringify({ type: "title", title: "Original CLI conversation" })}\n${JSON.stringify({ type: "session", version: 3, id, cwd: project })}\n${JSON.stringify({ type: "message", id: "m1", parentId: null, message: { role: "user", content: "Hello original" } })}\n`;
  writeFileSync(file, contents);
  const index = new NativeSessionIndex(store.threads, async () => sessions);
  return { root, store, project, sessions, file, id, contents, index };
}
it("automatically restores CLI sessions into stable project Threads without changing native content or execution trust", async () => {
  const f = setup();
  const service = new DesktopCommandService(
    f.store,
    async () => null,
    (traceId) => f.index.reconcile(traceId),
  );
  const reply = await service.execute({
    kind: "restore",
    traceId: crypto.randomUUID(),
  });
  expect(reply.kind).toBe("ready");
  if (reply.kind !== "ready" || !reply.draft) throw Error("empty startup");
  const first = reply.draft;
  expect(first.directory).toBe(f.project);
  expect(f.store.threads.list()).toEqual([
    {
      threadId: first.threadId,
      workingDirectoryId: first.workingDirectoryId,
      directory: f.project,
      title: "Original CLI conversation",
      origin: "cli",
    },
  ]);
  expect(f.store.threads.nativeSessionBinding(first.threadId)).toMatchObject({
    sessionId: f.id,
    sessionFile: f.file,
    historyRoot: f.sessions,
    origin: "cli",
  });
  expect(f.store.threads.executionGrant(first.workingDirectoryId)).toBeNull();
  await service.execute({ kind: "list-threads", traceId: crypto.randomUUID() });
  expect(f.store.threads.list()).toHaveLength(1);
  expect(readFileSync(f.file, "utf8")).toBe(f.contents);
  f.store.drafts.save(first.threadId, 0, "unsent draft");
  f.store.threads.create(f.project);
  const selected = f.store.threads.activeThread();
  await f.index.reconcile(crypto.randomUUID(), true);
  expect(f.store.threads.activeThread()).toEqual(selected);
  expect(f.store.drafts.read(first.threadId).text).toBe("unsent draft");
});
it("deduplicates already bound native identity and persists indexed identities across restart", async () => {
  const f = setup();
  const own = f.store.threads.create(f.project);
  f.store.threads.bindNativeSession({
    threadId: own.threadId,
    sessionId: f.id,
    sessionFile: f.file,
    configContextId: "existing",
  });
  await f.index.reconcile(crypto.randomUUID());
  expect(f.store.threads.list()).toHaveLength(1);
  expect(f.store.threads.nativeSessionBinding(own.threadId)).toEqual({
    threadId: own.threadId,
    sessionId: f.id,
    sessionFile: f.file,
    configContextId: "existing",
  });
});
it("keeps previous indexed sessions when discovery fails and distinguishes partial or unavailable catalog from empty", async () => {
  const f = setup();
  await f.index.reconcile(crypto.randomUUID());
  const first = f.store.threads.activeThread();
  rmSync(f.sessions, { recursive: true });
  expect(await f.index.reconcile(crypto.randomUUID(), true)).toBe(
    "unavailable",
  );
  expect(f.store.threads.activeThread()).toEqual(first);
  expect(f.store.threads.list()).toHaveLength(1);
});
it("retains indexed associations and draft through an actual database reopen and does not duplicate rescans", async () => {
  const f = setup();
  await f.index.reconcile(crypto.randomUUID());
  const first = f.store.threads.activeThread()!;
  const binding = f.store.threads.nativeSessionBinding(first.threadId);
  f.store.drafts.save(first.threadId, 0, "cold draft");
  f.store.close();
  const reopened = AppStorage.open(join(f.root, "app.sqlite"));
  fixtures[fixtures.length - 1]!.store = reopened;
  const index = new NativeSessionIndex(
    reopened.threads,
    async () => f.sessions,
  );
  await index.reconcile(crypto.randomUUID());
  expect(reopened.threads.list()).toHaveLength(1);
  expect(reopened.threads.activeThread()).toEqual(first);
  expect(reopened.threads.nativeSessionBinding(first.threadId)).toEqual(
    binding,
  );
  expect(reopened.drafts.active()?.text).toBe("cold draft");
});
it("shares simultaneous restore/list discovery, caches briefly, refreshes new sessions and reports malformed files as partial", async () => {
  const f = setup();
  let calls = 0;
  const index = new NativeSessionIndex(f.store.threads, async () => {
    calls++;
    return f.sessions;
  });
  await Promise.all([
    index.reconcile(crypto.randomUUID()),
    index.reconcile(crypto.randomUUID()),
  ]);
  expect(calls).toBe(1);
  await index.reconcile(crypto.randomUUID());
  expect(calls).toBe(1);
  writeFileSync(join(f.sessions, "bucket", "bad.jsonl"), "bad header\n");
  writeFileSync(
    join(f.sessions, "bucket", "second.jsonl"),
    `${JSON.stringify({ type: "session", version: 3, id: crypto.randomUUID(), cwd: f.project })}\n`,
  );
  expect(await index.reconcile(crypto.randomUUID(), true)).toBe("partial");
  expect(calls).toBe(2);
  expect(f.store.threads.list()).toHaveLength(2);
  expect(
    new Set(f.store.threads.list().map((t) => t.workingDirectoryId)).size,
  ).toBe(1);
});
it("creates separate project groups from actual cwd without changing existing active selection", async () => {
  const f = setup();
  const active = f.store.threads.create(f.project);
  const other = join(f.root, "other-worktree");
  mkdirSync(other);
  writeFileSync(
    join(f.sessions, "bucket", "other.jsonl"),
    `${JSON.stringify({ type: "session", version: 3, id: crypto.randomUUID(), cwd: other })}\n`,
  );
  await f.index.reconcile(crypto.randomUUID());
  expect(f.store.threads.activeThread()).toEqual(active);
  expect(f.store.threads.list()).toHaveLength(3);
  expect(new Set(f.store.threads.list().map((t) => t.directory))).toEqual(
    new Set([f.project, other]),
  );
});

it("opens existing chats without waiting for native discovery or blocking a Thread switch", async () => {
  const f = setup();
  const a = f.store.threads.create(f.project);
  const b = f.store.threads.create(f.project);
  let finish: ((value: "ready") => void) | undefined;
  const scan = new Promise<"ready">((resolve) => {
    finish = resolve;
  });
  const service = new DesktopCommandService(
    f.store,
    async () => null,
    () => scan,
  );
  const restore = service.execute({
    kind: "restore",
    traceId: crypto.randomUUID(),
  });
  const restored = await Promise.race([
    restore,
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 30)),
  ]);
  expect(restored).not.toBe("blocked");
  const switched = await Promise.race([
    service.execute({
      kind: "select-thread",
      traceId: crypto.randomUUID(),
      threadId: a.threadId,
    }),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 30)),
  ]);
  expect(switched).not.toBe("blocked");
  expect(f.store.threads.activeThread()?.threadId).toBe(a.threadId);
  expect(b.threadId).not.toBe(a.threadId);
  finish?.("ready");
  await restore;
});
it("indexes older projects beyond the first 200 native sessions", async () => {
  const f = setup();
  for (let n = 0; n < 201; n++) {
    const project = join(f.root, `project-${n}`);
    mkdirSync(project);
    writeFileSync(
      join(
        f.sessions,
        "bucket",
        `extra-${n.toString().padStart(3, "0")}.jsonl`,
      ),
      `${JSON.stringify({ type: "session", version: 3, id: crypto.randomUUID(), cwd: project })}\n`,
    );
  }
  await f.index.reconcile(crypto.randomUUID());
  expect(f.store.threads.list()).toHaveLength(202);
  expect(
    f.store.threads
      .list()
      .some((thread) => thread.directory === join(f.root, "project-200")),
  ).toBe(true);
});
it("advances a global scan past 4096 files instead of rescanning its first page", async () => {
  const f = setup();
  for (let n = 0; n < 4097; n++) {
    writeFileSync(
      join(
        f.sessions,
        "bucket",
        `extra-${n.toString().padStart(4, "0")}.jsonl`,
      ),
      `${JSON.stringify({ type: "session", version: 3, id: `session-${n}`, cwd: f.project })}\n`,
    );
  }
  expect(await f.index.reconcile(crypto.randomUUID())).toBe("indexing");
  expect(f.store.threads.list()).toHaveLength(4096);
  expect(await f.index.reconcile(crypto.randomUUID())).toBe("ready");
  expect(f.store.threads.list()).toHaveLength(4098);
}, 30000);
it("continues beyond 256 project buckets in the next bounded scan", async () => {
  const f = setup();
  for (let n = 0; n < 257; n++) {
    const bucket = join(f.sessions, `bucket-${n.toString().padStart(3, "0")}`);
    mkdirSync(bucket);
    writeFileSync(
      join(bucket, "session.jsonl"),
      `${JSON.stringify({ type: "session", version: 3, id: `bucket-session-${n}`, cwd: f.project })}\n`,
    );
  }
  expect(await f.index.reconcile(crypto.randomUUID())).toBe("indexing");
  expect(f.store.threads.list()).toHaveLength(256);
  expect(await f.index.reconcile(crypto.randomUUID())).toBe("ready");
  expect(f.store.threads.list()).toHaveLength(258);
});
it("discovers preserved native history after the original worktree has been deleted", async () => {
  const f = setup();
  rmSync(f.project, { recursive: true });
  const service = new DesktopCommandService(
    f.store,
    async () => null,
    (traceId) => f.index.reconcile(traceId),
  );
  const reply = await service.execute({
    kind: "restore",
    traceId: crypto.randomUUID(),
  });
  expect(reply).toMatchObject({
    kind: "ready",
    directoryAvailable: false,
    draft: { directory: f.project, origin: "cli" },
  });
  expect(f.store.threads.list()).toHaveLength(1);
  expect(
    f.store.threads.nativeSessionBinding(f.store.threads.list()[0]!.threadId)
      ?.sessionFile,
  ).toBe(f.file);
  expect(
    f.store.threads.executionGrant(
      f.store.threads.list()[0]!.workingDirectoryId,
    ),
  ).toBeNull();
});
