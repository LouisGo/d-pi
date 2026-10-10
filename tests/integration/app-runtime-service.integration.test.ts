import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { presentSavedInput } from "../../src/app/main/ipc/history-presentation";
import {
  ProjectReadOperations,
  registerHistoryIpc,
} from "../../src/app/main/ipc/project-reads";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import {
  HostTransportCommandSchema,
  RuntimeCommandSchema,
  RuntimeViewSchema,
  SubmissionIdSchema,
} from "../../src/modules/execution/contracts/public";
import { NativeRecoveryFailure } from "../../src/modules/execution/core/runtime/native-recovery-failure";
import { RuntimeService } from "../../src/modules/execution/main/public";
import { SessionExecutionLease } from "../../src/modules/execution/main/transport/session-execution-lease";
import type { ContentPreparationResult } from "../../src/modules/input/contracts/public";
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

import { sessionExecutionOwners } from "../../src/platform/node/processes/public";

vi.mock("../../src/platform/node/processes/public", async (original) => {
  const actual =
    await original<typeof import("../../src/platform/node/processes/public")>();
  return {
    ...actual,
    sessionExecutionOwners: vi.fn(actual.sessionExecutionOwners),
  };
});
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
  prepareContent?: ConstructorParameters<typeof RuntimeService>[8],
  beforeReady?: (
    runtime: RuntimeService,
    command: Extract<
      import("../../src/modules/execution/contracts/public").HostCommand,
      { kind: "start" }
    >,
  ) => Promise<void>,
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
    if (command.kind === "start") {
      scopeId = command.processInstanceId;
      mkdirSync(command.sessionDirectory, { recursive: true });
      if (!command.resume)
        writeFileSync(
          join(command.sessionDirectory, "native.jsonl"),
          JSON.stringify({
            type: "session",
            version: 3,
            id: "native",
            cwd: project,
          }) + "\n",
        );
    }
    if (command.kind === "start")
      queueMicrotask(async () => {
        await beforeReady?.(runtime, command);
        host.emit("message", {
          kind: "ready",
          processInstanceId: command.processInstanceId,
          connectionGeneration: command.connectionGeneration,
          state: {
            sessionId: "native",
            sessionFile: join(
              root,
              "native-sessions",
              draft.threadId,
              "native.jsonl",
            ),
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
              sessionFile: join(
                root,
                "native-sessions",
                draft.threadId,
                "native.jsonl",
              ),
              model: { id: "model", provider: "fixture" },
              isStreaming: true,
              isCompacting: false,
              queuedMessageCount: 0,
            },
          });
      });
  });
  electron.fork.mockReturnValue(
    Object.assign(host, { postMessage, kill: vi.fn() }),
  );
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
  const runtime = new RuntimeService(
    store,
    root,
    root,
    {},
    () => {},
    undefined,
    undefined,
    undefined,
    prepareContent,
  );
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
    submissionId,
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

it("releases only confirmed exited runtimes and preserves the same persisted native identity on reopen", async () => {
  const fixture = await running();
  const binding = fixture.store.threads.nativeSessionBinding(
    fixture.draft.threadId,
  );
  const before = fixture.postMessage.mock.calls.length;
  expect(await fixture.runtime.releaseIfIdle()).toBe(false);
  expect(fixture.postMessage.mock.calls).toHaveLength(before);
  fixture.host.emit("exit", 0);
  // Utility exit is not yet confirmed native-group/lease cleanup.
  expect(await fixture.runtime.releaseIfIdle()).toBe(false);
  await fixture.runtime.closeIdle();
  expect(await fixture.runtime.releaseIfIdle()).toBe(true);
  await expect(fixture.act("inspect")).rejects.toThrow("Runtime released");
  const reopened = new RuntimeService(
    fixture.store,
    fixture.root,
    fixture.root,
    {},
    () => {},
    undefined,
    undefined,
    fixture.draft.threadId,
  );
  const view = await reopened.execute({
    kind: "inspect",
    threadId: fixture.draft.threadId,
    traceId: TraceIdSchema.parse(crypto.randomUUID()),
  });
  expect(view.phase).toBe("allowed");
  expect(
    fixture.store.threads.nativeSessionBinding(fixture.draft.threadId),
  ).toEqual(binding);
  expect(
    await reopened.submit({
      kind: "list",
      threadId: fixture.draft.threadId,
    }),
  ).toEqual({ kind: "list", receipts: [] });
});

