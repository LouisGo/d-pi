import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { HostCommandSchema } from "../../modules/execution/contracts/public";
import { SubmissionIdSchema } from "../../modules/execution/contracts/public";
import { createSessionHost } from "../../modules/execution/host/public";
import { TraceIdSchema } from "../../shared/identity";
import { RuntimeService } from "../../modules/execution/main/public";
import { AppStorage } from "./wiring/app-storage";

const adapters = vi.hoisted(() => ({ fork: vi.fn(), spawn: vi.fn() }));
vi.mock("electron", () => ({ utilityProcess: { fork: adapters.fork } }));
vi.mock("node:child_process", () => ({ spawn: adapters.spawn }));
vi.mock("../../platform/omp/resources/public", () => ({
  managedSdkRuntime: async () => ({
    binary: "/fixture/bun",
    entry: "/fixture/host.mjs",
  }),
}));
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
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
async function running() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "d-pi-causal-")));
  const project = join(root, "project");
  mkdirSync(project);
  const store = new AppStorage(join(root, "app.sqlite"));
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
    stdin,
    stdout,
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null,
    kill: vi.fn(),
  });
  adapters.spawn.mockImplementation((_binary, _args, options) => {
    sessionDirectory = options.env.PI_CODING_AGENT_SESSION_DIR;
    queueMicrotask(() => frames({ type: "ready" }));
    return child;
  });
  const process = new EventEmitter();
  const host = createSessionHost(
    (message) => process.emit("message", message),
    () => process.emit("exit"),
  );
  adapters.fork.mockReturnValue(
    Object.assign(process, {
      postMessage: (raw: unknown) => {
        void host.handle(HostCommandSchema.parse(raw));
      },
    }),
  );
  const runtime = new RuntimeService(store, root, root, {}, () => {});
  const nativeExit = () => {
    if (child.exitCode !== null) return;
    child.exitCode = 0;
    child.emit("close", 0);
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
    store,
    draft,
    host,
    frames,
    raw: (bytes: string) => stdout.write(bytes),
    state,
    commands,
    nativeExit,
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
  };
}

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
  f.nativeExit();
  expect(f.store.submissions.submission(receipt.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "unknown",
  });
});

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
  f.nativeExit();
  expect(f.store.submissions.submission(receipt.submissionId)?.outcome).toBe(
    "unknown",
  );
});

it("confirmed idle native exit releases its Host and lets normal idle close finish without querying the dead process", async () => {
  const f = await running();
  expect(f.runtime.hasActiveWork()).toBe(false);
  f.nativeExit();
  expect(f.runtime.hasActiveWork()).toBe(false);
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
  f.nativeExit();
  expect(f.store.submissions.submission(receipt.submissionId)?.outcome).toBe(
    "unknown",
  );
});

it("protocol disconnection alone still blocks quit; confirmed exit is a separate cleanup fact", async () => {
  const f = await running();
  // Enter through the actual decoder; the child has not emitted close yet.
  f.raw("{broken-json\n");
  expect(f.runtime.hasActiveWork()).toBe(true);
  f.nativeExit();
  expect(f.runtime.hasActiveWork()).toBe(false);
});
