import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { ConversationProjection } from "../../src/modules/conversation/host/public";
import {
  type HostMessage,
  HostMessageSchema,
  type HostStart,
  HostTransportCommandSchema,
  SubmissionIdSchema,
  type SubmissionReply,
} from "../../src/modules/execution/contracts/public";
import {
  createSessionHost,
  type SessionHost,
} from "../../src/modules/execution/host/public";
import { RuntimeService } from "../../src/modules/execution/main/public";
import type { DiagnosticEvent } from "../../src/platform/main/diagnostics/public";
import { TraceIdSchema } from "../../src/shared/identity";

const adapters = vi.hoisted(() => ({ fork: vi.fn(), spawn: vi.fn() }));
vi.mock("electron", () => ({ utilityProcess: { fork: adapters.fork } }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
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
    parentPid: process.pid,
    groupId: pid,
  }),
  terminateManagedGroup: async () => true,
}));

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

// Inspired by T3 ProviderReplayGate.testkit.ts: gates suspend the next inbound
// transcript step, not the decoder or application. Each owner has one cursor.
class ReplayGate {
  private readonly entries = new Map<
    string,
    {
      reached: ReturnType<typeof latch>;
      released: ReturnType<typeof latch>;
      emitted: boolean;
    }
  >();
  add(label: string) {
    if (this.entries.has(label)) throw Error(`Duplicate gate ${label}`);
    const entry = { reached: latch(), released: latch(), emitted: false };
    this.entries.set(label, entry);
    return entry;
  }
  reached(label: string) {
    return this.entry(label).reached.promise;
  }
  release(label: string) {
    this.entry(label).released.resolve();
  }
  releaseAll() {
    for (const entry of this.entries.values()) entry.released.resolve();
  }
  complete() {
    expect([...this.entries.values()].every((entry) => entry.emitted)).toBe(
      true,
    );
  }
  private entry(label: string) {
    const value = this.entries.get(label);
    if (!value) throw Error(`Missing gate ${label}`);
    return value;
  }
}

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
const OutboundSchema = z.looseObject({
  type: z.string(),
  id: z.string().optional(),
  allowed: z.boolean().optional(),
});
type Outbound = z.infer<typeof OutboundSchema>;

