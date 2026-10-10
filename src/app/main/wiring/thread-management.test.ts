import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AppStorage } from "./app-storage";

it("persists names and completion independently of discovery and retains deleted native identities", () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-thread-management-"));
  const path = join(root, "app.sqlite");
  let store = AppStorage.open(path);
  try {
    const thread = store.threads.create(root);
    store.threads.rename(thread.threadId, "Renamed");
    store.threads.complete(thread.threadId, true);
    store.close();
    store = AppStorage.open(path);
    expect(store.threads.threadContext(thread.threadId)).toMatchObject({
      title: "Renamed",
      completed: true,
    });
    store.threads.complete(thread.threadId, false);
    store.threads.bindNativeSession({
      threadId: thread.threadId,
      configContextId: "config",
      sessionId: "native-id",
      sessionFile: join(root, "original.jsonl"),
    });
    store.threads.beginDeletion(thread.threadId);
    store.threads.finishDeletion(thread.threadId);
    expect(store.threads.list()).toEqual([]);
    expect(store.threads.activeThread()).toBeNull();
    store.threads.reconcileNativeSessions([
      {
        directory: root,
        path: join(root, "original.jsonl"),
        sessionId: "native-id",
        historyRoot: root,
        title: "Old",
        modifiedAt: 1,
        key: "config",
      },
    ]);
    expect(store.threads.list()).toEqual([]);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("keeps failed deletion readable and resumes the explicit intent after reopening", async () => {
  const { ThreadCommandService } = await import("./thread-command-service");
  const root = mkdtempSync(join(tmpdir(), "d-pi-thread-delete-"));
  const path = join(root, "app.sqlite");
  let store = AppStorage.open(path);
  try {
    const thread = store.threads.create(root);
    store.threads.bindNativeSession({
      threadId: thread.threadId,
      configContextId: "config",
      sessionId: "native",
      sessionFile: join(root, "history.jsonl"),
    });
    const failing = new ThreadCommandService(
      store,
      {
        execute: async () => {
          throw Error("Native delete failed");
        },
      },
      async (_id, operation) => operation(),
    );
    await expect(
      failing.execute(thread.threadId, { kind: "delete" }),
    ).rejects.toThrow();
    expect(store.threads.threadContext(thread.threadId)).toMatchObject({
      threadId: thread.threadId,
    });
    store.close();
    store = AppStorage.open(path);
    let retried = false;
    const service = new ThreadCommandService(
      store,
      {
        execute: async (_kind, _thread, _binding, _destination, retry) => {
          retried = !!retry;
          return { kind: "deleted" };
        },
      },
      async (_id, operation) => operation(),
    );
    await service.execute(thread.threadId, { kind: "delete" });
    expect(retried).toBe(true);
    expect(store.threads.list()).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("records the native fork and parent atomically, and refuses destructive commands when the runtime is occupied", async () => {
  const { ThreadCommandService } = await import("./thread-command-service");
  const root = mkdtempSync(join(tmpdir(), "d-pi-thread-fork-"));
  const store = AppStorage.open(join(root, "app.sqlite"));
  try {
    const source = store.threads.create(root);
    store.threads.bindNativeSession({
      threadId: source.threadId,
      configContextId: "config",
      sessionId: "original",
      sessionFile: join(root, "original.jsonl"),
    });
    let calls = 0;
    const history = {
      execute: async () => {
        calls++;
        return {
          kind: "forked" as const,
          file: join(root, "fork.jsonl"),
          sessionId: "fork",
        };
      },
    };
    const blocked = new ThreadCommandService(store, history, async () => {
      throw Error("Occupied");
    });
    await expect(
      blocked.execute(source.threadId, { kind: "delete" }),
    ).rejects.toThrow("Occupied");
    expect(calls).toBe(0);
    expect(store.threads.deletionPending(source.threadId)).toBe(false);
    const service = new ThreadCommandService(
      store,
      history,
      async (_id, operation) => operation(),
    );
    const fork = await service.execute(source.threadId, { kind: "fork" });
    expect(fork).toMatchObject({
      parentThreadId: source.threadId,
      directory: root,
    });
    expect(fork?.threadId).not.toBe(source.threadId);
    expect(
      store.threads.nativeSessionBinding(fork?.threadId ?? ""),
    ).toMatchObject({
      sessionId: "fork",
      sessionFile: join(root, "fork.jsonl"),
    });
    expect(store.threads.nativeSessionBinding(source.threadId)?.sessionId).toBe(
      "original",
    );
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("retains the intended fork destination and source identity across a lost native result without replaying fork", async () => {
  const { ThreadCommandService } = await import("./thread-command-service");
  const root = mkdtempSync(join(tmpdir(), "d-pi-fork-journal-"));
  const path = join(root, "app.sqlite");
  let store = AppStorage.open(path);
  try {
    const source = store.threads.create(root);
    store.threads.bindNativeSession({
      threadId: source.threadId,
      configContextId: "fixture",
      sessionId: "source-native",
      sessionFile: join(root, "source.jsonl"),
    });
    let calls = 0;
    const commands = new ThreadCommandService(
      store,
      {
        execute: async () => {
          calls++;
          expect(store.threads.pendingForks()).toHaveLength(1);
          throw Error("Lost result");
        },
      },
      async (_id, run) => run(),
    );
    await expect(
      commands.execute(source.threadId, { kind: "fork" }),
    ).rejects.toThrow("Lost result");
    const [intent] = store.threads.pendingForks();
    expect(intent).toMatchObject({
      parentThreadId: source.threadId,
      sessionId: "source-native",
    });
    store.close();
    store = AppStorage.open(path);
    expect(store.threads.pendingForks()).toEqual([intent]);
    expect(store.threads.list()).toHaveLength(1);
    expect(calls).toBe(1);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