it("retains pending and unknown receipts after physical exit", async () => {
  const fixture = await running();
  await fixture.prepare();
  fixture.host.emit("exit", 0);
  expect(await fixture.runtime.releaseIfIdle()).toBe(false);
  fixture.store.submissions.dispatchSubmission(fixture.submissionId);
  fixture.store.submissions.unknownSubmission(fixture.submissionId);
  expect(await fixture.runtime.releaseIfIdle()).toBe(false);
});

it("retains a runtime while asynchronous content preparation can still produce a result", async () => {
  let finish: (result: ContentPreparationResult) => void = () => {};
  const preparation = new Promise<ContentPreparationResult>((resolve) => {
    finish = resolve;
  });
  const prepareContent = vi.fn(() => preparation);
  const fixture = await running(false, false, false, prepareContent);
  const pending = fixture.prepare();
  await vi.waitFor(() => expect(prepareContent).toHaveBeenCalledOnce());
  fixture.host.emit("exit", 0);
  expect(await fixture.runtime.releaseIfIdle()).toBe(false);
  finish({ ok: false, reason: "storage-unavailable" });
  await pending;
  expect(await fixture.runtime.releaseIfIdle()).toBe(true);
});

it("retains an operation whose native result becomes unknown across confirmed shutdown", async () => {
  const fixture = await running();
  const view = await fixture.act("inspect");
  const pending = fixture.runtime.execute(
    RuntimeCommandSchema.parse({
      kind: "configure-subagent",
      threadId: fixture.draft.threadId,
      traceId: crypto.randomUUID(),
      connectionGeneration: view.connectionGeneration,
      command: {
        kind: "set",
        agent: "task",
        provider: "fixture",
        modelId: "model",
        thinking: { kind: "default" },
      },
    }),
  );
  await vi.waitFor(() =>
    expect(
      fixture.postMessage.mock.calls.some(
        ([raw]) =>
          HostTransportCommandSchema.parse(raw).command.kind ===
          "configure-subagent",
      ),
    ).toBe(true),
  );
  fixture.host.emit("exit", 0);
  await pending;
  expect(await fixture.runtime.releaseIfIdle()).toBe(false);
});

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

it("cold restart continues the exact bound session despite unrelated environment changes", async () => {
  const fixture = await running();
  const binding = fixture.store.threads.nativeSessionBinding(
    fixture.draft.threadId,
  );
  fixture.host.emit("message", { kind: "scope-closed" });
  await vi.waitFor(() => expect(fixture.runtime.hasActiveWork()).toBe(false));
  const restored = new RuntimeService(
    fixture.store,
    fixture.root,
    fixture.root,
    { UNRELATED: "changed" },
    () => {},
  );
  const act = (kind: "inspect" | "start") =>
    restored.execute({
      kind,
      threadId: fixture.draft.threadId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
    });
  expect((await act("inspect")).phase).toBe("allowed");
  expect((await act("start")).phase).toBe("ready");
  const starts = fixture.postMessage.mock.calls
    .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
    .filter((c) => c.kind === "start");
  expect(starts.at(-1)).toMatchObject({
    resume: {
      sessionId: binding?.sessionId,
      sessionFile: binding?.sessionFile,
    },
    configContextId: binding?.configContextId,
  });
  expect(
    fixture.store.threads.nativeSessionBinding(fixture.draft.threadId),
  ).toEqual(binding);
  expect(fixture.store.drafts.read(fixture.draft.threadId)?.text).toBe("A");
});