// Only spawn/stdio/process identity are fixtures. All commands and inbound bytes
// traverse NativeSession, FrameDecoder, SessionHost, Main and real SQLite.
class ReplayNative {
  readonly stdout = new PassThrough();
  readonly gate = new ReplayGate();
  readonly commands: Outbound[] = [];
  readonly emitted: {
    cursor: number;
    kind: "outbound" | "inbound" | "gate" | "exit";
    label: string;
  }[] = [];
  readonly unexpected: string[] = [];
  readonly child: EventEmitter & {
    pid: number;
    stdin: Writable;
    stdout: PassThrough;
    stderr: PassThrough;
    exitCode: number | null;
    signalCode: null;
    kill: ReturnType<typeof vi.fn>;
  };
  control = idle;
  sessionDirectory = "";
  holdState = false;
  private cursor = 0;
  private flight = Promise.resolve();
  private readonly waiting: {
    type: string;
    after: number;
    resolve: (command: Outbound) => void;
  }[] = [];
  constructor(pid: number) {
    this.child = Object.assign(new EventEmitter(), {
      pid,
      stdout: this.stdout,
      stderr: new PassThrough(),
      exitCode: null as number | null,
      signalCode: null,
      kill: vi.fn(),
      stdin: new Writable({
        write: (bytes, _encoding, done) => {
          const command = OutboundSchema.parse(JSON.parse(bytes.toString()));
          this.commands.push(command);
          this.record("outbound", command.type);
          for (const waiter of [...this.waiting]) {
            if (
              command.type === waiter.type &&
              this.commands.length > waiter.after
            ) {
              this.waiting.splice(this.waiting.indexOf(waiter), 1);
              waiter.resolve(command);
            }
          }
          if (command.type === "d_pi_native_permit") {
            if (command.allowed)
              queueMicrotask(() => this.frames({ type: "ready" }));
          } else if (
            command.type === "prompt" ||
            command.type === "d_pi_stop" ||
            command.type === "d_pi_continue"
          ) {
            // Execution/control replies are explicit transcript steps below.
          } else if (command.type === "get_state" && this.holdState)
            this.holdState = false;
          else {
            const data =
              command.type === "get_state"
                ? this.state()
                : command.type === "d_pi_state"
                  ? this.control
                  : command.type === "d_pi_subagent_state"
                    ? { agents: [] }
                    : command.type === "negotiate_protocol"
                      ? { protocolVersion: 2 }
                      : command.type === "set_subagent_subscription"
                        ? { level: "events" }
                        : command.type === "get_subagents"
                          ? { subagents: [] }
                          : null;
            if (data === null) {
              this.unexpected.push(command.type);
              done(Error(`Unscripted native command ${command.type}`));
              return;
            }
            queueMicrotask(() => this.frames(this.response(command, data)));
          }
          done();
        },
      }),
    });
  }
  state() {
    return {
      sessionId: "fixture-native",
      sessionFile: join(this.sessionDirectory, "session.jsonl"),
      model: { id: "fixture-model", provider: "fixture" },
      isStreaming: this.control.streaming,
      isCompacting: false,
      queuedMessageCount: 0,
    };
  }
  response(command: Outbound, data: unknown) {
    return {
      type: "response",
      command: command.type,
      id: command.id,
      success: true,
      data,
    };
  }
  frames(...values: object[]) {
    // One write is one decoder batch: no awaits between its frames.
    this.record(
      "inbound",
      values.map((value) => OutboundSchema.parse(value).type).join(","),
    );
    this.stdout.write(
      values.map((value) => JSON.stringify(value)).join("\n") + "\n",
    );
  }
  command(type: string, after = 0): Promise<Outbound> {
    const existing = this.commands
      .slice(after)
      .find((command) => command.type === type);
    return existing
      ? Promise.resolve(existing)
      : new Promise((resolve) => this.waiting.push({ type, after, resolve }));
  }
  step(label: string, emit: () => void): Promise<void> {
    const entry = this.gate.add(label);
    this.flight = this.flight.then(async () => {
      entry.reached.resolve();
      await entry.released.promise;
      this.record("gate", label);
      emit();
      entry.emitted = true;
    });
    return this.flight;
  }
  exit() {
    if (this.child.exitCode !== null) return;
    this.child.exitCode = 0;
    this.record("exit", "child-close");
    this.child.emit("close", 0, null);
  }
  complete() {
    this.gate.complete();
    expect(this.unexpected).toEqual([]);
    expect(this.emitted.map(({ cursor }) => cursor)).toEqual(
      Array.from({ length: this.cursor }, (_, index) => index + 1),
    );
  }
  raw(bytes: string) {
    this.record("inbound", "raw");
    this.stdout.write(bytes);
  }
  private record(kind: ReplayNative["emitted"][number]["kind"], label: string) {
    this.emitted.push({ cursor: ++this.cursor, kind, label });
  }
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});

