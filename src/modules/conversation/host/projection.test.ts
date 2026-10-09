import { expect, it } from "vitest";
import { ConversationProjection } from "./projection";

it("keeps native message time through streamed updates without substituting the local clock", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "message_start",
    message: { role: "assistant", content: [], timestamp: 1791500000000 },
  });
  p.accept({
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta: "Hi" },
  });
  expect(p.snapshot().items[0]).toMatchObject({ timestamp: 1791500000000 });
  p.accept({
    type: "message_end",
    message: { role: "assistant", content: "Hi", timestamp: 1791500000000 },
  });
  expect(p.snapshot().items[0]).toMatchObject({ timestamp: 1791500000000 });
  p.accept({
    type: "message_end",
    message: { role: "user", content: "legacy" },
  });
  expect(p.snapshot().items[1]?.timestamp).toBeUndefined();
  p.dispose();
});

it("projects native thinking separately and preserves full snapshots without doubling deltas", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "message_start",
    message: { role: "assistant", content: [] },
  });
  p.accept({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_delta", delta: "Consider " },
  });
  p.accept({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_delta", delta: "paths" },
    message: {
      role: "assistant",
      content: [{ type: "thinking", thinking: "Consider paths" }],
    },
  });
  expect(p.snapshot().items[0]).toMatchObject({
    text: "",
    thinking: "Consider paths",
    state: "streaming",
  });
  p.accept({
    type: "message_end",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Consider paths" },
        { type: "text", text: "Answer" },
      ],
    },
  });
  expect(p.snapshot().items[0]).toMatchObject({
    text: "Answer",
    thinking: "Consider paths",
    state: "complete",
  });
  p.dispose();
});

it("includes thinking in the bounded projection rather than letting it bypass the byte budget", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {}, 2048);
  p.accept({
    type: "message_end",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "思考".repeat(10000) },
        { type: "text", text: "Reply" },
      ],
    },
  });
  const snapshot = p.snapshot();
  expect(snapshot.items[0]?.truncated).toBe(true);
  expect(snapshot.gap).toBe(true);
  expect(
    new TextEncoder().encode(JSON.stringify(snapshot.items)).length,
  ).toBeLessThanOrEqual(2048);
  p.dispose();
});

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

it("keeps the tool name when its native result is appended after execution", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({ type: "tool_execution_start", toolCallId: "t", toolName: "read" });
  p.accept({
    type: "tool_execution_end",
    toolCallId: "t",
    toolName: "read",
    isError: false,
    result: { content: [{ type: "text", text: "contents" }] },
  });
  p.accept({
    type: "message_end",
    message: {
      role: "toolResult",
      toolCallId: "t",
      content: [{ type: "text", text: "contents" }],
    },
  });
  expect(p.snapshot().items).toMatchObject([
    {
      role: "tool",
      label: { kind: "literal", text: "read" },
      text: "contents",
      state: "complete",
    },
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

it("uses full native update snapshots without appending a populated start twice", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "message_start",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "DPI_PROTOCOL" }],
    },
  });
  p.accept({
    type: "message_update",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "DPI_PROTOCOL" }],
    },
    assistantMessageEvent: { type: "text_delta", delta: "D" },
  });
  expect(p.snapshot().items[0]?.text).toBe("DPI_PROTOCOL");
  p.accept({
    type: "message_update",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "DPI_PROTOCOL_END" }],
    },
    assistantMessageEvent: { type: "text_delta", delta: "PI_PROTOCOL_END" },
  });
  expect(p.snapshot().items[0]?.text).toBe("DPI_PROTOCOL_END");
  p.dispose();
});

it("keeps a stopped reply and failed reply distinct and retains their reason alongside partial text", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "message_end",
    message: {
      role: "assistant",
      content: "partial",
      stopReason: "aborted",
      errorMessage: "d-pi 用户停止",
    },
  });
  p.accept({
    type: "message_end",
    message: {
      role: "assistant",
      content: "partial failure",
      stopReason: "error",
      errorMessage: "socket closed",
    },
  });
  expect(p.snapshot().items).toMatchObject([
    { text: "partial", state: "aborted", detail: "d-pi 用户停止" },
    { text: "partial failure", state: "failed", detail: "socket closed" },
  ]);
  p.dispose();
});

it("marks the next native reply after a failure as a continuation without carrying it across new user input", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "message_end",
    message: {
      role: "assistant",
      content: "partial",
      stopReason: "error",
      errorMessage: "socket closed",
    },
  });
  p.accept({
    type: "message_start",
    message: { role: "assistant", content: [] },
  });
  expect(p.snapshot().items[1]).toMatchObject({ continuationOf: 1 });
  p.accept({
    type: "message_end",
    message: { role: "assistant", content: "recovered", stopReason: "stop" },
  });
  p.accept({
    type: "message_end",
    message: { role: "user", content: "new request" },
  });
  p.accept({
    type: "message_start",
    message: { role: "assistant", content: [] },
  });
  expect(p.snapshot().items.at(-1)).not.toHaveProperty("continuationOf");
  p.dispose();
});

it("does not render settled and configuration telemetry as unsupported user interaction", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({ type: "session_settled" });
  p.accept({ type: "thinking_level_changed", thinkingLevel: "off" });
  p.accept({ type: "model_changed" });
  expect(p.snapshot().items).toEqual([]);
  p.dispose();
});
it("carries only validated native record identity and restored origin through final projection", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "message_end",
    message: {
      role: "user",
      content: "same",
      dPiRecordId: "record-1",
      dPiRestored: true,
    },
  });
  p.accept({
    type: "message_start",
    message: { role: "assistant", content: [] },
  });
  p.accept({
    type: "message_end",
    message: { role: "assistant", content: "same", dPiRecordId: "record-2" },
  });
  expect(p.snapshot().items).toMatchObject([
    { nativeRecordId: "record-1", restored: true },
    { nativeRecordId: "record-2" },
  ]);
  p.accept({
    type: "message_end",
    message: {
      role: "user",
      content: "other",
      dPiRecordId: 123,
      dPiRestored: "true",
    },
  });
  expect(p.snapshot().items.at(-1)?.nativeRecordId).toBeUndefined();
  p.dispose();
});

it("keeps an SDK identity coverage gap explicit without guessing a native record", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "message_end",
    message: { role: "assistant", content: "same", dPiIdentityUnknown: true },
  });
  expect(p.snapshot().gap).toBe(true);
  expect(p.snapshot().items[0]?.nativeRecordId).toBeUndefined();
  p.dispose();
});
