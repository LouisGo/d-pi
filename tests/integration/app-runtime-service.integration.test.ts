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
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import {
  HostTransportCommandSchema,
  RuntimeCommandSchema,
  RuntimeViewSchema,
  SubmissionIdSchema,
} from "../../src/modules/execution/contracts/public";
import { RuntimeService } from "../../src/modules/execution/main/public";
import { TraceIdSchema } from "../../src/shared/identity";

const electron = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("electron", () => ({ utilityProcess: { fork: electron.fork } }));
vi.mock("../../src/platform/omp/resources/public", async (original) => ({
  ...(await original<
    typeof import("../../src/platform/omp/resources/public")
  >()),
  managedSdkRuntime: async () => ({
    binary: "/fixture/bun",
    entry: "/fixture/host.mjs",
  }),
}));
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

it("applies future subagent defaults on the exact busy instance and waits for native confirmation", async () => {
  const fixture = await running(false, true);
  const current = await fixture.act("inspect");
  const original = fixture.postMessage.getMockImplementation();
  fixture.postMessage.mockImplementation((raw: unknown) => {
    original?.(raw);
    const command = HostTransportCommandSchema.parse(raw).command;
    if (command.kind === "configure-subagent")
      queueMicrotask(() => {
        fixture.host.emit("message", {
          kind: "subagents",
          connectionGeneration: command.command.connectionGeneration,
          state: {
            agents: [
              {
                name: "task",
                description: "Task",
                effectivePatterns: ["fixture/model"],
                override: {
                  provider: "fixture",
                  modelId: "model",
                  thinking: { kind: "default" },
                },
              },
            ],
          },
        });
        fixture.host.emit("message", {
          kind: "operation-result",
          traceId: command.command.traceId,
          connectionGeneration: command.command.connectionGeneration,
          operation: "configure-subagent",
          status: "acknowledged",
        });
      });
  });
  const view = await fixture.runtime.execute(
    RuntimeCommandSchema.parse({
      kind: "configure-subagent",
      threadId: fixture.draft.threadId,
      traceId: crypto.randomUUID(),
      connectionGeneration: current.connectionGeneration,
      command: {
        kind: "set",
        agent: "task",
        provider: "fixture",
        modelId: "model",
        thinking: { kind: "default" },
      },
    }),
  );
  expect(view.busy).toBe(true);
  expect(view.subagents?.agents[0]?.override?.modelId).toBe("model");
  expect(view.subagentOperation?.status).toBe("acknowledged");
  expect(
    fixture.postMessage.mock.calls.map(
      ([raw]) => HostTransportCommandSchema.parse(raw).command.kind,
    ),
  ).not.toContain("control");
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
  const store = AppStorage.open(join(root, "app.sqlite"));
  const draft = store.drafts.create(project);
  store.drafts.save(draft.threadId, 0, "A");
  const host = new EventEmitter();
  let scopeId = "";
  const emit = host.emit.bind(host);
  host.emit = (event, ...args) =>
    event === "message"
      ? emit(event, { scopeId, message: args[0] })
      : emit(event, ...args);
  const postMessage = vi.fn((raw: unknown) => {
    const command = HostTransportCommandSchema.parse(raw).command;
    if (command.kind === "start") scopeId = command.processInstanceId;
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
    confirmIdle: () => {
      const latest = postMessage.mock.calls
        .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
        .findLast((c) => c.kind === "dispatch");
      const start = postMessage.mock.calls
        .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
        .find((c) => c.kind === "start");
      if (!start || start.kind !== "start") throw Error("missing start");
      host.emit("message", {
        kind: "idle-confirmed",
        connectionGeneration: start.connectionGeneration,
        afterSubmissionId:
          latest?.kind === "dispatch" ? latest.value.submissionId : null,
      });
    },
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
      ([raw]) =>
        HostTransportCommandSchema.parse(raw).command.kind === "dispatch",
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
  const { identifyDirectory } = await import(
    "../../src/platform/node/filesystem/public"
  );
  fixture.store.threads.grantExecution({
    ...(await identifyDirectory(fixture.project)),
    workingDirectoryId: fixture.draft.workingDirectoryId,
  });
  expect(await fixture.dispatch()).toMatchObject({
    kind: "receipt",
    receipt: { state: "rejected" },
  });
  expect(
    fixture.postMessage.mock.calls.filter(
      ([raw]) =>
        HostTransportCommandSchema.parse(raw).command.kind === "dispatch",
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
      ([raw]) =>
        HostTransportCommandSchema.parse(raw).command.kind === "dispatch",
    ),
  ).toHaveLength(1);
});

it("publishes runtime status as a valid semantic IPC value", async () => {
  const fixture = await running();
  const view = RuntimeViewSchema.parse(await fixture.act("inspect"));
  expect(view.configuration).toEqual({ code: "runtime.configDefault" });
  expect(view.message).toEqual({ code: "runtime.readyToSend" });
  expect(JSON.stringify(view)).not.toContain("可发送文字");
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
  const binding = fixture.store.threads.nativeSessionBinding(
    fixture.draft.threadId,
  );
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
    expect(view.message).toEqual({ code: "runtime.previousSessionReadOnly" });
  }
  expect(electron.fork.mock.calls).toHaveLength(forks);
  expect(
    fixture.store.threads.nativeSessionBinding(fixture.draft.threadId),
  ).toEqual(binding);
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
      ([raw]) =>
        HostTransportCommandSchema.parse(raw).command.kind === "dispatch",
    ),
  ).toHaveLength(1);
});