async function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "d-pi-native-replay-")));
  const store = AppStorage.open(join(root, "app.sqlite"));
  const utility = Object.assign(new EventEmitter(), {
    pid: process.pid,
    kill: vi.fn(),
    postMessage: (_raw: unknown) => {},
  });
  const owners = new Map<
    string,
    {
      host: SessionHost;
      native: ReplayNative;
      start: HostStart | undefined;
      projection: ConversationProjection | undefined;
      work: Set<Promise<void>>;
      closed: ReturnType<typeof latch>;
    }
  >();
  const byDirectory = new Map<string, ReplayNative>();
  const diagnostics: DiagnosticEvent[] = [];
  const replies: SubmissionReply[] = [];
  adapters.spawn.mockImplementation((_binary, _args, options) => {
    const endpoint = byDirectory.get(options.cwd);
    if (!endpoint) throw Error("Missing native transcript owner");
    endpoint.sessionDirectory = options.env.PI_CODING_AGENT_SESSION_DIR;
    queueMicrotask(() =>
      endpoint.frames({
        type: "d_pi_native_bootstrap",
        token: JSON.parse(options.env.D_PI_PROCESS_SUPERVISION).token,
      }),
    );
    return endpoint.child;
  });
  utility.postMessage = (raw: unknown) => {
    const envelope = HostTransportCommandSchema.parse(raw);
    let owner = owners.get(envelope.scopeId);
    if (!owner) {
      if (envelope.command.kind !== "start") throw Error("Missing Host owner");
      const endpoint = new ReplayNative(999000 + owners.size);
      const next = {
        native: endpoint,
        closed: latch(),
        work: new Set<Promise<void>>(),
        host: undefined as unknown as SessionHost,
        start: undefined as HostStart | undefined,
        projection: undefined as ConversationProjection | undefined,
      };
      next.host = createSessionHost(
        (message) =>
          utility.emit("message", { scopeId: envelope.scopeId, message }),
        () => {
          utility.emit("message", {
            scopeId: envelope.scopeId,
            message: { kind: "scope-closed" },
          });
          next.closed.resolve();
        },
        {
          onStart: (start) => {
            next.start = start;
            next.projection = new ConversationProjection(
              start.connectionGeneration,
              () => {},
            );
          },
          onNativeFrame: (frame) => next.projection?.accept(frame),
          onDispose: () => next.projection?.dispose(),
        },
      );
      byDirectory.set(envelope.command.identity.directory, endpoint);
      owners.set(envelope.scopeId, next);
      owner = next;
    }
    const current = owner;
    const work = current.host.handle(envelope.command);
    current.work.add(work);
    void work.finally(() => current.work.delete(work));
  };
  adapters.fork.mockReturnValue(utility);
  cleanups.push(async () => {
    for (const owner of owners.values()) {
      owner.native.gate.releaseAll();
      owner.native.exit();
    }
    await Promise.all([...owners.values()].flatMap((owner) => [...owner.work]));
    utility.emit("exit", 0);
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  async function running(name: string) {
    const project = join(root, name);
    mkdirSync(project);
    const draft = store.drafts.create(project);
    store.drafts.save(draft.threadId, 0, `input-${name}`);
    const runtime = new RuntimeService(
      store,
      root,
      root,
      {},
      () => {},
      (reply) => replies.push(reply),
      (event) => diagnostics.push(event),
      draft.threadId,
    );
    for (const kind of ["allow", "start"] as const)
      await runtime.execute({
        kind,
        threadId: draft.threadId,
        traceId: TraceIdSchema.parse(crypto.randomUUID()),
      });
    const owner = [...owners.values()].find(
      (owner) => owner.start?.threadId === draft.threadId,
    );
    if (!owner?.start || !owner.projection)
      throw Error("Missing started owner");
    const start = owner.start;
    const native = owner.native;
    const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
    const prepare = async () => {
      const reply = await runtime.submit({
        kind: "prepare",
        threadId: draft.threadId,
        submissionId,
        traceId: TraceIdSchema.parse(crypto.randomUUID()),
        revision: 1,
        text: `input-${name}`,
      });
      if (reply.kind !== "receipt") throw Error("Missing prepared receipt");
      return reply.receipt;
    };
    return {
      runtime,
      draft,
      native,
      host: owner.host,
      start,
      projection: owner.projection,
      closed: owner.closed.promise,
      prepare,
      dispatch: () =>
        runtime.submit({
          kind: "dispatch",
          threadId: draft.threadId,
          submissionId,
        }),
      emitHost: (message: HostMessage) =>
        utility.emit("message", {
          scopeId: start.processInstanceId,
          message: HostMessageSchema.parse(message),
        }),
    };
  }
  return { store, diagnostics, replies, running };
}

async function pass(
  native: ReplayNative,
  label: string,
  emitted: Promise<void>,
) {
  await native.gate.reached(label);
  native.gate.release(label);
  await emitted;
}

it("ACK then protocol loss preserves SQLite receipt, newer draft and readable projection until independent physical exit", async () => {
  const f = await fixture();
  const a = await f.running("a");
  const receipt = await a.prepare();
  await a.dispatch();
  f.store.drafts.save(a.draft.threadId, 1, "newer-draft");
  await pass(
    a.native,
    "ack",
    a.native.step("ack", () =>
      a.native.frames(
        {
          type: "response",
          command: "prompt",
          id: receipt.requestId,
          success: true,
        },
        {
          type: "message_end",
          message: { role: "assistant", content: "readable-before-loss" },
        },
      ),
    ),
  );
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "unobserved",
  });
  const loss = a.native.step("protocol-loss", () =>
    a.native.raw("{broken-json\n"),
  );
  await a.native.gate.reached("protocol-loss");
  expect(a.runtime.hasActiveWork()).toBe(true);
  a.native.gate.release("protocol-loss");
  await loss;
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "unknown",
    traceId: receipt.traceId,
    target: receipt.target,
  });
  expect(f.store.drafts.read(a.draft.threadId).text).toBe("newer-draft");
  expect(a.projection.snapshot().items).toContainEqual(
    expect.objectContaining({
      text: "readable-before-loss",
      state: "complete",
    }),
  );
  expect(f.diagnostics).toContainEqual(
    expect.objectContaining({
      operation: "runtime:host",
      stage: "disconnected",
      code: "protocol",
      causeCode: "native-protocol",
      connectionId: receipt.target.connectionGeneration,
      nativeProcessInstanceId: receipt.target.processInstanceId,
    }),
  );
  expect(f.diagnostics.some((event) => event.stage === "exited")).toBe(false);
  expect(a.runtime.hasActiveWork()).toBe(true);
  await pass(
    a.native,
    "child-close",
    a.native.step("child-close", () => a.native.exit()),
  );
  await a.closed;
  // Physical close is established, but the missing prompt result remains
  // execution uncertainty and must not be cleared by the task Scope.
  expect(a.runtime.hasActiveWork()).toBe(true);
  expect(f.diagnostics).toContainEqual(
    expect.objectContaining({
      operation: "runtime:native-exit",
      stage: "exited",
      connectionId: a.start.connectionGeneration,
    }),
  );
  expect(
    a.native.commands.filter((command) => command.type === "prompt"),
  ).toHaveLength(1);
  expect(JSON.stringify(f.diagnostics)).not.toContain("readable-before-loss");
  a.native.complete();
});

