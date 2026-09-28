import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import type { NativeObservation } from "./native-session";

const native = vi.hoisted(() => ({
  observe: (_event: NativeObservation) => {},
  write: vi.fn(),
  close: vi.fn(),
}));
vi.mock("./native-session", () => ({
  NativeSession: class {
    constructor(
      _options: unknown,
      observe: (event: NativeObservation) => void,
    ) {
      native.observe = observe;
    }
    async start() {}
    async request() {
      return {
        success: true,
        data: {
          sessionId: "native",
          sessionFile: "/sessions/native.jsonl",
          model: { id: "model", provider: "fixture" },
          isStreaming: false,
          isCompacting: false,
          queuedMessageCount: 0,
        },
      };
    }
    write = native.write;
    close = native.close;
  },
}));
vi.mock("../main/runtime-resource", () => ({
  identifyDirectory: async () => ({
    directory: "/project",
    device: "1",
    inode: "2",
  }),
}));
const originalParent = Object.getOwnPropertyDescriptor(process, "parentPort");
afterEach(() => {
  native.observe({ kind: "disconnected", reason: "exit" });
  if (originalParent)
    Object.defineProperty(process, "parentPort", originalParent);
  else Reflect.deleteProperty(process, "parentPort");
  vi.clearAllMocks();
  vi.resetModules();
});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function running() {
  const messages: unknown[] = [];
  const parent = Object.assign(new EventEmitter(), {
    postMessage: (message: unknown) => messages.push(message),
  });
  Object.defineProperty(process, "parentPort", {
    value: parent,
    configurable: true,
  });
  await import("./index");
  const threadId = crypto.randomUUID();
  const target = {
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    configContextId: "fixture",
    nativeSessionRef: "/sessions/native.jsonl",
  };
  parent.emit("message", {
    data: {
      kind: "start",
      threadId,
      traceId: crypto.randomUUID(),
      processInstanceId: target.processInstanceId,
      connectionGeneration: target.connectionGeneration,
      configContextId: target.configContextId,
      binary: "/fixture/omp",
      environment: {},
      identity: { directory: "/project", device: "1", inode: "2" },
      sessionDirectory: "/sessions",
    },
    ports: [],
  });
  await tick();
  expect(messages).toContainEqual(expect.objectContaining({ kind: "ready" }));
  messages.length = 0;
  const dispatch = () => {
    const requestId = crypto.randomUUID();
    parent.emit("message", {
      data: {
        kind: "dispatch",
        value: {
          submissionId: crypto.randomUUID(),
          threadId,
          traceId: crypto.randomUUID(),
          revision: 1,
          text: "/model",
          requestId,
          target,
        },
      },
      ports: [],
    });
    return requestId;
  };
  return { messages, dispatch, parent };
}
it("local-only prompt ACK refreshes idle state and permits the next submission", async () => {
  const { messages, dispatch } = await running();
  const id = dispatch();
  native.observe({
    kind: "frame",
    frame: {
      type: "response",
      command: "prompt",
      id,
      success: true,
      data: { agentInvoked: false },
    },
  });
  await tick();
  expect(messages).toContainEqual(
    expect.objectContaining({
      kind: "submission",
      event: expect.objectContaining({ kind: "ack" }),
    }),
  );
  expect(messages).toContainEqual(
    expect.objectContaining({ kind: "state", busy: false }),
  );
  dispatch();
  expect(native.write).toHaveBeenCalledTimes(2);
});

it.each([undefined, { agentInvoked: true }])(
  "an ordinary ACK with data=%j is not execution completion",
  async (data) => {
    const { messages, dispatch } = await running();
    const id = dispatch();
    native.observe({
      kind: "frame",
      frame: { type: "response", command: "prompt", id, success: true, data },
    });
    await tick();
    expect(messages).not.toContainEqual(
      expect.objectContaining({ kind: "state", busy: false }),
    );
    dispatch();
    expect(native.write).toHaveBeenCalledTimes(1);
  },
);

it("a surviving Host serves retained output through a new port after native disconnection", async () => {
  const { parent } = await running();
  native.observe({
    kind: "frame",
    frame: {
      type: "message_start",
      message: { role: "assistant", content: [] },
    },
  });
  native.observe({
    kind: "frame",
    frame: {
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "Unpersisted partial output",
      },
    },
  });
  native.observe({ kind: "disconnected", reason: "exit" });
  const port = { close: vi.fn(), start: vi.fn(), postMessage: vi.fn() };
  parent.emit("message", { data: { kind: "attach" }, ports: [port] });
  expect(port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "snapshot",
      items: [expect.objectContaining({ text: "Unpersisted partial output" })],
    }),
  );
  expect(native.write).not.toHaveBeenCalled();
});
