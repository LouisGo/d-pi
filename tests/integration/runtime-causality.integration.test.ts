import { EventEmitter } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PassThrough, Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import {
  HostTransportCommandSchema,
  SubmissionIdSchema,
} from "../../src/modules/execution/contracts/public";
import { createSessionHost } from "../../src/modules/execution/host/public";
import { RuntimeService } from "../../src/modules/execution/main/public";
import type { DiagnosticEvent } from "../../src/platform/main/diagnostics/public";
import { TraceIdSchema } from "../../src/shared/identity";

const adapters = vi.hoisted(() => ({
  fork: vi.fn(),
  spawn: vi.fn(),
  terminate: vi.fn(async () => true),
}));
vi.mock("electron", () => ({ utilityProcess: { fork: adapters.fork } }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: adapters.spawn,
}));
vi.mock("../../src/platform/omp/resources/public", () => ({
  managedSdkRuntime: async () => ({
    binary: "/fixture/bun",
    entry: "/fixture/host.mjs",
  }),
}));
vi.mock("../../src/platform/node/processes/public", () => ({
  readProcessIdentity: async (pid: number) => ({
    pid,
    birth: "fixture-birth",
    executable: "/fixture/bun",
    parentPid: globalThis.process.pid,
    groupId: pid,
  }),
  terminateManagedGroup: adapters.terminate,
}));
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
  adapters.terminate.mockReset().mockResolvedValue(true);
});
const idle = {
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
async function running(diagnosticFailure = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "d-pi-causal-")));
  const project = join(root, "project");
  mkdirSync(project);
  const store = AppStorage.open(join(root, "app.sqlite"));
  const draft = store.drafts.create(project);
  store.drafts.save(draft.threadId, 0, "B");
  const stdout = new PassThrough();
  const frames = (...values: object[]) =>
    stdout.write(values.map((v) => JSON.stringify(v)).join("\n") + "\n");
  let hold = false;
  let pending: { id: string; type: string } | undefined;
  let sessionDirectory = "";
  let control = idle;
  const state = () => ({
    sessionId: "native",
    sessionFile: join(sessionDirectory, "session.jsonl"),
    model: { id: "model", provider: "fixture" },
    isStreaming: control.streaming,
    isCompacting: false,
    queuedMessageCount: 0,
  });
  const commands: { id: string; type: string }[] = [];
  const stdin = new Writable({
    write(bytes, _encoding, done) {
      const command = JSON.parse(bytes.toString());
      commands.push(command);
      if (command.type === "d_pi_native_permit") {
        if (command.allowed) queueMicrotask(() => frames({ type: "ready" }));
        done();
        return;
      }
      if (command.type === "prompt") {
        done();
        return;
      }
      if (command.type === "get_state" && hold) {
        pending = command;
        hold = false;
        done();
        return;
      }
      const data =
        command.type === "get_state"
          ? state()
          : command.type === "d_pi_state"
            ? control
            : command.type === "d_pi_subagent_state"
              ? { agents: [] }
              : { protocolVersion: 2 };
      queueMicrotask(() =>
        frames({
          type: "response",
          id: command.id,
          command: command.type,
          success: true,
          data,
        }),
      );
      done();
    },
  });
  const child = Object.assign(new EventEmitter(), {
    pid: 999999,
    stdin,
    stdout,
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null,
    kill: vi.fn(),
  });
  adapters.spawn.mockImplementation((_binary, _args, options) => {
    sessionDirectory = options.env.PI_CODING_AGENT_SESSION_DIR;
    queueMicrotask(() =>
      frames({
        type: "d_pi_native_bootstrap",
        token: JSON.parse(options.env.D_PI_PROCESS_SUPERVISION).token,
      }),
    );
    return child;
  });
  const process = new EventEmitter();
  let scopeId = "";
  const host = createSessionHost(
    (message) => process.emit("message", { scopeId, message }),
    () => process.emit("exit"),
  );
  adapters.fork.mockReturnValue(
    Object.assign(process, {
      pid: globalThis.process.pid,
      postMessage: (raw: unknown) => {
        const envelope = HostTransportCommandSchema.parse(raw);
        scopeId = envelope.scopeId;
        void host.handle(envelope.command);
      },
    }),
  );
  const diagnostics: DiagnosticEvent[] = [];
  const runtime = new RuntimeService(
    store,
    root,
    root,
    {},
    () => {},
    () => {},
    (event) => {
      if (diagnosticFailure) throw Error("fixture diagnostic failure");
      diagnostics.push(event);
    },
  );
  const nativeExit = async () => {
    if (child.exitCode !== null) return;
    child.exitCode = 0;
    child.emit("close", 0, null);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
  };
  cleanup.push(() => {
    nativeExit();
    process.emit("exit");
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  for (const kind of ["allow", "start"] as const)
    await runtime.execute({
      kind,
      threadId: draft.threadId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
    });
  frames({ type: "d_pi_control_state", data: idle });
  const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
  const prepare = async () => {
    const reply = await runtime.submit({
      kind: "prepare",
      threadId: draft.threadId,
      submissionId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
      revision: 1,
      text: "B",
    });
    if (reply.kind !== "receipt") throw Error("prepare failed");
    return reply.receipt;
  };
  return {
    runtime,
    root,
    diagnostics,
    store,
    draft,
    host,
    frames,
    raw: (bytes: string) => stdout.write(bytes),
    state,
    commands,
    nativeExit,
    hostCrash: () => process.emit("exit", 17),
    prepare,
    dispatch: () =>
      runtime.submit({
        kind: "dispatch",
        threadId: draft.threadId,
        submissionId,
      }),
    holdState: () => {
      hold = true;
    },
    pendingState: () => {
      if (!pending) throw Error("missing pending state");
      return pending;
    },
    beginWithoutControlFrame: () => {
      control = { ...idle, streaming: true, admitted: true };
    },
    busy: () => {
      control = { ...idle, streaming: true, admitted: true };
      frames({ type: "d_pi_control_state", data: control });
    },
    idleControl: () => {
      control = idle;
      frames({ type: "d_pi_control_state", data: control });
    },
  };
}

it("records native exit separately from a utility crash without guessing a signal or a watchdog cause", async () => {
  const f = await running();
  await f.nativeExit();
  expect(f.diagnostics).toContainEqual(
    expect.objectContaining({
      operation: "runtime:native-exit",
      stage: "exited",
      threadId: f.draft.threadId,
      processPid: 999999,
      exitCode: 0,
      exitSignal: null,
      terminationReason: null,
      requestedExitCode: null,
    }),
  );
  const g = await running();
  g.hostCrash();
  expect(g.diagnostics).toContainEqual(
    expect.objectContaining({
      operation: "runtime:utility-exit",
      stage: "exited",
      threadId: g.draft.threadId,
      processPid: process.pid,
      exitCode: 17,
      exitSignal: null,
      terminationReason: null,
    }),
  );
});

it("same decoder batch cannot apply old idle after agent_start/ACK and lose the in-flight receipt", async () => {
  const f = await running();
  const receipt = await f.prepare();
  f.holdState();
  const query = f.host.handle({ kind: "state" });
  await f.dispatch();
  const request = f.pendingState();
  const oldIdle = f.state();
  f.beginWithoutControlFrame();
  f.frames(
    {
      type: "response",
      command: "get_state",
      id: request.id,
      success: true,
      data: oldIdle,
    },
    { type: "agent_start" },
    {
      type: "response",
      command: "prompt",
      id: receipt.requestId,
      success: true,
    },
  );
  await query;
  expect(f.runtime.hasActiveWork()).toBe(true);
  f.busy();
  await f.nativeExit();
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "unknown",
  });
});