it("refuses new queue entries beyond twenty while still dispatching counted ones", async () => {
  const fixture = await running();
  for (let index = 0; index < 20; index++) {
    fixture.store.drafts.save(
      fixture.draft.threadId,
      1 + index,
      `queued ${index}`,
    );
    const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
    const prepared = await fixture.runtime.submit({
      kind: "prepare",
      threadId: fixture.draft.threadId,
      submissionId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
      revision: 2 + index,
      text: `queued ${index}`,
    });
    expect(prepared).toMatchObject({
      kind: "receipt",
      receipt: { state: "prepared" },
    });
  }
  const overflowId = SubmissionIdSchema.parse(crypto.randomUUID());
  expect(
    await fixture.runtime.submit({
      kind: "prepare",
      threadId: fixture.draft.threadId,
      submissionId: overflowId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
      revision: 20,
      text: "overflow",
    }),
  ).toMatchObject({ kind: "failed", code: "queue-full" });
  const first = fixture.store.submissions.list(fixture.draft.threadId)[0];
  if (!first) throw Error("missing prepared receipt");
  expect(
    await fixture.runtime.submit({
      kind: "dispatch",
      threadId: fixture.draft.threadId,
      submissionId: first.submissionId,
    }),
  ).toMatchObject({
    kind: "receipt",
    receipt: { state: "dispatching" },
  });
});

it("counts hidden native queue entries at the admission cap without App receipts", async () => {
  const fixture = await running();
  const current = await fixture.act("inspect");
  fixture.host.emit("message", {
    kind: "control",
    connectionGeneration: current.connectionGeneration,
    state: {
      paused: false,
      stopping: false,
      streaming: false,
      compacting: false,
      queued: 20,
      queue: Array.from({ length: 16 }, () => ({
        kind: "followUp",
        text: "queued",
      })),
      queueState: {
        revision: 1,
        items: Array.from({ length: 16 }, () => ({
          id: crypto.randomUUID(),
          kind: "followUp",
          text: "queued",
          editable: true,
          editing: false,
          truncated: false,
        })),
        hiddenCount: 4,
        coverage: "limited",
        editing: null,
      },
      background: 0,
      pendingAsync: false,
      admitted: false,
    },
  });
  expect(fixture.store.submissions.list(fixture.draft.threadId)).toHaveLength(
    0,
  );
  expect(await fixture.prepare()).toMatchObject({
    kind: "failed",
    code: "queue-full",
  });
  expect(fixture.store.submissions.list(fixture.draft.threadId)).toHaveLength(
    0,
  );
});

