import { expect, it } from "vitest";
import { ConversationProjection } from "./projection";

it("ignores known non-conversation frames but preserves an unknown-frame notice", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});

  p.accept({ type: "ready" });
  p.accept({ type: "future_native_event", payload: { value: 42 } });

  expect(p.snapshot().items).toMatchObject([
    {
      notice: {
        code: "conversation.unsupportedNativeEvent",
        params: { eventType: "future_native_event" },
      },
    },
  ]);
  p.dispose();
});

it("merges streamed text into a bounded message and keeps tools/results distinct before terminal state", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "message_start",
    message: { role: "assistant", content: [] },
  });
  p.accept({
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta: "hello " },
  });
  p.accept({
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta: "world" },
  });
  p.accept({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "hello world" }],
    },
  });
  p.accept({ type: "tool_execution_start", toolCallId: "t", toolName: "read" });
  p.accept({
    type: "tool_execution_end",
    toolCallId: "t",
    toolName: "read",
    isError: true,
    result: { content: [{ type: "text", text: "not found" }] },
  });
  expect(p.snapshot().items).toMatchObject([
    { role: "assistant", text: "hello world", state: "complete" },
    {
      role: "tool",
      text: "not found",
      state: "failed",
      label: { kind: "literal", text: "read" },
    },
  ]);
});

it("does not let an unconsumed extra field on a tool start invent failure or result text", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "tool_execution_start",
    toolCallId: "t",
    toolName: "read",
    isError: "false",
    result: { content: "untrusted extra result" },
  });
  expect(p.snapshot().items).toMatchObject([
    { role: "tool", state: "streaming", text: "" },
  ]);
  p.dispose();
});

it("bounds retained messages and reports truncation without retaining evicted tools", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {}, 4096);
  for (let n = 0; n < 50; n++)
    p.accept({
      type: "message_end",
      message: { role: "user", content: "x".repeat(1000) },
    });
  const value = p.snapshot();
  expect(value.gap).toBe(true);
  expect(
    new TextEncoder().encode(JSON.stringify(value.items)).length,
  ).toBeLessThanOrEqual(4096);
  p.dispose();
});
it("accounts for JSON escaping when bounding one enormous message", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {}, 4096);
  p.accept({
    type: "message_end",
    message: { role: "assistant", content: "\u0000".repeat(5000) },
  });
  const snapshot = p.snapshot();
  expect(
    new TextEncoder().encode(JSON.stringify(snapshot.items)).length,
  ).toBeLessThanOrEqual(4096);
  expect(snapshot.gap).toBe(true);
  expect(snapshot.items[0]?.truncated).toBe(true);
  expect(snapshot.items[0]?.text).not.toContain("显示已截断");
  p.dispose();
});

it("keeps native text verbatim and exposes product notices as semantic data", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "message_end",
    message: { role: "user", content: "原样保留 [显示已截断]" },
  });
  p.accept({ type: "future_native_event" });
  const [native, notice] = p.snapshot().items;
  expect(native?.text).toBe("原样保留 [显示已截断]");
  expect(native?.label).toEqual({
    kind: "message",
    value: { code: "conversation.nativeInput" },
  });
  expect(notice?.text).toBe("");
  expect(notice?.notice).toEqual({
    code: "conversation.unsupportedNativeEvent",
    params: { eventType: "future_native_event" },
  });
  p.dispose();
});

it("bounds the external event type without changing the native source", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({ type: `future_${"x".repeat(1000)}` });
  const notice = p.snapshot().items[0]?.notice;
  expect(notice?.code).toBe("conversation.unsupportedNativeEvent");
  if (notice?.code === "conversation.unsupportedNativeEvent") {
    expect(notice.params.eventType.length).toBeLessThanOrEqual(120);
  }
  p.dispose();
});

it("keeps startup advisor-cost telemetry out of an empty conversation while preserving unknown notices", () => {
  const updates: unknown[] = [];
  const projection = new ConversationProjection(crypto.randomUUID(), (update) =>
    updates.push(update),
  );
  projection.accept({ type: "advisor_cost_changed" });
  projection.flush();
  expect(projection.snapshot().items).toEqual([]);
  expect(updates).toEqual([]);
  projection.accept({ type: "future_user_interaction" });
  expect(projection.snapshot().items[0]?.notice).toEqual({
    code: "conversation.unsupportedNativeEvent",
    params: { eventType: "future_user_interaction" },
  });
  projection.dispose();
});
