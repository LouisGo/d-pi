import { expect, it, vi } from "vitest";
import type { NativeFrame } from "../../../platform/omp/protocol/public";
import { type ConversationHostPort, createConversationHost } from "./scope";

function readingPort() {
  let receive: (event: { data: unknown }) => void = () => {};
  const port = {
    start: vi.fn(),
    close: vi.fn(),
    postMessage: vi.fn(),
    on: (
      event: "message" | "close",
      listener: (event: { data: unknown }) => void,
    ) => {
      if (event === "message") receive = listener;
    },
  } satisfies ConversationHostPort;
  return { port, send: (data: unknown) => receive({ data }) };
}

function message(text: string): NativeFrame {
  return {
    type: "message_end",
    message: { role: "assistant", content: text },
  };
}

it("retains the projection independently of port attachment", () => {
  const scope = createConversationHost();
  const one = readingPort(),
    two = readingPort();
  const first = one.port,
    second = two.port;
  const connectionGeneration = crypto.randomUUID();

  scope.start(connectionGeneration);
  scope.attach(first);
  one.send({ kind: "timeline-demand", active: true });
  scope.accept(message("retained output"));
  scope.attach(second);
  two.send({ kind: "timeline-demand", active: true });

  expect(first.close).toHaveBeenCalledOnce();
  expect(second.start).toHaveBeenCalledOnce();
  expect(second.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "snapshot",
      connectionGeneration,
      items: [expect.objectContaining({ text: "retained output" })],
    }),
  );

  scope.dispose();
  expect(second.close).toHaveBeenCalledOnce();
});
it("pauses transcript delivery while an independent tool reader stays live, then snapshots at the current watermark", () => {
  const host = createConversationHost();
  const threadId = crypto.randomUUID(),
    connectionGeneration = crypto.randomUUID();
  const f = readingPort();
  host.start(connectionGeneration, threadId);
  host.attach(f.port, {
    threadId,
    connectionGeneration,
    nativeSessionKey: "native",
  });
  expect(f.port.postMessage).not.toHaveBeenCalled();
  f.send({ kind: "timeline-demand", active: true });
  host.accept({
    type: "tool_execution_start",
    toolCallId: "tool",
    toolName: "bash",
    args: { command: "echo a" },
  });
  const readerId = crypto.randomUUID();
  f.send({
    kind: "watch-tool",
    readerId,
    source: {
      kind: "live-tool",
      threadId,
      connectionGeneration,
      nativeSessionKey: "native",
      toolCallId: "tool",
    },
  });
  f.send({ kind: "timeline-demand", active: false });
  f.port.postMessage.mockClear();
  host.accept({
    type: "tool_execution_end",
    toolCallId: "tool",
    toolName: "bash",
    result: { content: [{ type: "text", text: "final evidence" }] },
    isError: false,
  });
  expect(f.port.postMessage.mock.calls.map(([value]) => value.kind)).toEqual([
    "tool-detail",
  ]);
  f.send({ kind: "timeline-demand", active: true });
  expect(f.port.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: "snapshot",
      seq: expect.any(Number),
      items: [expect.objectContaining({ text: "final evidence" })],
    }),
  );
  host.dispose();
});