it("ACK and fresh idle keep the submission pending until its identified terminal arrives", async () => {
  const f = await running();
  const receipt = await f.prepare();
  await f.dispatch();
  f.frames({
    type: "response",
    command: "prompt",
    id: receipt.requestId,
    success: true,
  });
  await f.host.handle({ kind: "state" });
  expect(f.runtime.hasActiveWork()).toBe(true);
  await expect(f.runtime.closeIdle()).rejects.toThrow("Active native work");
  f.frames({
    type: "prompt_result",
    id: receipt.requestId,
    status: "completed",
    agentInvoked: true,
    sessionSettled: true,
  });
  await f.host.handle({ kind: "state" });
  expect(f.runtime.hasActiveWork()).toBe(false);
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "completed",
  });
});

it("native exit after ACK and fresh idle preserves the missing terminal as unknown", async () => {
  const f = await running();
  const receipt = await f.prepare();
  await f.dispatch();
  f.frames({
    type: "response",
    command: "prompt",
    id: receipt.requestId,
    success: true,
  });
  await f.host.handle({ kind: "state" });
  await f.nativeExit();
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "unknown",
  });
  expect(
    f.commands.filter((command) => command.type === "prompt"),
  ).toHaveLength(1);
});

it.each([true, false])(
  "Runtime shutdown waits for disconnected Host group cleanup (confirmed=%s)",
  async (confirmed) => {
    const f = await running();
    let finish!: (confirmed: boolean) => void;
    adapters.terminate.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    f.hostCrash();
    let settled = false;
    const closing = f.runtime.closeIdle().finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish(confirmed);
    if (confirmed) await expect(closing).resolves.toBeUndefined();
    else {
      await expect(closing).rejects.toThrow(
        "Process group shutdown unconfirmed",
      );
      await expect(f.runtime.closeIdle()).rejects.toThrow();
    }
  },
);

