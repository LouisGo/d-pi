import { EventEmitter } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { HostCommandSchema } from "../features/runtime/host-contracts";
import { SubmissionIdSchema } from "../features/submission/contracts";
import { TraceIdSchema } from "../shared/identity";
import { RuntimeService } from "./runtime-service";
import { AppStorage } from "./storage/app-storage";

const electron = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("electron", () => ({ utilityProcess: { fork: electron.fork } }));
vi.mock("./runtime-resource", async (original) => ({
  ...(await original<typeof import("./runtime-resource")>()),
  managedRuntime: async () => "/fixture/omp",
}));
vi.mock("./sdk-resource", () => ({
  managedSdkRuntime: async () => ({
    binary: "/fixture/bun",
    entry: "/fixture/host.mjs",
  }),
}));
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

async function running(
  withoutDraft = false,
  busyAfterReady = false,
  failFirstFork = false,
) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "d-pi-runtime-service-")),
  );
  const project = join(root, "project");
  mkdirSync(project);
  const store = new AppStorage(join(root, "app.sqlite"));
  const draft = store.drafts.create(project);
  store.drafts.save(draft.threadId, 0, "A");
  const host = new EventEmitter();
  const postMessage = vi.fn((raw: unknown) => {
    const command = HostCommandSchema.parse(raw);
    if (command.kind === "start")
      queueMicrotask(() => {
        host.emit("message", {
          kind: "ready",
          processInstanceId: command.processInstanceId,
          connectionGeneration: command.connectionGeneration,
          state: {
            sessionId: "native",
            sessionFile: join(root, "native.jsonl"),
            model: { id: "model", provider: "fixture" },
            isStreaming: false,
            isCompacting: false,
            queuedMessageCount: 0,
          },
        });
        if (busyAfterReady)
          host.emit("message", {
            kind: "state",
            busy: true,
            pendingInteraction: false,
            state: {
              sessionId: "native",
              sessionFile: join(root, "native.jsonl"),
              model: { id: "model", provider: "fixture" },
              isStreaming: true,
              isCompacting: false,
              queuedMessageCount: 0,
            },
          });
      });
  });
  electron.fork.mockReturnValue(Object.assign(host, { postMessage }));
  if (failFirstFork)
    electron.fork.mockImplementationOnce(() => {
      throw Error("fork failed");
    });
  if (withoutDraft) {
    vi.spyOn(store.drafts, "active").mockImplementation(() => {
      throw Error("Draft unavailable");
    });
    vi.spyOn(store.drafts, "read").mockImplementation(() => {
      throw Error("Draft unavailable");
    });
  }
  const runtime = new RuntimeService(store, root, root, {}, () => {});
  const act = (kind: "allow" | "start" | "revoke" | "inspect") =>
    runtime.execute({
      kind,
      threadId: draft.threadId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
    });
  cleanup.push(() => {
    host.emit("exit");
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  await act("allow");
  await act("start");
  const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
  const prepare = () =>
    runtime.submit({
      kind: "prepare",
      threadId: draft.threadId,
      submissionId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
      revision: 1,
      text: "A",
    });
  const dispatch = () =>
    runtime.submit({
      kind: "dispatch",
      threadId: draft.threadId,
      submissionId,
    });
  return {
    root,
    project,
    store,
    draft,
    runtime,
    act,
    prepare,
    dispatch,
    postMessage,
    host,
  };
}

it("never dispatches to the old instance after replacing and reauthorizing its directory", async () => {
  const fixture = await running();
  renameSync(fixture.project, join(fixture.root, "old-project"));
  mkdirSync(fixture.project);
  await expect(fixture.prepare()).rejects.toThrow();
  await fixture.act("allow");
  await expect(fixture.prepare()).rejects.toThrow();
  expect(
    fixture.postMessage.mock.calls.filter(
      ([raw]) => HostCommandSchema.parse(raw).kind === "dispatch",
    ),
  ).toHaveLength(0);
  expect(fixture.runtime.hasActiveWork()).toBe(false);
});

it("a prepared submission cannot cross the instance directory boundary even if a new grant exists", async () => {
  const fixture = await running();
  expect(await fixture.prepare()).toMatchObject({
    kind: "receipt",
    receipt: { state: "prepared" },
  });
  renameSync(fixture.project, join(fixture.root, "old-project"));
  mkdirSync(fixture.project);
  const { identifyDirectory } = await import("../shared/node/directory");
  fixture.store.threads.grantExecution({
    ...(await identifyDirectory(fixture.project)),
    workspaceId: fixture.draft.workspaceId,
  });
  await expect(fixture.dispatch()).rejects.toThrow();
  expect(
    fixture.postMessage.mock.calls.filter(
      ([raw]) => HostCommandSchema.parse(raw).kind === "dispatch",
    ),
  ).toHaveLength(0);
});

it("regranting the unchanged directory preserves normal submission and idle shutdown", async () => {
  const fixture = await running();
  await fixture.act("revoke");
  expect(await fixture.act("allow")).toMatchObject({
    trusted: true,
    phase: "ready",
    busy: false,
  });
  expect(fixture.runtime.hasActiveWork()).toBe(false);
  expect(await fixture.prepare()).toMatchObject({
    kind: "receipt",
    receipt: { state: "prepared" },
  });
  expect(await fixture.dispatch()).toMatchObject({
    kind: "receipt",
    receipt: { state: "dispatching" },
  });
  expect(
    fixture.postMessage.mock.calls.filter(
      ([raw]) => HostCommandSchema.parse(raw).kind === "dispatch",
    ),
  ).toHaveLength(1);
});

it("execution admission and inspection do not require loading a draft body", async () => {
  const fixture = await running(true);
  expect(await fixture.act("inspect")).toMatchObject({
    phase: "ready",
    trusted: true,
  });
  await fixture.act("revoke");
  expect(await fixture.act("allow")).toMatchObject({
    phase: "ready",
    trusted: true,
  });
});

it("state observed immediately after ready is not overwritten by handshake completion", async () => {
  const fixture = await running(false, true);
  expect(await fixture.act("inspect")).toMatchObject({
    phase: "ready",
    busy: true,
  });
  expect(fixture.runtime.hasActiveWork()).toBe(true);
});

it("a fork failure before any Host exists still allows an explicit start retry", async () => {
  const fixture = await running(false, false, true);
  expect((await fixture.act("inspect")).phase).not.toBe("ready");
  await fixture.act("start");
  expect((await fixture.act("inspect")).phase).toBe("ready");
});

it("restart exposes the unproven execution lock and never substitutes a new session", async () => {
  const fixture = await running();
  const binding = fixture.store.threads.nativeSession(fixture.draft.threadId);
  const forks = electron.fork.mock.calls.length;
  const restored = new RuntimeService(
    fixture.store,
    fixture.root,
    fixture.root,
    {},
    () => {},
  );
  for (const kind of ["inspect", "allow", "start"] as const) {
    const view = await restored.execute({
      kind,
      threadId: fixture.draft.threadId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
    });
    expect(view.phase).toBe("interrupted");
    expect(view.message).toContain("无法确认原生会话的执行全周期独占");
  }
  expect(electron.fork.mock.calls).toHaveLength(forks);
  expect(fixture.store.threads.nativeSession(fixture.draft.threadId)).toEqual(
    binding,
  );
  expect(fixture.store.drafts.read(fixture.draft.threadId)?.text).toBe("A");
});

it("busy native sessions accept a frozen follow-up without an App auto-send queue", async () => {
  const fixture = await running(false, true);
  expect(await fixture.prepare()).toMatchObject({
    kind: "receipt",
    receipt: { state: "prepared" },
  });
  expect(await fixture.dispatch()).toMatchObject({
    kind: "receipt",
    receipt: { state: "dispatching" },
  });
  expect(
    fixture.postMessage.mock.calls.filter(
      ([raw]) => HostCommandSchema.parse(raw).kind === "dispatch",
    ),
  ).toHaveLength(1);
});

it("Host exit marks every in-flight queued submission unknown without replay", async () => {
  const fixture = await running();
  await fixture.prepare();
  await fixture.dispatch();
  fixture.store.drafts.save(fixture.draft.threadId, 1, "B");
  const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
  await fixture.runtime.submit({
    kind: "prepare",
    threadId: fixture.draft.threadId,
    submissionId,
    traceId: TraceIdSchema.parse(crypto.randomUUID()),
    revision: 2,
    text: "B",
  });
  await fixture.runtime.submit({
    kind: "dispatch",
    threadId: fixture.draft.threadId,
    submissionId,
  });
  const start = fixture.postMessage.mock.calls
    .map(([raw]) => HostCommandSchema.parse(raw))
    .find((c) => c.kind === "start");
  if (!start || start.kind !== "start") throw Error("Missing start");
  fixture.host.emit("message", {
    kind: "control",
    generation: start.connectionGeneration,
    state: {
      paused: true,
      stopping: false,
      streaming: false,
      compacting: false,
      queued: 1,
      queue: [],
      background: 0,
      pendingAsync: false,
      admitted: false,
    },
  });
  fixture.host.emit("message", {
    kind: "state",
    busy: false,
    pendingInteraction: false,
    state: {
      sessionId: "native",
      isStreaming: false,
      isCompacting: false,
      queuedMessageCount: 0,
    },
  });
  fixture.host.emit("exit");
  expect(
    fixture.store.submissions.list(fixture.draft.threadId).map((r) => r.state),
  ).toEqual(["unknown", "unknown"]);
  expect(
    fixture.postMessage.mock.calls.filter(
      ([raw]) => HostCommandSchema.parse(raw).kind === "dispatch",
    ),
  ).toHaveLength(2);
});

it("control and answers reject stale generations and revoked grants while allowing cancellation", async () => {
  const f = await running();
  const start = f.postMessage.mock.calls
    .map(([raw]) => HostCommandSchema.parse(raw))
    .find((c) => c.kind === "start");
  if (!start || start.kind !== "start") throw Error("start missing");
  const base = {
    threadId: f.draft.threadId,
    traceId: TraceIdSchema.parse(crypto.randomUUID()),
    generation: start.connectionGeneration,
  };
  await expect(
    f.runtime.execute({
      ...base,
      kind: "continue",
      generation: crypto.randomUUID(),
    }),
  ).rejects.toThrow("Stale control");
  await expect(
    f.runtime.execute({
      ...base,
      kind: "answer",
      generation: crypto.randomUUID(),
      id: "request",
      answer: { kind: "cancel" },
    }),
  ).rejects.toThrow("Stale answer");
  await f.act("revoke");
  await expect(
    f.runtime.execute({ ...base, kind: "continue" }),
  ).rejects.toThrow("Execution grant");
  await expect(
    f.runtime.execute({
      ...base,
      kind: "answer",
      id: "request",
      answer: { kind: "confirm", confirmed: true },
    }),
  ).rejects.toThrow("Execution grant");
  await f.runtime.execute({
    ...base,
    kind: "answer",
    id: "request",
    answer: { kind: "cancel" },
  });
  expect(
    f.postMessage.mock.calls.filter(
      ([raw]) => HostCommandSchema.parse(raw).kind === "answer",
    ),
  ).toHaveLength(1);
});

it("background-only work prevents quit even after a stale idle poll and ignores old control snapshots", async () => {
  const f = await running();
  const start = f.postMessage.mock.calls
    .map(([raw]) => HostCommandSchema.parse(raw))
    .find((c) => c.kind === "start");
  if (!start || start.kind !== "start") throw Error("start missing");
  const state = {
    paused: false,
    stopping: false,
    streaming: false,
    compacting: false,
    queued: 0,
    queue: [],
    background: 1,
    pendingAsync: false,
    admitted: false,
  };
  f.host.emit("message", {
    kind: "control",
    generation: start.connectionGeneration,
    state,
  });
  f.host.emit("message", {
    kind: "state",
    busy: false,
    pendingInteraction: false,
    state: {
      sessionId: "native",
      isStreaming: false,
      isCompacting: false,
      queuedMessageCount: 0,
    },
  });
  expect(f.runtime.hasActiveWork()).toBe(true);
  f.host.emit("message", {
    kind: "control",
    generation: crypto.randomUUID(),
    state: { ...state, background: 0 },
  });
  expect(f.runtime.hasActiveWork()).toBe(true);
  f.host.emit("message", {
    kind: "control",
    generation: start.connectionGeneration,
    state: { ...state, background: 0 },
  });
  expect(f.runtime.hasActiveWork()).toBe(false);
});

it("settles an acknowledged submission when native admission clears after the idle RPC reply", async () => {
  const f = await running();
  const prepared = await f.prepare();
  if (prepared.kind !== "receipt") throw Error("prepare failed");
  await f.dispatch();
  f.store.submissions.acknowledgeSubmission(prepared.receipt.submissionId);
  const start = f.postMessage.mock.calls
    .map(([raw]) => HostCommandSchema.parse(raw))
    .find((c) => c.kind === "start");
  if (!start || start.kind !== "start") throw Error("start missing");
  const state = {
    paused: false,
    stopping: false,
    streaming: false,
    compacting: false,
    queued: 0,
    queue: [],
    background: 0,
    pendingAsync: false,
    admitted: true,
  };
  f.host.emit("message", {
    kind: "control",
    generation: start.connectionGeneration,
    state,
  });
  f.host.emit("message", {
    kind: "state",
    busy: false,
    pendingInteraction: false,
    state: {
      sessionId: "native",
      isStreaming: false,
      isCompacting: false,
      queuedMessageCount: 0,
    },
  });
  f.host.emit("message", {
    kind: "control",
    generation: start.connectionGeneration,
    state: { ...state, admitted: false },
  });
  f.host.emit("exit");
  expect(f.runtime.hasActiveWork()).toBe(false);
  expect(
    f.store.submissions.submission(prepared.receipt.submissionId)?.outcome,
  ).not.toBe("unknown");
});
