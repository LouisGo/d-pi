import { afterEach, expect, it, vi } from "vitest";
import type {
  HostMessage,
  HostStart,
} from "../features/runtime/host-contracts";
import { FrozenSubmissionSchema } from "../features/submission/contracts";
import type { NativeObservation, NativeSessionOptions } from "./native-session";
import { createSessionHost } from "./session-host";

const native = vi.hoisted(() => ({
  observers: [] as ((event: NativeObservation) => void)[],
  writes: [] as string[],
  close: vi.fn(),
  controlRequest: vi.fn(),
}));
vi.mock("./native-session", () => ({
  NativeSession: class {
    constructor(
      private options: NativeSessionOptions,
      observe: (event: NativeObservation) => void,
    ) {
      native.observers.push(observe);
    }
    async start() {}
    async close() {
      native.close();
    }
    write(frame: string) {
      native.writes.push(frame);
    }
    async request(command: string) {
      if (command === "d_pi_state") return native.controlRequest();
      return {
        success: true,
        data: {
          sessionId: "session",
          sessionFile: `${this.options.sessionDirectory}/session.jsonl`,
          model: { id: "model", provider: "fixture" },
          isStreaming: false,
          isCompacting: false,
          queuedMessageCount: 0,
        },
      };
    }
  },
}));
vi.mock("../shared/node/directory", () => ({
  identifyDirectory: async (directory: string) => ({
    directory,
    device: "1",
    inode: "2",
  }),
}));
afterEach(() => {
  vi.useRealTimers();
  native.observers.length = 0;
  native.writes.length = 0;
  native.close.mockReset();
  native.controlRequest.mockReset();
});

it("does not close from an idle query overtaken by observed background activity", async () => {
  const messages: HostMessage[] = [];
  const exit = vi.fn();
  const host = createSessionHost((message) => messages.push(message), exit);
  const idle = {
    paused: false,
    stopping: false,
    pendingAsync: false,
    admitted: false,
    streaming: false,
    compacting: false,
    queued: 0,
    background: 0,
    queue: [],
  };
  native.controlRequest.mockResolvedValue({ success: true, data: idle });
  await host.handle({
    kind: "start",
    threadId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    configContextId: "fixture",
    binary: "/fixture/bun",
    sdkEntry: "/fixture/host.mjs",
    identity: { directory: "/project", device: "1", inode: "2" },
    environment: {},
    sessionDirectory: "/sessions",
  });
  expect(messages.some((message) => message.kind === "ready")).toBe(true);
  expect(native.close).not.toHaveBeenCalled();
  let reply: (value: unknown) => void = () => {};
  native.controlRequest.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        reply = resolve;
      }),
  );
  native.controlRequest.mockResolvedValue({
    success: true,
    data: { ...idle, background: 1 },
  });
  const closing = host.handle({ kind: "close-idle" });
  // Match the decoder's synchronous batch: resolve old query, then observe new
  // activity before the awaiting close continuation gets a microtask turn.
  reply({ success: true, data: idle });
  native.observers[0]?.({
    kind: "frame",
    frame: { type: "d_pi_control_state", data: { ...idle, background: 1 } },
  });
  await closing;
  expect(native.close).not.toHaveBeenCalled();
  expect(exit).not.toHaveBeenCalled();
  expect(messages).toContainEqual({ kind: "failed", code: "active-work" });
  native.observers[0]?.({ kind: "exited" });
});

it("without a fresh state query refuses close-idle while last known control shows background activity", async () => {
  const messages: HostMessage[] = [];
  const exit = vi.fn();
  const host = createSessionHost((message) => messages.push(message), exit);
  const idle = {
    paused: false,
    stopping: false,
    pendingAsync: false,
    admitted: false,
    streaming: false,
    compacting: false,
    queued: 0,
    background: 0,
    queue: [],
  };
  await host.handle({
    kind: "start",
    threadId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    configContextId: "fixture",
    binary: "/fixture/omp",
    identity: { directory: "/project", device: "1", inode: "2" },
    environment: {},
    sessionDirectory: "/sessions",
  });
  native.observers[0]?.({
    kind: "frame",
    frame: { type: "d_pi_control_state", data: { ...idle, background: 1 } },
  });
  await host.handle({ kind: "close-idle" });
  expect(native.close).not.toHaveBeenCalled();
  expect(exit).not.toHaveBeenCalled();
  expect(messages).toContainEqual({ kind: "failed", code: "active-work" });
});

it("independent Host owners isolate native output, prompt timers and idle disposal", async () => {
  vi.useFakeTimers();
  function fixture() {
    const messages: HostMessage[] = [];
    const exit = vi.fn();
    const host = createSessionHost((message) => messages.push(message), exit);
    const start: HostStart = {
      kind: "start",
      threadId: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: crypto.randomUUID(),
      configContextId: "fixture",
      binary: "/fixture/omp",
      identity: { directory: "/project", device: "1", inode: "2" },
      environment: {},
      sessionDirectory: "/sessions",
    };
    const port = { start: vi.fn(), close: vi.fn(), postMessage: vi.fn() };
    return { host, start, port, messages, exit };
  }
  const a = fixture(),
    b = fixture();
  await a.host.handle(a.start);
  await b.host.handle(b.start);
  await a.host.handle({ kind: "attach" }, a.port);
  await b.host.handle({ kind: "attach" }, b.port);
  native.observers[0]?.({
    kind: "frame",
    frame: {
      type: "message_end",
      message: { role: "assistant", content: "A only" },
    },
  });
  expect(a.port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      item: expect.objectContaining({ text: "A only" }),
    }),
  );
  expect(b.port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ item: expect.anything() }),
  );
  const requestId = crypto.randomUUID();
  for (const owner of [a, b]) {
    await owner.host.handle({
      kind: "dispatch",
      value: FrozenSubmissionSchema.parse({
        submissionId: crypto.randomUUID(),
        threadId: owner.start.threadId,
        traceId: crypto.randomUUID(),
        requestId,
        revision: 1,
        text: "A",
        target: {
          processInstanceId: owner.start.processInstanceId,
          connectionGeneration: owner.start.connectionGeneration,
          configContextId: "fixture",
          nativeSessionRef: "/sessions/session.jsonl",
        },
      }),
    });
  }
  expect(native.writes).toHaveLength(2);
  native.observers[0]?.({
    kind: "frame",
    frame: {
      type: "response",
      command: "prompt",
      id: requestId,
      success: true,
      data: { agentInvoked: false },
    },
  });
  await a.host.handle({ kind: "state" });
  await a.host.handle({ kind: "close-idle" });
  expect(a.exit).toHaveBeenCalledWith(0);
  expect(a.port.close).toHaveBeenCalledOnce();
  expect(b.exit).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(30000);
  expect(a.messages).not.toContainEqual(
    expect.objectContaining({
      kind: "submission",
      event: expect.objectContaining({ kind: "disconnected" }),
    }),
  );
  expect(b.messages).toContainEqual(
    expect.objectContaining({
      kind: "submission",
      event: expect.objectContaining({ kind: "disconnected" }),
    }),
  );
  native.observers[1]?.({ kind: "disconnected", reason: "exit" });
});
