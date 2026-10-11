import type { IpcRenderer } from "electron";
import { expect, it, vi } from "vitest";
import { createConversationPort } from "./conversation-port";

it("shares one Thread port, replays a current timeline, and releasing details leaves the timeline alive", () => {
  let attach: (event: { ports: unknown[] }, data: unknown) => void = () => {};
  const ipc = {
    on: vi.fn((_channel, listener) => {
      attach = listener;
    }),
    removeListener: vi.fn(),
    send: vi.fn(),
  };
  const bridge = createConversationPort(ipc as unknown as IpcRenderer);
  const threadId = crypto.randomUUID(),
    generation = crypto.randomUUID();
  const first = vi.fn(),
    second = vi.fn(),
    detail = vi.fn();
  const remove = bridge.connect(threadId, first);
  const port = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    start: vi.fn(),
    close: vi.fn(),
    postMessage: vi.fn(),
  };
  attach({ ports: [port] }, { threadId });
  port.onmessage?.({
    data: {
      kind: "snapshot",
      nativeSessionKey: "native",
      connectionGeneration: generation,
      seq: 0,
      gap: false,
      items: [],
    },
  });
  const release = bridge.watchTool(
    {
      kind: "live-tool",
      threadId,
      nativeSessionKey: "native",
      connectionGeneration: generation,
      toolCallId: "tool",
    },
    detail,
  );
  const command = port.postMessage.mock.calls.at(-1)?.[0];
  expect(command).toMatchObject({ kind: "watch-tool", source: { threadId } });
  const unsub = bridge.connect(threadId, second);
  expect(ipc.on).toHaveBeenCalledOnce();
  expect(ipc.send).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "snapshot", nativeSessionKey: "native" }),
  );
  port.onmessage?.({
    data: {
      kind: "tool-unavailable",
      readerId: command.readerId,
      reason: "missing",
    },
  });
  expect(detail).toHaveBeenCalledOnce();
  release();
  expect(port.postMessage).toHaveBeenLastCalledWith({
    kind: "release-tool",
    readerId: command.readerId,
  });
  expect(port.close).not.toHaveBeenCalled();
  remove();
  unsub();
  expect(port.close).toHaveBeenCalledOnce();
  expect(ipc.removeListener).toHaveBeenCalledOnce();
});
it("keeps Inspector readers after timeline demand ends and reacquires a fresh snapshot without replacing the port", () => {
  let attach: (event: { ports: unknown[] }, data: unknown) => void = () => {};
  const ipc = {
    on: vi.fn((_channel, listener) => {
      attach = listener;
    }),
    removeListener: vi.fn(),
    send: vi.fn(),
  };
  const bridge = createConversationPort(ipc as unknown as IpcRenderer);
  const threadId = crypto.randomUUID(),
    connectionGeneration = crypto.randomUUID();
  const listener = vi.fn(),
    detail = vi.fn();
  const remove = bridge.connect(threadId, listener);
  const port = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    start: vi.fn(),
    close: vi.fn(),
    postMessage: vi.fn(),
  };
  attach({ ports: [port] }, { threadId });
  port.onmessage?.({
    data: {
      kind: "snapshot",
      connectionGeneration,
      seq: 0,
      gap: false,
      items: [],
    },
  });
  const release = bridge.watchTool(
    {
      kind: "live-tool",
      threadId,
      connectionGeneration,
      nativeSessionKey: "native",
      toolCallId: "tool",
    },
    detail,
  );
  const readerId = port.postMessage.mock.calls.at(-1)?.[0].readerId;
  remove();
  expect(port.postMessage).toHaveBeenLastCalledWith({
    kind: "timeline-demand",
    active: false,
  });
  expect(port.close).not.toHaveBeenCalled();
  port.onmessage?.({
    data: { kind: "tool-unavailable", readerId, reason: "missing" },
  });
  expect(detail).toHaveBeenCalledOnce();
  const resumed = vi.fn();
  const removeResumed = bridge.connect(threadId, resumed);
  expect(ipc.send).toHaveBeenCalledOnce();
  expect(resumed).not.toHaveBeenCalled();
  expect(port.postMessage).toHaveBeenLastCalledWith({
    kind: "timeline-demand",
    active: true,
  });
  port.onmessage?.({
    data: {
      kind: "snapshot",
      connectionGeneration,
      seq: 100,
      gap: false,
      items: [],
    },
  });
  expect(resumed).toHaveBeenCalledWith(
    expect.objectContaining({ seq: 100, gap: false }),
  );
  release();
  removeResumed();
  expect(port.close).toHaveBeenCalledOnce();
});