it("an idle control sampled before dispatch cannot settle its later ACK", async () => {
  const f = await running();
  const receipt = await f.prepare();
  await f.dispatch();
  f.frames(
    { type: "d_pi_control_state", data: idle },
    {
      type: "response",
      command: "prompt",
      id: receipt.requestId,
      success: true,
    },
  );
  f.busy();
  await f.nativeExit();
  expect(f.store.submissions.submission(receipt.submissionId)?.outcome).toBe(
    "unknown",
  );
});

it("confirmed idle native exit releases its Host and lets normal idle close finish without querying the dead process", async () => {
  const f = await running();
  expect(f.runtime.hasActiveWork()).toBe(false);
  await f.nativeExit();
  expect(f.runtime.hasActiveWork()).toBe(false);
  const recoverable = await f.runtime.execute({
    kind: "inspect",
    threadId: f.draft.threadId,
    traceId: TraceIdSchema.parse(crypto.randomUUID()),
  });
  expect(recoverable.phase).toBe("interrupted");
  expect(recoverable.connectionGeneration).toBeUndefined();
  const count = f.commands.length;
  await f.runtime.closeIdle();
  expect(f.commands).toHaveLength(count);
});

it("idle sampled before a prompt reply cannot become settlement evidence when that reply arrives", async () => {
  const f = await running();
  const receipt = await f.prepare();
  await f.dispatch();
  await f.host.handle({ kind: "state" });
  expect(f.runtime.hasActiveWork()).toBe(true);
  f.beginWithoutControlFrame();
  f.frames({
    type: "response",
    command: "prompt",
    id: receipt.requestId,
    success: true,
  });
  expect(f.runtime.hasActiveWork()).toBe(true);
  await f.nativeExit();
  expect(f.store.submissions.submission(receipt.submissionId)?.outcome).toBe(
    "unknown",
  );
});

it("protocol disconnection alone still blocks quit; confirmed exit is a separate cleanup fact", async () => {
  const f = await running();
  // Enter through the actual decoder; the child has not emitted close yet.
  f.raw("{broken-json\n");
  expect(f.runtime.hasActiveWork()).toBe(true);
  await f.nativeExit();
  expect(f.runtime.hasActiveWork()).toBe(false);
});

it("correlates ACK, disconnection and unknown outcome without conflating transport loss with Host exit", async () => {
  const f = await running();
  const receipt = await f.prepare();
  await f.dispatch();
  f.busy();
  f.frames({
    type: "response",
    command: "prompt",
    id: receipt.requestId,
    success: true,
  });
  expect(f.diagnostics).toContainEqual(
    expect.objectContaining({
      traceId: receipt.traceId,
      requestId: receipt.requestId,
      submissionId: receipt.submissionId,
      receiptState: "acknowledged",
      outcome: "unobserved",
    }),
  );
  f.raw("{broken-json\n");
  expect(f.diagnostics).toContainEqual(
    expect.objectContaining({
      traceId: receipt.traceId,
      receiptState: "acknowledged",
      outcome: "unknown",
    }),
  );
  expect(f.diagnostics).toContainEqual(
    expect.objectContaining({
      operation: "runtime:host",
      stage: "disconnected",
      code: "protocol",
      connectionId: receipt.target.connectionGeneration,
      nativeProcessInstanceId: receipt.target.processInstanceId,
    }),
  );
  expect(f.diagnostics.some((event) => event.stage === "exited")).toBe(false);
  await f.nativeExit();
  expect(f.diagnostics).toContainEqual(
    expect.objectContaining({ operation: "runtime:host", stage: "exited" }),
  );
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "unknown",
  });
  expect(
    f.commands.filter((command) => command.type === "prompt"),
  ).toHaveLength(1);
  expect(JSON.stringify(f.diagnostics)).not.toContain('"text":"B"');
});

