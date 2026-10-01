import { afterEach, expect, it, vi } from "vitest";
import { ThreadIdSchema } from "../../../shared/identity";
import type { HostMessage, HostStart } from "../contracts/public";
import { FrozenSubmissionSchema } from "../contracts/public";
import type { NativeObservation, NativeSessionOptions } from "./native-session";
import { NativeSession } from "./native-session";
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
vi.mock("../../../platform/node/filesystem/public", () => ({
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

it("forwards unknown host frames without treating them as interactions", async () => {
  const messages: HostMessage[] = [];
  const nativeFrames: unknown[] = [];
  const exit = vi.fn();
  const host = createSessionHost((message) => messages.push(message), exit, {
    onNativeFrame: (frame) => nativeFrames.push(frame),
  });
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

  const frame = {
    type: "host_future_request",
    payload: { value: "forward-compatible" },
  };
  native.observers[0]?.({ kind: "frame", frame });

  expect(nativeFrames).toEqual([frame]);
  expect(messages.filter((message) => message.kind === "interactions")).toEqual(
    [],
  );
});

it("answers timed-out questions with the timeout default while confirm dialogs keep blocking", async () => {
  vi.useFakeTimers();
  try {
    const messages: HostMessage[] = [];
    const exit = vi.fn();
    const host = createSessionHost((message) => messages.push(message), exit);
    const threadId = crypto.randomUUID();
    const connectionGeneration = crypto.randomUUID();
    await host.handle({
      kind: "start",
      threadId,
      traceId: crypto.randomUUID(),
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: connectionGeneration,
      configContextId: "fixture",
      binary: "/fixture/omp",
      identity: { directory: "/project", device: "1", inode: "2" },
      environment: {},
      sessionDirectory: "/sessions",
    });
    native.observers[0]?.({
      kind: "frame",
      frame: {
        type: "extension_ui_request",
        method: "select",
        id: "question",
        title: "Pick one",
        options: ["first", "second"],
      },
    });
    native.observers[0]?.({
      kind: "frame",
      frame: {
        type: "extension_ui_request",
        method: "confirm",
        id: "approval",
        title: "Approve?",
      },
    });
    expect(native.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(120_000);
    const responses = native.writes.map((frame) => JSON.parse(frame));
    expect(responses).toContainEqual({
      type: "extension_ui_response",
      id: "question",
      value: "first",
    });
    expect(
      responses.some(
        (response) =>
          response.type === "extension_ui_response" &&
          response.id === "approval",
      ),
    ).toBe(false);
    expect(messages).toContainEqual(
      expect.objectContaining({
        kind: "operation-result",
        operation: "answer",
        status: "acknowledged",
      }),
    );
  } finally {
    vi.useRealTimers();
  }
});

it("fires the default just before a short native timeout", async () => {
  vi.useFakeTimers();
  try {
    const messages: HostMessage[] = [];
    const exit = vi.fn();
    const host = createSessionHost((message) => messages.push(message), exit);
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
      frame: {
        type: "extension_ui_request",
        method: "select",
        id: "quick",
        title: "Pick one",
        options: ["first", "second"],
        timeout: 5_000,
      },
    });
    await vi.advanceTimersByTimeAsync(4_100);
    expect(native.writes.map((frame) => JSON.parse(frame))).toContainEqual({
      type: "extension_ui_response",
      id: "quick",
      value: "first",
    });
  } finally {
    vi.useRealTimers();
  }
});

it("publishes the timeout default as one sent+flagged snapshot", async () => {
  vi.useFakeTimers();
  try {
    const messages: HostMessage[] = [];
    const exit = vi.fn();
    const host = createSessionHost((message) => messages.push(message), exit);
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
      frame: {
        type: "extension_ui_request",
        method: "input",
        id: "single",
        title: "Details",
        prefill: "draft",
        timeout: 5_000,
      },
    });
    const before = messages.filter(
      (message) => message.kind === "interactions",
    ).length;
    await vi.advanceTimersByTimeAsync(4_100);
    const views = messages.filter((message) => message.kind === "interactions");
    const fresh = views.slice(before);
    // One visible interactions snapshot for the default, already flagged.
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({
      kind: "interactions",
      view: {
        items: [{ id: "single", status: "sent", defaultAnswered: true }],
      },
    });
    // The native expiry timer was cleared on write: passing the original
    // 5s deadline must not publish a second snapshot.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(
      messages.filter((message) => message.kind === "interactions").length,
    ).toBe(before + 1);
  } finally {
    vi.useRealTimers();
  }
});