it("returns a historical non-prepared receipt without a native write after the grant is revoked (A12 Main lock)", async () => {
  const fixture = await running();
  const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
  await fixture.runtime.submit({
    kind: "prepare",
    threadId: fixture.draft.threadId,
    submissionId,
    traceId: TraceIdSchema.parse(crypto.randomUUID()),
    revision: 1,
    text: "A",
  });
  await fixture.runtime.submit({
    kind: "dispatch",
    threadId: fixture.draft.threadId,
    submissionId,
  });
  expect(fixture.store.submissions.acknowledgeSubmission(submissionId)).toBe(
    true,
  );
  const dispatchesBefore = fixture.postMessage.mock.calls.filter(
    ([raw]) =>
      HostTransportCommandSchema.parse(raw).command.kind === "dispatch",
  ).length;
  // Revoke the execution grant: new side effects are blocked from here on.
  fixture.store.threads.revokeExecution(fixture.draft.workingDirectoryId);
  // Historical read of a non-prepared receipt must not throw and must not
  // produce a second native write. Execution permission gates new side
  // effects, never the lookup of what already happened.
  const reply = await fixture.runtime.submit({
    kind: "dispatch",
    threadId: fixture.draft.threadId,
    submissionId,
  });
  expect(reply).toMatchObject({
    kind: "receipt",
    receipt: { submissionId, state: "acknowledged" },
  });
  expect(
    fixture.postMessage.mock.calls.filter(
      ([raw]) =>
        HostTransportCommandSchema.parse(raw).command.kind === "dispatch",
    ),
  ).toHaveLength(dispatchesBefore);
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
    .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
    .find((c) => c.kind === "start");
  if (!start || start.kind !== "start") throw Error("Missing start");
  fixture.host.emit("message", {
    kind: "control",
    connectionGeneration: start.connectionGeneration,
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
      ([raw]) =>
        HostTransportCommandSchema.parse(raw).command.kind === "dispatch",
    ),
  ).toHaveLength(2);
});

it("control and answers reject stale generations and revoked grants while allowing cancellation", async () => {
  const f = await running();
  const start = f.postMessage.mock.calls
    .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
    .find((c) => c.kind === "start");
  if (!start || start.kind !== "start") throw Error("start missing");
  const base = {
    threadId: f.draft.threadId,
    traceId: TraceIdSchema.parse(crypto.randomUUID()),
    connectionGeneration: start.connectionGeneration,
  };
  await expect(
    f.runtime.execute({
      ...base,
      kind: "continue",
      connectionGeneration: crypto.randomUUID(),
    }),
  ).rejects.toThrow("Stale control");
  await expect(
    f.runtime.execute({
      ...base,
      kind: "answer",
      connectionGeneration: crypto.randomUUID(),
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
      ([raw]) =>
        HostTransportCommandSchema.parse(raw).command.kind === "answer",
    ),
  ).toHaveLength(1);
});

it("background-only work prevents quit even after a stale idle poll and ignores old control snapshots", async () => {
  const f = await running();
  const start = f.postMessage.mock.calls
    .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
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
    connectionGeneration: start.connectionGeneration,
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
    connectionGeneration: crypto.randomUUID(),
    state: { ...state, background: 0 },
  });
  expect(f.runtime.hasActiveWork()).toBe(true);
  f.host.emit("message", {
    kind: "control",
    connectionGeneration: start.connectionGeneration,
    state: { ...state, background: 0 },
  });
  expect(f.runtime.hasActiveWork()).toBe(false);
});

it("clearing native admission and confirming idle cannot settle an acknowledged submission without its terminal", async () => {
  const f = await running();
  const prepared = await f.prepare();
  if (prepared.kind !== "receipt") throw Error("prepare failed");
  await f.dispatch();
  f.store.submissions.acknowledgeSubmission(prepared.receipt.submissionId);
  const start = f.postMessage.mock.calls
    .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
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
    connectionGeneration: start.connectionGeneration,
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
    connectionGeneration: start.connectionGeneration,
    state: { ...state, admitted: false },
  });
  expect(f.runtime.hasActiveWork()).toBe(true); // Bare samples cannot prove current work drained.
  f.confirmIdle();
  expect(f.runtime.hasActiveWork()).toBe(true);
  f.host.emit("exit");
  expect(f.runtime.hasActiveWork()).toBe(true);
  expect(
    f.store.submissions.submission(prepared.receipt.submissionId)?.outcome,
  ).toBe("unknown");
});