it("diagnostic failure cannot prevent an exited Host from preserving an unknown receipt", async () => {
  const f = await running(true);
  const receipt = await f.prepare();
  await f.dispatch();
  await expect(f.nativeExit()).resolves.toBeUndefined();
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "unknown",
    outcome: "unknown",
  });
  expect(
    f.commands.filter((command) => command.type === "prompt"),
  ).toHaveLength(1);
});

it("confirmed terminal duplicates keep coverage complete and a later identified error remains sticky", async () => {
  const f = await running();
  const receipt = await f.prepare();
  await f.dispatch();
  const completed = {
    type: "prompt_result",
    id: receipt.requestId,
    status: "completed",
    agentInvoked: true,
    sessionSettled: true,
  };
  f.frames(
    {
      type: "response",
      command: "prompt",
      id: receipt.requestId,
      success: true,
    },
    completed,
  );
  f.frames(completed);
  const view = await f.runtime.execute({
    kind: "inspect",
    threadId: f.draft.threadId,
    traceId: TraceIdSchema.parse(crypto.randomUUID()),
  });
  expect(view.evidenceCoverage).not.toBe("gap");
  f.frames({
    ...completed,
    status: "error",
    error: { retryable: true, httpStatus: 503, message: "provider-secret" },
  });
  f.frames(completed);
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "failed",
    promptResult: {
      status: "error",
      error: { retryable: true, httpStatus: 503 },
    },
  });
  expect(
    f.commands.filter((command) => command.type === "prompt"),
  ).toHaveLength(1);
});

it("decodes and persists a prompt terminal before ACK, keeps background work active and ignores an unknown id", async () => {
  const f = await running();
  const receipt = await f.prepare();
  await f.dispatch();
  f.busy();
  const backgroundFrames = readFileSync(
    new URL(
      "../../.scratch/omp-sdk-1887/evidence/sdk-correlation-18.8.7.frames.jsonl",
      import.meta.url,
    ),
    "utf8",
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const result = backgroundFrames.find(
    (frame) => frame.id === "completed-with-background",
  );
  expect(result).toMatchObject({ sessionSettled: false });
  f.frames({ ...result, id: receipt.requestId });
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "unknown",
    outcome: "completed",
    promptResult: { status: "completed", sessionSettled: false },
  });
  expect(f.store.drafts.read(f.draft.threadId).text).toBe("B");
  expect(f.runtime.hasActiveWork()).toBe(true);
  f.idleControl();
  f.frames({ type: "agent_end", isTerminal: true, messages: [] });
  await f.host.handle({ kind: "state" });
  expect(f.runtime.hasActiveWork()).toBe(true);
  await expect(f.runtime.closeIdle()).rejects.toThrow("Active native work");
  f.frames({
    type: "response",
    command: "prompt",
    id: receipt.requestId,
    success: true,
  });
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "completed",
  });
  expect(f.store.drafts.read(f.draft.threadId).text).toBe("");
  f.frames(backgroundFrames.find((frame) => frame.type === "session_settled"));
  await f.host.handle({ kind: "state" });
  expect(f.runtime.hasActiveWork()).toBe(false);
  f.frames({
    type: "prompt_result",
    id: "unknown-request",
    status: "error",
    agentInvoked: true,
    sessionSettled: true,
    error: { retryable: true, message: "private-provider-text" },
  });
  await f.nativeExit();
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    outcome: "completed",
  });
  expect(
    f.commands.filter((command) => command.type === "prompt"),
  ).toHaveLength(1);
});

