import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import type { DiagnosticEvent } from "../../../platform/main/diagnostics/public";
import { AppStorage } from "../wiring/app-storage";
import type { ProjectReadContext } from "./context";
import {
  ProjectReadOperations,
  registerFilesIpc,
  registerGitIpc,
  registerHistoryIpc,
} from "./project-reads";

const reads = vi.hoisted(() => ({
  listFiles: vi.fn(),
  readFile: vi.fn(),
  listGit: vi.fn(),
  readGit: vi.fn(),
}));
vi.mock("../../../modules/files/main/public", () => ({
  listProjectFiles: reads.listFiles,
  readProjectFile: reads.readFile,
}));
vi.mock("../../../modules/changes/main/public", () => ({
  listGitChanges: reads.listGit,
  readGitChange: reads.readGit,
}));
const stores: { store: AppStorage; directory: string }[] = [];
afterEach(() => {
  for (const { store, directory } of stores.splice(0)) {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

function setup() {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-read-diagnostics-"));
  const store = AppStorage.open(join(directory, "app.sqlite"));
  stores.push({ store, directory });
  const thread = store.threads.create("/fixture");
  const events: DiagnosticEvent[] = [];
  const diagnostics = {
    processInstanceId: crypto.randomUUID(),
    record: (event: DiagnosticEvent) => events.push(event),
  };
  const handle = vi.fn<IpcMain["handle"]>();
  const context: ProjectReadContext = {
    ipcMain: { handle },
    sourceValid: () => true,
    reads: new ProjectReadOperations(),
    gitReader: {
      list: reads.listGit,
      diff: reads.readGit,
      close: async () => {},
      snapshot: () => ({
        active: 0,
        queued: 0,
        peakActive: 0,
        peakQueued: 0,
        spawned: 0,
      }),
    },
    getStore: () => store,
    getDiagnostics: () => diagnostics,
    nativeSessionsPath: () => "/fixture-sessions",
    projectNativeSessionsPath: async () => "/fixture-native-sessions",
  };
  registerHistoryIpc(context);
  registerFilesIpc(context);
  registerGitIpc(context);
  return {
    thread,
    context,
    store,
    events,
    request: (channel: string, raw: unknown, senderId = 1) => {
      const handler = handle.mock.calls.find(([name]) => name === channel)?.[1];
      if (!handler) throw Error("Missing handler");
      return handler(
        {
          sender: { id: senderId },
          senderFrame: { processId: 11, routingId: 22 },
        } as IpcMainInvokeEvent,
        raw,
      );
    },
  };
}

it.each(["files", "git"] as const)(
  "records %s received while I/O is pending and a bounded terminal after it settles",
  async (domain) => {
    const fixture = setup();
    let finish: (value: unknown) => void = () => {};
    const wait = new Promise((resolve) => {
      finish = resolve;
    });
    (domain === "files" ? reads.listFiles : reads.listGit).mockReturnValueOnce(
      wait,
    );
    const traceId = crypto.randomUUID();
    const raw = {
      kind: "list",
      threadId: fixture.thread.threadId,
      traceId,
      operationId: crypto.randomUUID(),
      ...(domain === "files" ? { path: "" } : {}),
    };
    const result = fixture.request(`${domain}:request`, raw);
    expect(fixture.events).toHaveLength(1);
    expect(fixture.events[0]).toMatchObject({
      traceId,
      threadId: fixture.thread.threadId,
      operation: `${domain}:list`,
      stage: "received",
    });
    finish({ kind: "unavailable", reason: "missing" });
    await expect(result).resolves.toMatchObject({
      kind: "completed",
      reply: { kind: "unavailable", reason: "missing" },
    });
    expect(fixture.events[1]).toMatchObject({
      traceId,
      requestId: fixture.events[0]?.requestId,
      stage: "failed",
      code: "missing",
      durationMs: expect.any(Number),
    });
    expect(fixture.events[1]?.durationMs).toBeGreaterThanOrEqual(0);
  },
);

it("records a thrown sampling error as failure and preserves the original cause", async () => {
  const fixture = setup();
  const cause = Error("PRIVATE FILE BODY");
  reads.readFile.mockRejectedValueOnce(cause);
  const result = fixture.request("files:request", {
    kind: "read",
    operationId: crypto.randomUUID(),
    threadId: fixture.thread.threadId,
    traceId: crypto.randomUUID(),
    path: "sample.txt",
  });
  await expect(result).resolves.toMatchObject({
    kind: "failed",
    error: { code: "failed", attribution: "unknown" },
  });
  expect(fixture.events.map((event) => event.stage)).toEqual([
    "received",
    "failed",
  ]);
  expect(fixture.events[1]).toMatchObject({
    code: "failed",
    durationMs: expect.any(Number),
  });
  expect(JSON.stringify(fixture.events)).not.toContain("PRIVATE FILE BODY");
});

it("rejects foreign CLI history and rechecks the active Thread after configuration source resolution", async () => {
  const fixture = setup();
  const foreign = fixture.store.threads.create("/foreign");
  await expect(
    fixture.request("history:project", {
      kind: "list",
      threadId: fixture.thread.threadId,
      traceId: crypto.randomUUID(),
    }),
  ).rejects.toThrow("Foreign Thread");
  let resolveRoot: (root: string) => void = () => {};
  const source = new Promise<string>((resolve) => {
    resolveRoot = resolve;
  });
  fixture.context.projectNativeSessionsPath = () => source;
  const read = fixture.request("history:project", {
    kind: "list",
    threadId: foreign.threadId,
    traceId: crypto.randomUUID(),
  });
  fixture.store.threads.create("/third");
  resolveRoot("/unused");
  await expect(read).rejects.toThrow("Foreign Thread");
  expect(fixture.events.at(-1)).toMatchObject({
    operation: "history:project-list",
    stage: "failed",
  });
});

it("cancels only the owning sender's operation even after navigation changed the active Thread", async () => {
  const fixture = setup();
  let signal: AbortSignal | undefined;
  reads.listFiles.mockImplementationOnce((_root, _path, inputSignal) => {
    signal = inputSignal;
    return new Promise((resolve) =>
      inputSignal.addEventListener(
        "abort",
        () => resolve({ kind: "unavailable", reason: "missing" }),
        { once: true },
      ),
    );
  });
  const identity = {
    traceId: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
  };
  const pending = fixture.request("files:request", {
    kind: "list",
    path: "",
    threadId: fixture.thread.threadId,
    ...identity,
  });
  await vi.waitFor(() => expect(signal).toBeDefined());
  fixture.store.threads.create("/other");
  await fixture.request("files:cancel", identity, 2);
  expect(signal?.aborted).toBe(false);
  await fixture.request("files:cancel", identity);
  await expect(pending).resolves.toMatchObject({
    kind: "cancelled",
    ...identity,
  });
  expect(signal?.aborted).toBe(true);
  expect(fixture.context.reads?.size).toBe(0);
});

it("retains operation admission through overall deadline until in-flight resource cleanup finishes", async () => {
  const event = {
    sender: { id: 1 },
    senderFrame: { processId: 11, routingId: 22 },
  } as IpcMainInvokeEvent;
  const operations = new ProjectReadOperations({
    maxOperations: 1,
    maxPerSender: 1,
    timeoutMs: 20,
  });
  let signal: AbortSignal | undefined;
  let finish: (() => void) | undefined;
  const identity = {
    operationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
  };
  const pending = operations.run(event, identity, async (value) => {
    signal = value;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { kind: "unavailable", reason: "missing" };
  });
  await vi.waitFor(() => expect(signal?.aborted).toBe(true));
  expect(operations.size).toBe(1);
  await expect(
    operations.run(
      event,
      { operationId: crypto.randomUUID(), traceId: crypto.randomUUID() },
      async () => "unused",
    ),
  ).resolves.toMatchObject({
    kind: "failed",
    error: { code: "busy", retryable: false },
  });
  finish?.();
  await expect(pending).resolves.toMatchObject({
    kind: "failed",
    error: { ...identity, code: "timeout", retryable: true },
  });
  expect(operations.size).toBe(0);
  await operations.close();
});

it("rejects untrusted starts before filesystem work and duplicate starts before a second sample", async () => {
  const fixture = setup();
  const command = {
    kind: "list",
    path: "",
    threadId: fixture.thread.threadId,
    operationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
  };
  fixture.context.sourceValid = () => false;
  await expect(
    fixture.request("files:request", command),
  ).resolves.toMatchObject({
    kind: "failed",
    error: { code: "invalid-source", retryable: false },
  });
  expect(reads.listFiles).not.toHaveBeenCalled();
  fixture.context.sourceValid = () => true;
  reads.listFiles.mockImplementationOnce(
    (_root, _path, signal) =>
      new Promise((resolve) =>
        signal.addEventListener(
          "abort",
          () => resolve({ kind: "unavailable", reason: "missing" }),
          { once: true },
        ),
      ),
  );
  const first = fixture.request("files:request", command);
  await expect(
    fixture.request("files:request", command),
  ).resolves.toMatchObject({
    kind: "failed",
    error: { code: "duplicate-operation", retryable: false },
  });
  expect(reads.listFiles).toHaveBeenCalledTimes(1);
  await fixture.request("files:cancel", {
    operationId: command.operationId,
    traceId: command.traceId,
  });
  await expect(first).resolves.toMatchObject({ kind: "cancelled" });
});

it("bounds each sender and all owners, and releasing one sender leaves the other alive", async () => {
  const operations = new ProjectReadOperations({
    maxOperations: 2,
    maxPerSender: 1,
    timeoutMs: 1000,
  });
  const event = (id: number, frame = 1) =>
    ({
      sender: { id },
      senderFrame: { processId: id, routingId: frame },
    }) as IpcMainInvokeEvent;
  const identity = () => ({
    operationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
  });
  const firstId = identity();
  const secondId = identity();
  const signals: AbortSignal[] = [];
  const sample = (signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<string>((resolve) =>
      signal.addEventListener("abort", () => resolve("cancelled"), {
        once: true,
      }),
    );
  };
  const one = operations.run(event(1), firstId, sample);
  await expect(
    operations.run(event(1), identity(), sample),
  ).resolves.toMatchObject({ kind: "failed", error: { code: "busy" } });
  const two = operations.run(event(2), secondId, sample);
  await expect(
    operations.run(event(3), identity(), sample),
  ).resolves.toMatchObject({ kind: "failed", error: { code: "busy" } });
  operations.cancel(event(1, 2), firstId);
  expect(signals[0]?.aborted).toBe(false);
  operations.releaseSender(1);
  await expect(one).resolves.toMatchObject({ kind: "cancelled" });
  expect(signals[1]?.aborted).toBe(false);
  expect(operations.size).toBe(1);
  await operations.close();
  await expect(two).resolves.toMatchObject({ kind: "cancelled" });
  expect(operations.size).toBe(0);
  await expect(
    operations.run(event(1), identity(), sample),
  ).resolves.toMatchObject({
    kind: "failed",
    error: { code: "owner-released", retryable: false },
  });
});

it("reads indexed original CLI history only under the currently configured root and exact project binding", async () => {
  const f = setup();
  const sessions = join(stores[stores.length - 1]!.directory, "sessions");
  const project = join(stores[stores.length - 1]!.directory, "project");
  mkdirSync(project);
  mkdirSync(join(sessions, "bucket"), { recursive: true });
  const file = join(sessions, "bucket", "original.jsonl");
  const sessionId = crypto.randomUUID();
  writeFileSync(
    file,
    `${JSON.stringify({ type: "session", version: 3, id: sessionId, cwd: project })}\n${JSON.stringify({ type: "message", id: "m", parentId: null, message: { role: "user", content: "original record" } })}\n`,
  );
  f.store.threads.reconcileNativeSessions([
    {
      directory: project,
      path: file,
      sessionId,
      historyRoot: sessions,
      title: "CLI",
      modifiedAt: 1,
      key: "key",
    },
  ]);
  const indexed = f.store.threads.list().find((t) => t.origin === "cli")!;
  f.store.threads.select(indexed.threadId);
  f.context.indexedNativeSessionsPath = async () => sessions;
  expect(
    await f.request("history:read", {
      threadId: indexed.threadId,
      cursor: null,
    }),
  ).toMatchObject({ kind: "page", entries: [{ text: "original record" }] });
  f.context.indexedNativeSessionsPath = async () => join(sessions, "other");
  expect(
    await f.request("history:read", {
      threadId: indexed.threadId,
      cursor: null,
    }),
  ).toMatchObject({ kind: "unavailable", reason: "denied" });
  f.context.indexedNativeSessionsPath = async () => sessions;
  writeFileSync(
    file,
    `${JSON.stringify({ type: "session", version: 3, id: sessionId, cwd: stores[stores.length - 1]!.directory })}\n`,
  );
  expect(
    await f.request("history:read", {
      threadId: indexed.threadId,
      cursor: null,
    }),
  ).toMatchObject({ kind: "unavailable", reason: "denied" });
});