it("blocks prepare and dispatch during native interactions, then admits normal follow-up", async () => {
  const f = await running(false, true);
  const prepared = await f.prepare();
  if (prepared.kind !== "receipt") throw Error("prepare failed");
  const connectionGeneration = prepared.receipt.target.connectionGeneration;
  const interactions = {
    connectionGeneration,
    unsupported: false,
    items: [
      {
        id: "dialog",
        method: "confirm",
        title: "Confirm",
        status: "pending",
        expiresAt: null,
      },
    ],
  };
  f.host.emit("message", { kind: "interactions", view: interactions });
  expect(await f.dispatch()).toMatchObject({
    kind: "receipt",
    receipt: { state: "rejected" },
  });
  expect(
    f.postMessage.mock.calls
      .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
      .filter((c) => c.kind === "dispatch"),
  ).toHaveLength(0);
  f.store.drafts.save(f.draft.threadId, 1, "B");
  const next = {
    kind: "prepare" as const,
    threadId: f.draft.threadId,
    submissionId: SubmissionIdSchema.parse(crypto.randomUUID()),
    traceId: TraceIdSchema.parse(crypto.randomUUID()),
    revision: 2,
    text: "B",
  };
  expect(await f.runtime.submit(next)).toMatchObject({
    kind: "failed",
    code: "not-ready",
  });
  f.host.emit("message", {
    kind: "interactions",
    view: { ...interactions, items: [], unsupported: true },
  });
  expect(await f.runtime.submit(next)).toMatchObject({
    kind: "failed",
    code: "not-ready",
  });
  f.host.emit("message", {
    kind: "interactions",
    view: { ...interactions, items: [] },
  });
  expect(await f.runtime.submit(next)).toMatchObject({
    kind: "receipt",
    receipt: { state: "prepared" },
  });
  expect(
    await f.runtime.submit({
      kind: "dispatch",
      threadId: f.draft.threadId,
      submissionId: next.submissionId,
    }),
  ).toMatchObject({
    kind: "receipt",
    receipt: { state: "dispatching" },
  });
});

it("persists Host non-dispatch without consuming the draft and permits an explicit new send", async () => {
  const f = await running();
  const p = await f.prepare();
  if (p.kind !== "receipt") throw Error("prepare failed");
  await f.dispatch();
  f.host.emit("message", {
    kind: "submission",
    evidenceId: crypto.randomUUID(),
    event: {
      kind: "rejected",
      submissionId: p.receipt.submissionId,
      requestId: p.receipt.requestId,
      target: p.receipt.target,
    },
  });
  expect(f.store.submissions.submission(p.receipt.submissionId)?.state).toBe(
    "rejected",
  );
  expect(f.store.drafts.read(f.draft.threadId).text).toBe("A");
  f.host.emit("message", {
    kind: "control",
    connectionGeneration: p.receipt.target.connectionGeneration,
    state: {
      paused: false,
      stopping: false,
      streaming: false,
      compacting: false,
      queued: 0,
      queue: [],
      background: 0,
      pendingAsync: false,
      admitted: false,
    },
  });
  f.confirmIdle();
  expect(f.runtime.hasActiveWork()).toBe(false);
  const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
  expect(
    await f.runtime.submit({
      kind: "prepare",
      threadId: f.draft.threadId,
      submissionId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
      revision: 1,
      text: "A",
    }),
  ).toMatchObject({ kind: "receipt", receipt: { state: "prepared" } });
  expect(
    await f.runtime.submit({
      kind: "dispatch",
      threadId: f.draft.threadId,
      submissionId,
    }),
  ).toMatchObject({ kind: "receipt", receipt: { state: "dispatching" } });
  expect(
    f.postMessage.mock.calls
      .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
      .filter((c) => c.kind === "dispatch"),
  ).toHaveLength(2);
});

it("a control rejection preserves the same session for explicit continue and does not mask real disconnection", async () => {
  const f = await running();
  const view = await f.act("inspect");
  if (!view.connectionGeneration) throw Error("connectionGeneration missing");
  const traceId = TraceIdSchema.parse(crypto.randomUUID());
  f.host.emit("message", {
    kind: "operation-result",
    connectionGeneration: view.connectionGeneration,
    traceId,
    operation: "continue",
    status: "failed",
  });
  expect(await f.act("inspect")).toMatchObject({
    phase: "ready",
    message: { code: "runtime.controlFailed" },
  });
  await f.runtime.execute({
    kind: "continue",
    threadId: f.draft.threadId,
    connectionGeneration: view.connectionGeneration,
    traceId,
  });
  expect(
    f.postMessage.mock.calls.map(
      ([raw]) => HostTransportCommandSchema.parse(raw).command,
    ),
  ).toContainEqual(
    expect.objectContaining({
      kind: "control",
      command: expect.objectContaining({ kind: "continue" }),
    }),
  );
  f.host.emit("message", { kind: "interrupted", reason: "exit" });
  expect((await f.act("inspect")).phase).toBe("interrupted");
});