it("malformed native control data keeps the caller trace and a safe protocol cause in Main without leaking parse input", async () => {
  const f = await fixture();
  const a = await f.running("a");
  const traceId = TraceIdSchema.parse(crypto.randomUUID());
  await a.runtime.execute({
    kind: "stop",
    threadId: a.draft.threadId,
    connectionGeneration: a.start.connectionGeneration,
    traceId,
  });
  const stop = await a.native.command("d_pi_stop");
  await pass(
    a.native,
    "malformed",
    a.native.step("malformed", () =>
      a.native.frames(
        a.native.response(stop, { background: "API_KEY=secret" }),
      ),
    ),
  );
  // Wait at the actual Host operation boundary, not for an elapsed delay.
  await a.host.handle({ kind: "state" });
  expect(f.diagnostics).toContainEqual(
    expect.objectContaining({
      traceId,
      operation: "runtime:stop",
      stage: "unknown",
      causeCode: "native-protocol",
      connectionId: a.start.connectionGeneration,
    }),
  );
  expect(JSON.stringify(f.diagnostics)).not.toContain("API_KEY");
  a.native.complete();
});

it("a local projection defect keeps unknown attribution in Main while retaining its unacknowledged SQLite receipt", async () => {
  const f = await fixture();
  const a = await f.running("a");
  const receipt = await a.prepare();
  await a.dispatch();
  const accept = vi.spyOn(a.projection, "accept").mockImplementationOnce(() => {
    throw Error("API_KEY=secret");
  });
  try {
    await pass(
      a.native,
      "observer-defect",
      a.native.step("observer-defect", () =>
        a.native.frames({
          type: "message_end",
          message: { role: "assistant", content: "valid-frame" },
        }),
      ),
    );
    expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
      state: "unknown",
      outcome: "unknown",
    });
    expect(f.store.drafts.read(a.draft.threadId).text).toBe("input-a");
    const event = f.diagnostics.find(
      (event) =>
        event.operation === "runtime:host" && event.stage === "disconnected",
    );
    expect(event).toMatchObject({
      code: "unknown",
      connectionId: a.start.connectionGeneration,
    });
    expect(event).not.toHaveProperty("causeCode");
    expect(JSON.stringify(f.diagnostics)).not.toContain("API_KEY");
    expect(
      a.native.commands.filter((command) => command.type === "prompt"),
    ).toHaveLength(1);
    a.native.complete();
  } finally {
    accept.mockRestore();
  }
});