it("replays bounded evidence in the same live Host after a SQLite failure without replaying prompt", async () => {
  const f = await running();
  const receipt = await f.prepare();
  await f.dispatch();
  const lock = new DatabaseSync(join(f.root, "app.sqlite"));
  try {
    lock.exec("BEGIN IMMEDIATE");
    f.frames(
      {
        type: "response",
        command: "prompt",
        id: receipt.requestId,
        success: true,
      },
      {
        type: "prompt_result",
        id: receipt.requestId,
        status: "aborted",
        agentInvoked: true,
        sessionSettled: true,
      },
    );
    expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
      state: "dispatching",
      outcome: "unobserved",
    });
    expect(f.store.drafts.read(f.draft.threadId).text).toBe("B");
    expect(
      await f.runtime.execute({
        kind: "inspect",
        threadId: f.draft.threadId,
        traceId: TraceIdSchema.parse(crypto.randomUUID()),
      }),
    ).toMatchObject({ evidenceCoverage: "gap" });
    lock.exec("ROLLBACK");
    await f.host.handle({ kind: "replay-evidence" });
    expect(
      await f.runtime.execute({
        kind: "inspect",
        threadId: f.draft.threadId,
        traceId: TraceIdSchema.parse(crypto.randomUUID()),
      }),
    ).toMatchObject({ evidenceCoverage: "complete" });
    expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
      state: "acknowledged",
      outcome: "aborted",
    });
    expect(f.store.drafts.read(f.draft.threadId).text).toBe("");
    expect(
      f.commands.filter((command) => command.type === "prompt"),
    ).toHaveLength(1);
  } finally {
    lock.close();
  }
});

it("keeps actual 18.8.7 queued-steer intermediate end active until independent prompt and session receipts", async () => {
  const recorded = readFileSync(
    new URL(
      "../../.scratch/omp-sdk-1887/evidence/sdk-control-18.8.7.frames.jsonl",
      import.meta.url,
    ),
    "utf8",
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const start = recorded.findLastIndex(
    (frame) => frame.type === "agent_end" && frame.isTerminal === false,
  );
  expect(start).toBeGreaterThan(0);
  const end = recorded
    .slice(start + 1)
    .find((frame) => frame.type === "agent_end" && frame.isTerminal === true);
  const result = recorded
    .slice(start + 1)
    .find(
      (frame) => frame.type === "prompt_result" && frame.status === "completed",
    );
  const settled = recorded
    .slice(start + 1)
    .find((frame) => frame.type === "session_settled");
  expect(end && result && settled).toBeTruthy();
  const f = await running();
  const receipt = await f.prepare();
  await f.dispatch();
  f.frames({
    type: "response",
    command: "prompt",
    id: receipt.requestId,
    success: true,
  });
  f.busy();
  await f.host.handle({ kind: "state" });
  const reads = f.commands.filter(
    (command) => command.type === "get_state",
  ).length;
  f.frames(recorded[start]);
  await Promise.resolve();
  await Promise.resolve();
  expect(
    f.commands.filter((command) => command.type === "get_state"),
  ).toHaveLength(reads);
  expect(f.runtime.hasActiveWork()).toBe(true);
  expect(await f.runtime.releaseIfIdle()).toBe(false);
  await expect(f.runtime.closeIdle()).rejects.toThrow("Active native work");
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "unobserved",
  });
  f.idleControl();
  f.frames(end);
  await f.host.handle({ kind: "state" });
  expect(f.runtime.hasActiveWork()).toBe(true);
  await expect(f.runtime.closeIdle()).rejects.toThrow("Active native work");
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    outcome: "unobserved",
  });
  f.frames({ ...result, id: receipt.requestId });
  f.frames(settled);
  await f.host.handle({ kind: "state" });
  expect(f.runtime.hasActiveWork()).toBe(false);
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "completed",
  });
  expect(
    f.commands.filter((command) => command.type === "prompt"),
  ).toHaveLength(1);
});