it.each(["error", "disconnected"] as const)(
  "settles %s only with adequate evidence, including a result arriving after idle",
  async (kind) => {
    const f = await running();
    const p = await f.prepare();
    if (p.kind !== "receipt") throw Error("prepare failed");
    await f.dispatch();
    const state = {
      paused: false,
      stopping: false,
      streaming: false,
      compacting: false,
      queued: 0,
      queue: [],
      background: 0,
      pendingAsync: false,
      admitted: false,
    };
    const control = (background: number) =>
      f.host.emit("message", {
        kind: "control",
        connectionGeneration: p.receipt.target.connectionGeneration,
        state: { ...state, background },
      });
    control(0);
    expect(f.runtime.hasActiveWork()).toBe(true); // Idle alone cannot resolve an unacknowledged request.
    control(1);
    f.host.emit("message", {
      kind: "submission",
      evidenceId: crypto.randomUUID(),
      event: {
        kind,
        submissionId: p.receipt.submissionId,
        requestId: p.receipt.requestId,
        target: p.receipt.target,
      },
    });
    expect(f.runtime.hasActiveWork()).toBe(true); // Failure alone cannot dismiss native background work.
    control(0);
    f.confirmIdle();
    expect(f.runtime.hasActiveWork()).toBe(kind === "disconnected");
    expect(f.store.drafts.read(f.draft.threadId).text).toBe("A");
  },
);

it("settles a late failure after the last idle snapshot without waiting for another native state change", async () => {
  const f = await running();
  const p = await f.prepare();
  if (p.kind !== "receipt") throw Error("prepare failed");
  await f.dispatch();
  f.host.emit("message", {
    kind: "control",
    connectionGeneration: p.receipt.target.connectionGeneration,
    state: {
      paused: false,
      stopping: false,
      streaming: false,
      compacting: false,
      queued: 0,
      queue: [],
      background: 0,
      pendingAsync: false,
      admitted: false,
    },
  });
  f.confirmIdle();
  f.host.emit("message", {
    kind: "submission",
    evidenceId: crypto.randomUUID(),
    event: {
      kind: "error",
      submissionId: p.receipt.submissionId,
      requestId: p.receipt.requestId,
      target: p.receipt.target,
    },
  });
  expect(f.runtime.hasActiveWork()).toBe(false);
  f.host.emit("exit");
  expect(f.store.submissions.submission(p.receipt.submissionId)?.outcome).toBe(
    "failed",
  );
});

it.each(["revoke", "missing-directory"] as const)(
  "finishes a prepared attempt rejected after %s before dispatch",
  async (cause) => {
    const f = await running();
    const prepared = await f.prepare();
    if (prepared.kind !== "receipt") throw Error("prepare failed");
    if (cause === "revoke") await f.act("revoke");
    else renameSync(f.project, join(f.root, "temporarily-moved"));
    expect(await f.dispatch()).toMatchObject({
      kind: "receipt",
      receipt: { state: "rejected" },
    });
    expect(
      f.postMessage.mock.calls
        .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
        .filter((c) => c.kind === "dispatch"),
    ).toHaveLength(0);
    expect(f.store.drafts.read(f.draft.threadId).text).toBe("A");
    if (cause === "missing-directory")
      renameSync(join(f.root, "temporarily-moved"), f.project);
    await f.act("allow");
    const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
    expect(
      await f.runtime.submit({
        kind: "prepare",
        threadId: f.draft.threadId,
        submissionId,
        traceId: TraceIdSchema.parse(crypto.randomUUID()),
        revision: 1,
        text: "A",
      }),
    ).toMatchObject({ kind: "receipt", receipt: { state: "prepared" } });
  },
);