it.each([true, false])(
  "Stop acknowledgment and terminal tail remain independent (stop reply first=%s)",
  async (replyFirst) => {
    const f = await fixture();
    const a = await f.running("a");
    const receipt = await a.prepare();
    await a.dispatch();
    await pass(
      a.native,
      "tool-start",
      a.native.step("tool-start", () =>
        a.native.frames(
          {
            type: "response",
            command: "prompt",
            id: receipt.requestId,
            success: true,
          },
          {
            type: "tool_execution_start",
            toolCallId: "tool-a",
            toolName: "fixture-read",
          },
        ),
      ),
    );
    const traceId = TraceIdSchema.parse(crypto.randomUUID());
    await a.runtime.execute({
      kind: "stop",
      threadId: a.draft.threadId,
      connectionGeneration: a.start.connectionGeneration,
      traceId,
    });
    const stop = await a.native.command("d_pi_stop");
    const reply = () =>
      a.native.frames(a.native.response(stop, { ...idle, paused: true }));
    const tail = () =>
      a.native.frames(
        {
          type: "tool_execution_end",
          toolCallId: "tool-a",
          toolName: "fixture-read",
          isError: false,
          result: { content: [{ type: "text", text: "tail-result" }] },
        },
        {
          type: "message_end",
          message: { role: "assistant", content: "tail-message" },
        },
        {
          type: "prompt_result",
          id: receipt.requestId,
          status: "aborted",
          agentInvoked: true,
          sessionSettled: true,
        },
      );
    await pass(
      a.native,
      "first",
      a.native.step("first", replyFirst ? reply : tail),
    );
    if (replyFirst)
      expect(
        f.store.submissions.submission(receipt.submissionId)?.outcome,
      ).toBe("unobserved");
    else
      expect(
        f.diagnostics.some(
          (event) =>
            event.traceId === traceId && event.stage === "acknowledged",
        ),
      ).toBe(false);
    await pass(
      a.native,
      "second",
      a.native.step("second", replyFirst ? tail : reply),
    );
    await a.host.handle({ kind: "state" });
    expect(f.diagnostics).toContainEqual(
      expect.objectContaining({
        traceId,
        operation: "runtime:stop",
        stage: "acknowledged",
        connectionId: a.start.connectionGeneration,
      }),
    );
    expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
      state: "acknowledged",
      outcome: "aborted",
    });
    expect(a.projection.snapshot().items).toMatchObject([
      { role: "tool", text: "tail-result", state: "complete" },
      { role: "assistant", text: "tail-message", state: "complete" },
    ]);
    await pass(
      a.native,
      "child-close",
      a.native.step("child-close", () => a.native.exit()),
    );
    await a.closed;
    expect(a.runtime.hasActiveWork()).toBe(false);
    expect(
      a.native.commands.filter((command) => command.type === "prompt"),
    ).toHaveLength(1);
    expect(
      a.native.commands.filter((command) => command.type === "d_pi_stop"),
    ).toHaveLength(1);
    a.native.complete();
  },
);