it("never auto-answers confirm with a native timeout; expiry is shown truthfully", async () => {
  vi.useFakeTimers();
  try {
    const messages: HostMessage[] = [];
    const exit = vi.fn();
    const host = createSessionHost((message) => messages.push(message), exit);
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
      frame: {
        type: "extension_ui_request",
        method: "confirm",
        id: "confirm-timeout",
        title: "Approve?",
        timeout: 5_000,
      },
    });
    await vi.advanceTimersByTimeAsync(6_000);
    // App never writes a default answer for confirm.
    expect(
      native.writes.some((frame) => frame.includes('"id":"confirm-timeout"')),
    ).toBe(false);
    // Native timeout ends the request; App reflects expired instead of
    // pretending eternal pending. Eternal block requires no native timeout.
    const views = messages.filter((message) => message.kind === "interactions");
    const last = views.at(-1);
    expect(last).toMatchObject({
      kind: "interactions",
      view: { items: [{ id: "confirm-timeout", status: "expired" }] },
    });
  } finally {
    vi.useRealTimers();
  }
});

it("keeps a confirm without native timeout pending past the 120s fallback", async () => {
  vi.useFakeTimers();
  try {
    const messages: HostMessage[] = [];
    const exit = vi.fn();
    const host = createSessionHost((message) => messages.push(message), exit);
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
      frame: {
        type: "extension_ui_request",
        method: "confirm",
        id: "confirm-eternal",
        title: "Approve?",
      },
    });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(
      native.writes.some((frame) => frame.includes('"id":"confirm-eternal"')),
    ).toBe(false);
    const views = messages.filter((message) => message.kind === "interactions");
    const last = views.at(-1);
    expect(last).toMatchObject({
      kind: "interactions",
      view: { items: [{ id: "confirm-eternal", status: "pending" }] },
    });
  } finally {
    vi.useRealTimers();
  }
});

it("honors a long native timeout instead of answering at the 120s fallback", async () => {
  vi.useFakeTimers();
  try {
    const messages: HostMessage[] = [];
    const exit = vi.fn();
    const host = createSessionHost((message) => messages.push(message), exit);
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
      frame: {
        type: "extension_ui_request",
        method: "input",
        id: "slow",
        title: "Details",
        prefill: "draft",
        timeout: 3_600_000,
      },
    });
    // The 120s App fallback must not fire while native still allows an hour.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(native.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(3_600_000 - 120_000 - 900);
    expect(native.writes.map((frame) => JSON.parse(frame))).toContainEqual({
      type: "extension_ui_response",
      id: "slow",
      value: "draft",
    });
  } finally {
    vi.useRealTimers();
  }
});