it("an independently live writer blocks recovery without substituting a session", async () => {
  const fixture = await running();
  const forks = electron.fork.mock.calls.length;
  const restored = new RuntimeService(
    fixture.store,
    fixture.root,
    fixture.root,
    {},
    () => {},
  );
  const view = await restored.execute({
    kind: "start",
    threadId: fixture.draft.threadId,
    traceId: TraceIdSchema.parse(crypto.randomUUID()),
  });
  expect(view.phase).toBe("failed");
  expect(electron.fork.mock.calls).toHaveLength(forks);
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

it("locates reference preparation failure without a receipt or native dispatch and preserves the draft", async () => {
  const attachmentId = crypto.randomUUID();
  const prepareContent = vi.fn(async () => ({
    ok: false as const,
    reason: "pdf-coverage-gap" as const,
    attachmentId,
  }));
  const fixture = await running(false, false, false, prepareContent);
  const reply = await fixture.prepare();
  expect(reply).toMatchObject({
    kind: "failed",
    code: "content-not-ready",
    error: {
      preparation: { reason: "pdf-coverage-gap", attachmentId },
      message: { code: "attachment.reason.pdf-coverage-gap" },
    },
  });
  expect(fixture.store.drafts.read(fixture.draft.threadId).text).toBe("A");
  expect(fixture.store.submissions.list(fixture.draft.threadId)).toEqual([]);
  expect(
    fixture.postMessage.mock.calls.map(
      ([raw]) => HostTransportCommandSchema.parse(raw).command.kind,
    ),
  ).not.toContain("dispatch");
});

it("cold recovery never resends an unknown attempt while allowing explicit new work on the same session", async () => {
  const f = await running();
  const prepared = await f.prepare();
  if (prepared.kind !== "receipt") throw Error("prepare failed");
  const id = prepared.receipt.submissionId;
  await f.dispatch();
  const before = f.postMessage.mock.calls.filter(
    ([r]) => HostTransportCommandSchema.parse(r).command.kind === "dispatch",
  ).length;
  f.host.emit("message", { kind: "scope-closed" });
  await vi.waitFor(() => expect(f.runtime.hasActiveWork()).toBe(false));
  expect(f.store.submissions.submission(id)?.state).toBe("unknown");
  const restored = new RuntimeService(f.store, f.root, f.root, {}, () => {});
  await restored.execute({
    kind: "start",
    threadId: f.draft.threadId,
    traceId: TraceIdSchema.parse(crypto.randomUUID()),
  });
  expect(f.store.submissions.submission(id)?.state).toBe("unknown");
  expect(
    f.postMessage.mock.calls.filter(
      ([r]) => HostTransportCommandSchema.parse(r).command.kind === "dispatch",
    ),
  ).toHaveLength(before);
  f.store.drafts.save(f.draft.threadId, 1, "New explicit input");
  const newId = SubmissionIdSchema.parse(crypto.randomUUID());
  expect(
    await restored.submit({
      kind: "prepare",
      threadId: f.draft.threadId,
      submissionId: newId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
      revision: 2,
      text: "New explicit input",
    }),
  ).toMatchObject({
    kind: "receipt",
    receipt: {
      state: "prepared",
      target: {
        nativeSessionRef: f.store.threads.nativeSessionBinding(f.draft.threadId)
          ?.sessionFile,
      },
    },
  });
});

it("explicit resume can retry a pre-fork failure after a previously confirmed shutdown", async () => {
  const f = await running();
  f.host.emit("message", { kind: "scope-closed" });
  await f.runtime.closeIdle();
  electron.fork.mockImplementationOnce(() => {
    throw Error("temporary fork failure");
  });
  expect((await f.act("start")).phase).toBe("failed");
  expect((await f.act("start")).phase).toBe("ready");
});

it("a recovery conflict exposes a specific public reason and an explicit start recheck can recover", async () => {
  const f = await running();
  const restored = new RuntimeService(f.store, f.root, f.root, {}, () => {});
  const start = () =>
    restored.execute({
      kind: "start",
      threadId: f.draft.threadId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
    });
  const blocked = await start();
  expect(blocked).toMatchObject({
    phase: "failed",
    busy: false,
    recoveryFailure: "occupied",
    message: { code: "runtime.recoveryOccupied" },
  });
  expect(RuntimeViewSchema.safeParse(blocked).success).toBe(true);
  f.host.emit("message", { kind: "scope-closed" });
  await f.runtime.closeIdle();
  const ready = await start();
  expect(ready.phase).toBe("ready");
  expect(ready.recoveryFailure).toBeUndefined();
});

it.each([
  ["owner-unknown", "runtime.recoveryOwnerUnknown"],
  ["shutdown-unconfirmed", "runtime.recoveryShutdownUnconfirmed"],
  ["lease-unavailable", "runtime.recoveryLeaseUnavailable"],
] as const)(
  "preserves %s through the public start reply without passing raw errors",
  async (reason, code) => {
    const f = await running();
    const retry = new RuntimeService(f.store, f.root, f.root, {}, () => {});
    const acquire = vi
      .spyOn(SessionExecutionLease, "acquire")
      .mockRejectedValueOnce(new NativeRecoveryFailure(reason));
    try {
      const view = await retry.execute({
        kind: "start",
        threadId: f.draft.threadId,
        traceId: TraceIdSchema.parse(crypto.randomUUID()),
      });
      expect(view).toMatchObject({
        phase: "failed",
        busy: false,
        recoveryFailure: reason,
        message: { code },
      });
      expect(RuntimeViewSchema.safeParse(view).success).toBe(true);
      expect(JSON.stringify(view)).not.toContain("Native recovery unavailable");
    } finally {
      acquire.mockRestore();
    }
  },
);

it("continues a CLI-origin binding through ordinary admission using its exact original file", async () => {
  const fixture = await running();
  const binding = fixture.store.threads.nativeSessionBinding(
    fixture.draft.threadId,
  )!;
  fixture.host.emit("message", { kind: "scope-closed" });
  await vi.waitFor(() => expect(fixture.runtime.hasActiveWork()).toBe(false));
  const originalContext = fixture.store.threads.threadContext(
    fixture.draft.threadId,
  );
  const context = vi
    .spyOn(fixture.store.threads, "threadContext")
    .mockReturnValue({ ...originalContext, origin: "cli" });
  const indexed = vi
    .spyOn(fixture.store.threads, "nativeSessionBinding")
    .mockReturnValue({ ...binding, origin: "cli", historyRoot: fixture.root });
  const runtime = new RuntimeService(
    fixture.store,
    fixture.root,
    fixture.root,
    {},
    () => {},
    () => {},
    () => {},
    fixture.draft.threadId,
    undefined,
    async () => fixture.root,
  );
  try {
    const command = {
      threadId: fixture.draft.threadId,
      traceId: crypto.randomUUID(),
    };
    expect((await runtime.execute({ ...command, kind: "inspect" })).phase).toBe(
      "allowed",
    );
    expect((await runtime.execute({ ...command, kind: "start" })).phase).toBe(
      "ready",
    );
    const starts = fixture.postMessage.mock.calls
      .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
      .filter((c) => c.kind === "start");
    expect(starts.at(-1)).toMatchObject({
      resume: {
        sessionFile: binding.sessionFile,
        sessionId: binding.sessionId,
        origin: "cli",
      },
      sessionDirectory: join(
        fixture.root,
        "native-sessions",
        fixture.draft.threadId,
      ),
    });
    expect(fixture.store.drafts.read(fixture.draft.threadId)?.text).toBe("A");
    fixture.host.emit("message", { kind: "scope-closed" });
    await vi.waitFor(() => expect(runtime.hasActiveWork()).toBe(false));
  } finally {
    context.mockRestore();
    indexed.mockRestore();
  }
});

it("does not dispatch a CLI startup after trust is revoked during the owner probe", async () => {
  const fixture = await running();
  const binding = fixture.store.threads.nativeSessionBinding(
    fixture.draft.threadId,
  )!;
  fixture.host.emit("message", { kind: "scope-closed" });
  await vi.waitFor(() => expect(fixture.runtime.hasActiveWork()).toBe(false));
  const originalContext = fixture.store.threads.threadContext(
    fixture.draft.threadId,
  );
  const context = vi
    .spyOn(fixture.store.threads, "threadContext")
    .mockReturnValue({ ...originalContext, origin: "cli" });
  const indexed = vi
    .spyOn(fixture.store.threads, "nativeSessionBinding")
    .mockReturnValue({ ...binding, origin: "cli", historyRoot: fixture.root });
  const runtime = new RuntimeService(
    fixture.store,
    fixture.root,
    fixture.root,
    {},
    () => {},
    () => {},
    () => {},
    fixture.draft.threadId,
    undefined,
    async () => fixture.root,
  );
  let release!: (owners: number[]) => void;
  vi.mocked(sessionExecutionOwners).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const command = {
    threadId: fixture.draft.threadId,
    traceId: crypto.randomUUID(),
  };
  const before = fixture.postMessage.mock.calls.length;
  try {
    const starting = runtime.execute({ ...command, kind: "start" });
    await vi.waitFor(() => expect(release).toBeDefined());
    await runtime.execute({ ...command, kind: "revoke" });
    release([]);
    const view = await starting;
    expect(view.trusted).toBe(false);
    expect(
      fixture.postMessage.mock.calls
        .slice(before)
        .map(([raw]) => HostTransportCommandSchema.parse(raw).command.kind),
    ).not.toContain("start");
    expect(runtime.hasActiveWork()).toBe(false);
    // Regrant and retry proves the rejected attempt released its lifetime lease.
    await runtime.execute({ ...command, kind: "allow" });
    expect((await runtime.execute({ ...command, kind: "start" })).phase).toBe(
      "ready",
    );
    fixture.host.emit("message", { kind: "scope-closed" });
    await vi.waitFor(() => expect(runtime.hasActiveWork()).toBe(false));
  } finally {
    context.mockRestore();
    indexed.mockRestore();
  }
});

it("reuses a directory grant in an already browsed Thread after another Thread is allowed", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-shared-grant-")));
  const store = AppStorage.open(join(root, "app.sqlite"));
  const first = store.threads.create(root),
    second = store.threads.create(root);
  const a = new RuntimeService(
    store,
    "/fixture/resources",
    root,
    {},
    () => {},
    () => {},
    () => {},
    first.threadId,
  );
  const b = new RuntimeService(
    store,
    "/fixture/resources",
    root,
    {},
    () => {},
    () => {},
    () => {},
    second.threadId,
  );
  const inspect = () =>
    a.execute({
      kind: "inspect",
      threadId: first.threadId,
      traceId: crypto.randomUUID(),
    });
  try {
    expect((await inspect()).phase).toBe("browse");
    await b.execute({
      kind: "allow",
      threadId: second.threadId,
      traceId: crypto.randomUUID(),
    });
    const restored = await inspect();
    expect(restored.phase).toBe("allowed");
    expect(restored.trusted).toBe(true);
    store.threads.revokeExecution(first.workingDirectoryId);
    expect((await inspect()).trusted).toBe(false);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("waits for the exact native model operation and preserves thinking intent after readback", async () => {
  const f = await running();
  const traceId = TraceIdSchema.parse(crypto.randomUUID());
  const selection = {
    provider: "fixture",
    modelId: "next",
    thinking: { kind: "effort" as const, effort: "high" as const },
  };
  let settled = false;
  const pending = f.runtime
    .execute({
      kind: "select-model",
      threadId: f.draft.threadId,
      traceId,
      selection,
    })
    .then((value) => {
      settled = true;
      return value;
    });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(settled).toBe(false);
  const envelope = f.postMessage.mock.calls
    .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
    .findLast((command) => command.kind === "select-model");
  if (envelope?.kind !== "select-model") throw Error("Missing model command");
  f.host.emit("message", {
    kind: "state",
    busy: false,
    pendingInteraction: false,
    state: {
      sessionId: "native",
      sessionFile: join(
        f.root,
        "native-sessions",
        f.draft.threadId,
        "native.jsonl",
      ),
      model: { provider: "fixture", id: "next" },
      thinkingLevel: "high",
      isStreaming: false,
      isCompacting: false,
      queuedMessageCount: 0,
    },
  });
  f.host.emit("message", {
    kind: "operation-result",
    connectionGeneration: envelope.connectionGeneration,
    operation: "select-model",
    traceId,
    status: "acknowledged",
  });
  expect(await pending).toMatchObject({
    model: "fixture/next",
    selectedModel: selection,
    modelChanging: false,
    modelOperation: { traceId, status: "acknowledged" },
  });
});

it("keeps a failed thinking change distinct from the unchanged model and ignores an unrelated model receipt", async () => {
  const f = await running();
  const traceId = TraceIdSchema.parse(crypto.randomUUID());
  let settled = false;
  const pending = f.runtime
    .execute({
      kind: "select-model",
      threadId: f.draft.threadId,
      traceId,
      selection: {
        provider: "fixture",
        modelId: "model",
        thinking: { kind: "effort", effort: "high" },
      },
    })
    .then((value) => {
      settled = true;
      return value;
    });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const envelope = f.postMessage.mock.calls
    .map(([raw]) => HostTransportCommandSchema.parse(raw).command)
    .findLast((command) => command.kind === "select-model");
  if (envelope?.kind !== "select-model") throw Error("Missing model command");
  f.host.emit("message", {
    kind: "operation-result",
    connectionGeneration: envelope.connectionGeneration,
    operation: "select-model",
    traceId: crypto.randomUUID(),
    status: "acknowledged",
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  f.host.emit("message", {
    kind: "operation-result",
    connectionGeneration: envelope.connectionGeneration,
    operation: "select-model",
    traceId,
    status: "failed",
  });
  const readback = await pending;
  expect(readback).toMatchObject({
    model: "fixture/model",
    modelChanging: false,
    modelOperation: { traceId, status: "failed" },
    message: { code: "runtime.controlFailed" },
  });
  expect(readback.selectedModel).toBeUndefined();
});

it("inspects the starting projection without sending native state before the permit and ready handshake", async () => {
  let inspectedPhase = "";
  const f = await running(
    false,
    false,
    false,
    undefined,
    async (runtime, command) => {
      const view = await runtime.execute({
        kind: "inspect",
        threadId: command.threadId,
        traceId: TraceIdSchema.parse(crypto.randomUUID()),
      });
      inspectedPhase = view.phase;
    },
  );
  expect(inspectedPhase).toBe("starting");
  expect(
    f.postMessage.mock.calls.map(
      ([raw]) => HostTransportCommandSchema.parse(raw).command.kind,
    ),
  ).not.toContain("state");
});

it("uses the Runtime canonical file reference for frozen TXT+PNG presentation after storage restart", async () => {
  const attachmentId = crypto.randomUUID();
  const imageId = crypto.randomUUID();
  const text = `Question\n[[dpi-attachment:${attachmentId}]]\n[[dpi-attachment:${imageId}]]`;
  const message =
    "Question\n\n[qa-attachment.txt]\nfrozen text\n[/attachment]\n\n[image: shot.png]";
  const data = "aGVsbG8=";
  const digest = createHash("sha256")
    .update(Buffer.from(data, "base64"))
    .digest("hex");
  const content = {
    schemaVersion: 1 as const,
    message,
    images: [{ type: "image" as const, mimeType: "image/png", data }],
    sources: [
      {
        attachmentId,
        inputDigest: "a".repeat(64),
        representation: "text" as const,
        converterVersion: "utf-8",
        coverageGaps: [],
        byteLength: 11,
        name: "qa-attachment.txt",
      },
      {
        attachmentId: imageId,
        inputDigest: digest,
        representation: "image" as const,
        converterVersion: "original-image-v1",
        coverageGaps: [],
        byteLength: 5,
        name: "shot.png",
      },
    ],
    rawBytes: 16,
  };
  const f = await running(false, false, false, async () => ({
    ok: true as const,
    content,
  }));
  const current = await f.act("inspect");
  f.host.emit("message", {
    kind: "control",
    connectionGeneration: current.connectionGeneration,
    state: {
      imageSupport: true,
      paused: false,
      stopping: false,
      streaming: false,
      compacting: false,
      queued: 0,
      background: 0,
      pendingAsync: false,
      admitted: false,
      queue: [],
    },
  });
  f.store.drafts.save(f.draft.threadId, 1, text);
  const prepared = await f.runtime.submit({
    kind: "prepare",
    threadId: f.draft.threadId,
    submissionId: SubmissionIdSchema.parse(crypto.randomUUID()),
    traceId: TraceIdSchema.parse(crypto.randomUUID()),
    revision: 2,
    text,
  });
  if (prepared.kind !== "receipt") throw Error(JSON.stringify(prepared));
  const binding = f.store.threads.nativeSessionBinding(f.draft.threadId)!;
  expect(binding.sessionId).not.toBe(binding.sessionFile);
  expect(prepared.receipt.target.nativeSessionRef).toBe(binding.sessionFile);
  f.host.emit("message", { kind: "scope-closed" });
  await vi.waitFor(() => expect(f.runtime.hasActiveWork()).toBe(false));
  f.store.close();
  const reopened = AppStorage.open(join(f.root, "app.sqlite"));
  try {
    const restored = reopened.threads.nativeSessionBinding(f.draft.threadId)!;
    const candidates = reopened.submissions.presentationCandidates(
      f.draft.threadId,
      restored.sessionFile,
      restored.configContextId,
      message,
    );
    expect(candidates).toHaveLength(1);
    expect(
      reopened.submissions.presentationCandidates(
        f.draft.threadId,
        restored.sessionId,
        restored.configContextId,
        message,
      ),
    ).toEqual([]);
    expect(
      reopened.submissions.presentationCandidates(
        f.draft.threadId,
        restored.sessionFile,
        "other-config",
        message,
      ),
    ).toEqual([]);
    const entry = {
      id: "user",
      parentId: null,
      role: "user",
      text: message,
      images: [{ mimeType: "image/png", digest, byteLength: 5 }],
    };
    const shown = presentSavedInput(entry, restored, candidates);
    expect(shown.displayText).toBe("Question");
    expect(shown.files?.[0]?.name).toBe("qa-attachment.txt");
    writeFileSync(
      restored.sessionFile,
      [
        { type: "session", version: 3, id: restored.sessionId, cwd: f.project },
        {
          type: "message",
          id: "user",
          parentId: null,
          message: {
            role: "user",
            content: [
              { type: "text", text: message },
              { type: "image", mimeType: "image/png", data },
            ],
          },
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
    const handle = vi.fn<IpcMain["handle"]>();
    const event = {
      sender: { id: 1 },
      senderFrame: { processId: 2, routingId: 3 },
    } as IpcMainInvokeEvent;
    registerHistoryIpc({
      ipcMain: { handle },
      sourceValid: (input) => input === event,
      reads: new ProjectReadOperations(),
      getStore: () => reopened,
      getDiagnostics: () => undefined,
      nativeSessionsPath: () => join(f.root, "native-sessions"),
      projectNativeSessionsPath: async () => null,
    });
    const read = handle.mock.calls.find(
      ([channel]) => channel === "history:read",
    )![1];
    const page = await read(event, {
      threadId: f.draft.threadId,
      cursor: null,
    });
    expect(page.kind).toBe("page");
    expect(page.entries[0]).toMatchObject({
      displayText: "Question",
      files: [{ name: "qa-attachment.txt" }],
      images: [{ digest }],
    });

    expect(
      presentSavedInput(
        {
          ...entry,
          images: [
            { mimeType: "image/png", digest: "b".repeat(64), byteLength: 5 },
          ],
        },
        restored,
        candidates,
      ).displayText,
    ).toBeUndefined();
    expect(
      presentSavedInput(
        entry,
        { ...restored, configContextId: "other-config" },
        candidates,
      ).displayText,
    ).toBeUndefined();
    expect(
      presentSavedInput(
        { ...entry, text: message + "different" },
        restored,
        candidates,
      ).displayText,
    ).toBeUndefined();
    expect(reopened.drafts.read(f.draft.threadId).text).toBe(text);
  } finally {
    reopened.close();
  }
});