it("idle cannot dispose unconfirmed terminal evidence after ACK was already committed", async () => {
  const f = await running();
  const receipt = await f.prepare();
  await f.dispatch();
  f.frames({
    type: "response",
    command: "prompt",
    id: receipt.requestId,
    success: true,
  });
  const lock = new DatabaseSync(join(f.root, "app.sqlite"));
  try {
    lock.exec("BEGIN IMMEDIATE");
    f.frames({
      type: "prompt_result",
      id: receipt.requestId,
      status: "completed",
      agentInvoked: true,
      sessionSettled: true,
    });
    await f.host.handle({ kind: "state" });
    expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
      state: "acknowledged",
      outcome: "unobserved",
    });
    expect(f.runtime.hasActiveWork()).toBe(true);
    await expect(f.runtime.closeIdle()).rejects.toThrow("Active native work");
    lock.exec("ROLLBACK");
    await f.host.handle({ kind: "replay-evidence" });
    await f.host.handle({ kind: "state" });
    expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
      state: "acknowledged",
      outcome: "completed",
    });
    expect(f.runtime.hasActiveWork()).toBe(false);
    expect(
      f.commands.filter((command) => command.type === "prompt"),
    ).toHaveLength(1);
  } finally {
    lock.close();
  }
});

it.each([
  ["local", "completed", false],
  ["builtinLocal", "completed", false],
  ["steer", "completed", true],
  ["aborted", "aborted", true],
  ["error", "error", false],
] as const)(
  "persists the recorded SDK 18.4.6 %s outcome through the real decoder/session/Host/Main/SQLite chain",
  async (scenario, status, agentInvoked) => {
    const f = await running();
    const receipt = await f.prepare();
    await f.dispatch();
    const evidence =
      scenario === "error"
        ? "sdk-failure-18.4.6.frames.jsonl"
        : "sdk-outcomes-18.4.6.frames.jsonl";
    const frames = readFileSync(
      new URL(
        `../../.scratch/runtime-hardening-omp1845/evidence/${evidence}`,
        import.meta.url,
      ),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const metadata =
      scenario === "error"
        ? null
        : JSON.parse(
            readFileSync(
              new URL(
                `../../.scratch/runtime-hardening-omp1845/evidence/${evidence}.metadata.json`,
                import.meta.url,
              ),
              "utf8",
            ),
          );
    const id =
      scenario === "error"
        ? frames.find((frame) => frame.type === "prompt_result").id
        : scenario === "steer"
          ? metadata.cases.steer[1]
          : metadata.cases[scenario];
    // Preserve the recorded fields and relative ordering of ACK/error/terminal;
    // only bind the disposable fixture id to this App-owned frozen submission.
    for (const frame of frames.filter(
      (frame) =>
        frame.id === id && ["response", "prompt_result"].includes(frame.type),
    )) {
      f.frames({ ...frame, id: receipt.requestId });
    }
    expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
      state: "acknowledged",
      outcome: status === "error" ? "failed" : status,
      promptResult: {
        source:
          scenario === "builtinLocal"
            ? "native-local-response"
            : "native-prompt-result",
        status,
        agentInvoked,
      },
    });
    expect(f.store.drafts.read(f.draft.threadId).text).toBe("");
    expect(
      f.commands.filter((command) => command.type === "prompt"),
    ).toHaveLength(1);
  },
);

// This fault injection holds a real SQLite write lock across ACK, terminal,
// disconnection and Host exit. Each attempted write waits for busy_timeout;
// allow the repeated waits on hosted macOS runners without relaxing assertions.
it("a Host loss after Main write failure loses only memory evidence and reopens conservatively without resending", {
  timeout: 15000,
}, async () => {
  const f = await running();
  const receipt = await f.prepare();
  await f.dispatch();
  const path = join(f.root, "app.sqlite");
  const lock = new DatabaseSync(path);
  try {
    lock.exec("BEGIN IMMEDIATE");
    f.frames(
      {
        type: "response",
        command: "prompt",
        id: receipt.requestId,
        success: true,
      },
      {
        type: "prompt_result",
        id: receipt.requestId,
        status: "completed",
        agentInvoked: true,
        sessionSettled: true,
      },
    );
    await f.nativeExit();
    expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
      state: "dispatching",
      acknowledgedAt: null,
      outcome: "unobserved",
    });
    lock.exec("ROLLBACK");
    f.store.close();
    const restarted = AppStorage.open(path);
    try {
      expect(
        restarted.submissions.submission(receipt.submissionId),
      ).toMatchObject({
        state: "unknown",
        acknowledgedAt: null,
        outcome: "unknown",
        text: "B",
      });
      expect(restarted.drafts.read(f.draft.threadId).text).toBe("B");
      expect(
        f.commands.filter((command) => command.type === "prompt"),
      ).toHaveLength(1);
    } finally {
      restarted.close();
    }
  } finally {
    lock.close();
  }
});