it("refreshes the last known control from stop/continue replies so close-idle unblocks", async () => {
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
  const request = vi
    .spyOn(NativeSession.prototype, "request")
    .mockImplementation(async (command: string) => {
      if (command === "d_pi_stop" || command === "d_pi_continue")
        return { success: true, data: idle };
      if (command === "d_pi_state") return native.controlRequest();
      return {
        success: true,
        data: {
          sessionId: "session",
          sessionFile: "/sessions/session.jsonl",
          model: { id: "model", provider: "fixture" },
          isStreaming: false,
          isCompacting: false,
          queuedMessageCount: 0,
        },
      };
    });
  try {
    const messages: HostMessage[] = [];
    const exit = vi.fn();
    const host = createSessionHost((message) => messages.push(message), exit);
    const threadId = ThreadIdSchema.parse(crypto.randomUUID());
    const connectionGeneration = crypto.randomUUID();
    await host.handle({
      kind: "start",
      threadId,
      traceId: crypto.randomUUID(),
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: connectionGeneration,
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
    // Stale active control still refuses without a fresh query.
    await host.handle({ kind: "close-idle" });
    expect(native.close).not.toHaveBeenCalled();
    // A continue reply carrying idle state refreshes the fallback evidence.
    await host.handle({
      kind: "control",
      command: {
        kind: "continue",
        threadId,
        traceId: crypto.randomUUID(),
        connectionGeneration,
      },
    });
    await host.handle({ kind: "close-idle" });
    expect(native.close).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  } finally {
    request.mockRestore();
  }
});

it("acknowledges a superseded control call without applying its stale state (A9 lock)", async () => {
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
  let releaseControl!: (value: { success: boolean; data: unknown }) => void;
  const gate = new Promise<{ success: boolean; data: unknown }>((resolve) => {
    releaseControl = resolve;
  });
  const request = vi
    .spyOn(NativeSession.prototype, "request")
    .mockImplementation(async (command: string) => {
      if (command === "d_pi_continue") return gate;
      if (command === "d_pi_state") return native.controlRequest();
      return {
        success: true,
        data: {
          sessionId: "session",
          sessionFile: "/sessions/session.jsonl",
          model: { id: "model", provider: "fixture" },
          isStreaming: false,
          isCompacting: false,
          queuedMessageCount: 0,
        },
      };
    });
  try {
    const messages: HostMessage[] = [];
    const exit = vi.fn();
    const host = createSessionHost((message) => messages.push(message), exit);
    const threadId = ThreadIdSchema.parse(crypto.randomUUID());
    const connectionGeneration = crypto.randomUUID();
    await host.handle({
      kind: "start",
      threadId,
      traceId: crypto.randomUUID(),
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: connectionGeneration,
      configContextId: "fixture",
      binary: "/fixture/omp",
      identity: { directory: "/project", device: "1", inode: "2" },
      environment: {},
      sessionDirectory: "/sessions",
    });
    const traceId = crypto.randomUUID();
    const pending = host.handle({
      kind: "control",
      command: { kind: "continue", threadId, traceId, connectionGeneration },
    });
    // A newer native observation lands while the control reply is in flight.
    native.observers[0]?.({
      kind: "frame",
      frame: {
        type: "d_pi_control_state",
        data: { ...idle, paused: true },
      },
    });
    releaseControl({ success: true, data: { ...idle, paused: false } });
    await pending;
    // The call was processed natively: acknowledged. The stale idle state
    // carried by the reply is not applied over the newer paused observation.
    expect(messages).toContainEqual(
      expect.objectContaining({
        kind: "operation-result",
        traceId,
        operation: "continue",
        status: "acknowledged",
      }),
    );
    const controls = messages.filter((message) => message.kind === "control");
    expect(controls.at(-1)).toMatchObject({ state: { paused: true } });
  } finally {
    request.mockRestore();
  }
});

it("independent Host owners isolate native output, prompt timers and idle disposal", async () => {
  vi.useFakeTimers();
  function fixture() {
    const messages: HostMessage[] = [];
    const exit = vi.fn();
    let attached: {
      start(): void;
      close(): void;
      postMessage(event: unknown): void;
    } | null = null;
    const host = createSessionHost((message) => messages.push(message), exit, {
      onNativeFrame: (frame) => {
        if (frame.type === "message_end")
          attached?.postMessage({
            item: { text: (frame.message as { content?: string }).content },
          });
      },
      onAttach: (port) => {
        attached?.close();
        attached = port ?? null;
        attached?.start();
      },
      onDispose: () => {
        attached?.close();
        attached = null;
      },
    });
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
  // This isolated Host fixture supplies Main's successful durable confirmation.
  for (const message of a.messages.filter(
    (message) => message.kind === "submission",
  ))
    await a.host.handle({
      kind: "confirm-evidence",
      evidenceId: message.evidenceId,
      connectionGeneration: a.start.connectionGeneration,
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

it("dismisses an unknown dialog locally and reports acknowledged without a native write", async () => {
  const messages: HostMessage[] = [];
  const exit = vi.fn();
  const host = createSessionHost((message) => messages.push(message), exit);
  const threadId = crypto.randomUUID();
  const connectionGeneration = crypto.randomUUID();
  await host.handle({
    kind: "start",
    threadId,
    traceId: crypto.randomUUID(),
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: connectionGeneration,
    configContextId: "fixture",
    binary: "/fixture/omp",
    identity: { directory: "/project", device: "1", inode: "2" },
    environment: {},
    sessionDirectory: "/sessions",
  });
  native.observers[0]?.({
    kind: "frame",
    frame: {
      type: "extension_ui_request",
      method: "input",
      id: "wedged",
      title: "Details",
    },
  });
  // Production unknown path: transport loss converts pending to unknown.
  native.observers[0]?.({ kind: "disconnected", reason: "write" });
  const writesBefore = native.writes.length;
  await host.handle({
    kind: "dismiss",
    command: {
      kind: "dismiss",
      threadId: ThreadIdSchema.parse(threadId),
      traceId: crypto.randomUUID(),
      connectionGeneration,
      id: "wedged",
    },
  });
  // Local cleanup claims no native write; the block is released.
  expect(native.writes).toHaveLength(writesBefore);
  expect(messages).toContainEqual(
    expect.objectContaining({
      kind: "operation-result",
      operation: "dismiss",
      status: "acknowledged",
    }),
  );
  expect(messages).toContainEqual(
    expect.objectContaining({
      kind: "interactions",
      view: expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: "wedged",
            status: "cancelled",
            dismissed: true,
          }),
        ]),
      }),
    }),
  );
});

it("keeps correlation expiry out of conversation frames while retaining submission uncertainty", async () => {
  vi.useFakeTimers();
  try {
    const messages: HostMessage[] = [];
    const nativeFrames: unknown[] = [];
    const supervisionEvents: unknown[] = [];
    const exit = vi.fn();
    const host = createSessionHost((message) => messages.push(message), exit, {
      onNativeFrame: (frame) => nativeFrames.push(frame),
      onSupervisionEvent: (event) => supervisionEvents.push(event),
    });
    const start: HostStart = {
      kind: "start",
      threadId: ThreadIdSchema.parse(crypto.randomUUID()),
      traceId: crypto.randomUUID(),
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: crypto.randomUUID(),
      configContextId: "fixture",
      binary: "/fixture/omp",
      identity: { directory: "/project", device: "1", inode: "2" },
      environment: {},
      sessionDirectory: "/sessions",
    };
    await host.handle(start);
    const submission = FrozenSubmissionSchema.parse({
      submissionId: crypto.randomUUID(),
      threadId: start.threadId,
      traceId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      revision: 1,
      text: "A",
      target: {
        processInstanceId: start.processInstanceId,
        connectionGeneration: start.connectionGeneration,
        configContextId: start.configContextId,
        nativeSessionRef: "/sessions/session.jsonl",
      },
    });
    await host.handle({ kind: "dispatch", value: submission });

    await vi.advanceTimersByTimeAsync(15 * 60_000);

    expect(nativeFrames).toEqual([]);
    expect(supervisionEvents).toContainEqual({
      kind: "submission-correlation-expired",
      submissionId: submission.submissionId,
      requestId: submission.requestId,
      traceId: submission.traceId,
    });
    expect(messages).toContainEqual({
      kind: "submission",
      evidenceId: expect.any(String),
      event: {
        kind: "disconnected",
        submissionId: submission.submissionId,
        requestId: submission.requestId,
        target: submission.target,
      },
    });
  } finally {
    vi.useRealTimers();
  }
});

it("labels a rejected submission with a stable host reason", async () => {
  const messages: HostMessage[] = [];
  const exit = vi.fn();
  const host = createSessionHost((message) => messages.push(message), exit);
  const start: HostStart = {
    kind: "start",
    threadId: ThreadIdSchema.parse(crypto.randomUUID()),
    traceId: crypto.randomUUID(),
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    configContextId: "fixture",
    binary: "/fixture/omp",
    identity: { directory: "/project", device: "1", inode: "2" },
    environment: {},
    sessionDirectory: "/sessions",
  };
  await host.handle(start);
  await host.handle({
    kind: "dispatch",
    value: FrozenSubmissionSchema.parse({
      submissionId: crypto.randomUUID(),
      threadId: start.threadId,
      traceId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      revision: 1,
      text: "/move",
      target: {
        processInstanceId: start.processInstanceId,
        connectionGeneration: start.connectionGeneration,
        configContextId: start.configContextId,
        nativeSessionRef: "/sessions/session.jsonl",
      },
    }),
  });

  expect(messages).toContainEqual(
    expect.objectContaining({
      kind: "submission",
      event: expect.objectContaining({
        kind: "rejected",
        reason: "unsupported-native-command",
      }),
    }),
  );
});

it.each([
  ["not-ready", "not-ready"],
  ["native-unavailable", "native-unavailable"],
  ["paused", "paused"],
  ["interaction-pending", "interaction-pending"],
  ["stale-target", "stale-target"],
  ["correlation-limit", "correlation-limit"],
] as const)("reports the %s dispatch gate", async (gate, reason) => {
  if (gate === "correlation-limit") vi.useFakeTimers();
  const messages: HostMessage[] = [];
  const exit = vi.fn();
  const host = createSessionHost((message) => messages.push(message), exit);
  const start: HostStart = {
    kind: "start",
    threadId: ThreadIdSchema.parse(crypto.randomUUID()),
    traceId: crypto.randomUUID(),
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    configContextId: "fixture",
    binary: "/fixture/omp",
    identity: { directory: "/project", device: "1", inode: "2" },
    environment: {},
    sessionDirectory: "/sessions",
  };
  if (gate !== "not-ready") {
    await host.handle(start);
    if (gate === "native-unavailable")
      native.observers[0]?.({ kind: "disconnected", reason: "write" });
    if (gate === "paused")
      native.observers[0]?.({
        kind: "frame",
        frame: {
          type: "d_pi_control_state",
          data: {
            paused: true,
            stopping: false,
            pendingAsync: false,
            admitted: false,
            streaming: false,
            compacting: false,
            queued: 0,
            background: 0,
            queue: [],
          },
        },
      });
    if (gate === "interaction-pending")
      native.observers[0]?.({
        kind: "frame",
        frame: {
          type: "extension_ui_request",
          method: "confirm",
          id: "pending",
          title: "Confirm",
        },
      });
  }
  const target = {
    processInstanceId:
      gate === "stale-target" ? crypto.randomUUID() : start.processInstanceId,
    connectionGeneration: start.connectionGeneration,
    configContextId: start.configContextId,
    nativeSessionRef: "/sessions/session.jsonl",
  };
  const dispatch = (index: number) =>
    host.handle({
      kind: "dispatch",
      value: FrozenSubmissionSchema.parse({
        submissionId: crypto.randomUUID(),
        threadId: start.threadId,
        traceId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        revision: index,
        text: "A",
        target,
      }),
    });
  if (gate === "correlation-limit")
    for (let index = 0; index < 128; index++) await dispatch(index);
  await dispatch(129);

  expect(messages).toContainEqual(
    expect.objectContaining({
      kind: "submission",
      event: expect.objectContaining({ kind: "rejected", reason }),
    }),
  );
});

it("bounds unconfirmed evidence, reports cache pressure and only replays facts", async () => {
  const messages: HostMessage[] = [];
  const host = createSessionHost((message) => messages.push(message), vi.fn());
  const start: HostStart = {
    kind: "start",
    threadId: ThreadIdSchema.parse(crypto.randomUUID()),
    traceId: crypto.randomUUID(),
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    configContextId: "fixture",
    binary: "/fixture/omp",
    identity: { directory: "/project", device: "1", inode: "2" },
    environment: {},
    sessionDirectory: "/sessions",
  };
  await host.handle(start);
  native.observers[0]?.({
    kind: "frame",
    frame: {
      type: "d_pi_control_state",
      data: {
        paused: true,
        stopping: false,
        streaming: false,
        compacting: false,
        queued: 0,
        queue: [],
        background: 0,
        pendingAsync: false,
        admitted: false,
      },
    },
  });
  for (let index = 0; index < 260; index++) {
    await host.handle({
      kind: "dispatch",
      value: FrozenSubmissionSchema.parse({
        submissionId: crypto.randomUUID(),
        threadId: start.threadId,
        traceId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        revision: index,
        text: "frozen",
        target: {
          processInstanceId: start.processInstanceId,
          connectionGeneration: start.connectionGeneration,
          configContextId: start.configContextId,
          nativeSessionRef: "/sessions/session.jsonl",
        },
      }),
    });
  }
  expect(native.writes).toEqual([]);
  expect(messages).toContainEqual({
    kind: "evidence-gap",
    connectionGeneration: start.connectionGeneration,
    reason: "cache-full",
  });
  const initial = messages.filter((message) => message.kind === "submission");
  expect(initial).toHaveLength(256);
  messages.length = 0;
  await host.handle({ kind: "replay-evidence" });
  expect(messages.filter((message) => message.kind === "submission")).toEqual(
    initial,
  );
  expect(native.writes).toEqual([]);
  native.observers[0]?.({ kind: "exited" });
});

it("duplicate native ACKs cannot exhaust the live evidence cache and cause its terminal to be lost", async () => {
  const messages: HostMessage[] = [];
  const host = createSessionHost((message) => messages.push(message), vi.fn());
  const start: HostStart = {
    kind: "start",
    threadId: ThreadIdSchema.parse(crypto.randomUUID()),
    traceId: crypto.randomUUID(),
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    configContextId: "fixture",
    binary: "/fixture/omp",
    identity: { directory: "/project", device: "1", inode: "2" },
    environment: {},
    sessionDirectory: "/sessions",
  };
  await host.handle(start);
  const value = FrozenSubmissionSchema.parse({
    submissionId: crypto.randomUUID(),
    threadId: start.threadId,
    traceId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    revision: 1,
    text: "frozen",
    target: {
      processInstanceId: start.processInstanceId,
      connectionGeneration: start.connectionGeneration,
      configContextId: start.configContextId,
      nativeSessionRef: "/sessions/session.jsonl",
    },
  });
  await host.handle({ kind: "dispatch", value });
  for (let index = 0; index < 300; index++)
    native.observers[0]?.({
      kind: "frame",
      frame: {
        type: "response",
        command: "prompt",
        id: value.requestId,
        success: true,
      },
    });
  native.observers[0]?.({
    kind: "frame",
    frame: {
      type: "prompt_result",
      id: value.requestId,
      status: "completed",
      agentInvoked: true,
      sessionSettled: true,
    },
  });
  expect(
    messages.some(
      (message) =>
        message.kind === "evidence-gap" && message.reason === "cache-full",
    ),
  ).toBe(false);
  messages.length = 0;
  await host.handle({ kind: "replay-evidence" });
  expect(
    messages
      .filter((message) => message.kind === "submission")
      .map((message) => message.event.kind),
  ).toEqual(["ack", "prompt-result"]);
  expect(native.writes).toHaveLength(1);
  await host.handle({ kind: "state" });
  await host.handle({ kind: "close-idle" });
  expect(native.close).not.toHaveBeenCalled();
  expect(messages).toContainEqual({ kind: "failed", code: "active-work" });
  native.observers[0]?.({ kind: "exited" });
});

it("agent_end cannot open an idle-close gap while a confirmed completed prompt remains unsettled", async () => {
  const messages: HostMessage[] = [];
  const host = createSessionHost((message) => messages.push(message), vi.fn());
  const start: HostStart = {
    kind: "start",
    threadId: ThreadIdSchema.parse(crypto.randomUUID()),
    traceId: crypto.randomUUID(),
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    configContextId: "fixture",
    binary: "/fixture/omp",
    identity: { directory: "/project", device: "1", inode: "2" },
    environment: {},
    sessionDirectory: "/sessions",
  };
  await host.handle(start);
  const value = FrozenSubmissionSchema.parse({
    submissionId: crypto.randomUUID(),
    threadId: start.threadId,
    traceId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    revision: 1,
    text: "frozen",
    target: {
      processInstanceId: start.processInstanceId,
      connectionGeneration: start.connectionGeneration,
      configContextId: start.configContextId,
      nativeSessionRef: "/sessions/session.jsonl",
    },
  });
  await host.handle({ kind: "dispatch", value });
  for (const frame of [
    { type: "response", command: "prompt", id: value.requestId, success: true },
    {
      type: "prompt_result",
      id: value.requestId,
      status: "completed",
      agentInvoked: true,
      sessionSettled: false,
    },
  ])
    native.observers[0]?.({ kind: "frame", frame });
  for (const message of messages.filter(
    (message) => message.kind === "submission",
  ))
    await host.handle({
      kind: "confirm-evidence",
      evidenceId: message.evidenceId,
      connectionGeneration: start.connectionGeneration,
    });
  // Observe and issue close in the same turn, before refresh's awaiting sample.
  native.observers[0]?.({
    kind: "frame",
    frame: { type: "agent_end", isTerminal: true },
  });
  await host.handle({ kind: "close-idle" });
  expect(native.close).not.toHaveBeenCalled();
  expect(messages).toContainEqual({ kind: "failed", code: "active-work" });
  native.observers[0]?.({ kind: "frame", frame: { type: "session_settled" } });
  await host.handle({ kind: "state" });
  await host.handle({ kind: "close-idle" });
  expect(native.close).toHaveBeenCalledOnce();
});
