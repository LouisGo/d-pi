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