it("closing one generation cancels its read while late source bytes and old-generation messages cannot settle another owner's read or receipt", async () => {
  const f = await fixture();
  const a = await f.running("a");
  const b = await f.running("b");
  const ar = await a.prepare();
  await a.dispatch();
  const br = await b.prepare();
  await b.dispatch();
  const aAfter = a.native.commands.length;
  const bAfter = b.native.commands.length;
  a.native.holdState = true;
  b.native.holdState = true;
  const aRead = a.host.handle({ kind: "state" });
  const bRead = b.host.handle({ kind: "state" });
  const aq = await a.native.command("get_state", aAfter);
  const bq = await b.native.command("get_state", bAfter);
  let bSettled = false;
  void bRead.then(() => {
    bSettled = true;
  });
  const aLoss = a.native.step("loss", () => a.native.raw("{broken-json\n"));
  const bReply = b.native.step("reply", () =>
    b.native.frames(b.native.response(bq, b.native.state())),
  );
  await a.native.gate.reached("loss");
  await b.native.gate.reached("reply");
  a.native.gate.release("loss");
  await aLoss;
  await aRead;
  expect(bSettled).toBe(false);
  // Deliberately reuse B's live request id in A's old source. The native owner,
  // Host generation and full receipt target remain the correlation boundary.
  await pass(
    a.native,
    "late",
    a.native.step("late", () => {
      a.native.frames(
        a.native.response({ ...aq, id: bq.id }, a.native.state()),
        {
          type: "message_end",
          message: { role: "assistant", content: "old-source" },
        },
      );
      b.emitHost({
        kind: "operation-result",
        operation: "stop",
        status: "acknowledged",
        traceId: br.traceId,
        connectionGeneration: a.start.connectionGeneration,
      });
      b.emitHost({
        kind: "submission",
        evidenceId: crypto.randomUUID(),
        event: {
          kind: "ack",
          submissionId: br.submissionId,
          requestId: br.requestId,
          target: ar.target,
        },
      });
    }),
  );
  expect(bSettled).toBe(false);
  expect(f.store.submissions.submission(br.submissionId)).toMatchObject({
    state: "dispatching",
    outcome: "unobserved",
  });
  expect(f.replies).toContainEqual(
    expect.objectContaining({
      kind: "failed",
      code: "stale-event",
      error: expect.objectContaining({ traceId: br.traceId }),
    }),
  );
  expect(f.store.drafts.read(b.draft.threadId).text).toBe("input-b");
  expect(b.projection.snapshot().items).toEqual([]);
  expect(
    f.diagnostics.some(
      (event) =>
        event.traceId === br.traceId && event.operation === "runtime:stop",
    ),
  ).toBe(false);
  await pass(
    a.native,
    "child-close",
    a.native.step("child-close", () => a.native.exit()),
  );
  expect(b.runtime.hasActiveWork()).toBe(true);
  b.native.gate.release("reply");
  await bReply;
  await bRead;
  expect(bSettled).toBe(true);
  await pass(
    b.native,
    "ack",
    b.native.step("ack", () =>
      b.native.frames({
        type: "response",
        command: "prompt",
        id: br.requestId,
        success: true,
      }),
    ),
  );
  expect(f.store.submissions.submission(br.submissionId)?.state).toBe(
    "acknowledged",
  );
  expect(f.store.submissions.submission(ar.submissionId)).toMatchObject({
    state: "unknown",
    outcome: "unknown",
  });
  expect(
    a.native.commands.filter((command) => command.type === "prompt"),
  ).toHaveLength(1);
  expect(
    b.native.commands.filter((command) => command.type === "prompt"),
  ).toHaveLength(1);
  a.native.complete();
  b.native.complete();
});
