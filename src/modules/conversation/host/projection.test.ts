import { expect, it, vi } from "vitest";
import { ConversationProjection } from "./projection";
import { ConversationSnapshotSchema } from "../contracts/public";

it("defers superseded full snapshots until a lifecycle barrier and preserves delta ordering", () => {
  const emitted: string[] = [];
  const p = new ConversationProjection(crypto.randomUUID(), (event) => {
    emitted.push(event.item.text);
  });
  p.accept({ type: "message_start", message: { role: "assistant", content: [] } });
  let reads = 0;
  for (const text of ["a", "ab", "abc"]) {
    p.accept({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: text.slice(-1) },
      message: {
        role: "assistant",
        get content() {
          reads++;
          return [{ type: "text", text }];
        },
      },
    });
  }
  expect(reads).toBe(0);
  p.accept({
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta: "d" },
  });
  p.accept({ type: "turn_end" });
  expect(reads).toBe(1);
  expect(emitted.at(-1)).toBe("abcd");
  expect(p.snapshot()).toMatchObject({ seq: 1, items: [{ text: "abcd" }] });
  p.dispose();
});

it("projects tool progress and preserves its real identity through native result append", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "tool_execution_start", toolCallId: "tool-real", toolName: "read",
    args: { path: "src/example.ts" },
  });
  const id = p.snapshot().items[0]?.id;
  p.accept({
    type: "tool_execution_update", toolCallId: "tool-real", toolName: "read",
    partialResult: { content: [{ type: "text", text: "working" }], details: { lines: 2 } },
  });
  expect(p.snapshot().items[0]).toMatchObject({
    id, text: "working",
    tool: {
      toolCallId: "tool-real", name: "read", lifecycle: "running",
      observed: ["start", "update"], coverage: "observed",
      arguments: { value: { path: "src/example.ts" }, truncated: false },
      progress: { value: { content: [{ type: "text", text: "working" }], details: { lines: 2 } } },
    },
  });
  p.accept({
    type: "tool_execution_end", toolCallId: "tool-real", toolName: "read",
    isError: false, result: { content: [{ type: "text", text: "done" }] },
  });
  p.accept({
    type: "message_end",
    message: { role: "toolResult", toolCallId: "tool-real", content: "done", dPiRecordId: "native-tool" },
  });
  expect(p.snapshot().items).toMatchObject([{
    id, nativeRecordId: "native-tool",
    tool: { lifecycle: "completed", observed: ["start", "update", "end", "message-end"] },
  }]);
  p.dispose();
});

it.each(["agent_end", "turn_end", "turn_start", "session_settled", "agent_start"])(
  "flushes authoritative snapshots and trailing deltas before %s",
  (type) => {
    const texts: string[] = [];
    const p = new ConversationProjection(crypto.randomUUID(), (event) => texts.push(event.item.text));
    p.accept({ type: "message_start", message: { role: "assistant", content: "old" } });
    p.accept({
      type: "message_update", message: { role: "assistant", content: "full" },
      assistantMessageEvent: { type: "text_delta", delta: "ignored" },
    });
    p.accept({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "+delta" } });
    p.accept({ type });
    expect(texts).toEqual(["full+delta"]);
    p.dispose();
  },
);

it("flushes a token batch on the timer and leaves final authoritative text exact", () => {
  vi.useFakeTimers();
  const texts: string[] = [];
  const p = new ConversationProjection(crypto.randomUUID(), (event) => texts.push(event.item.text));
  try {
    p.accept({ type: "message_start", message: { role: "assistant", content: "" } });
    p.accept({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "partial" } });
    vi.advanceTimersByTime(32);
    expect(texts).toEqual(["partial"]);
    p.accept({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: " stale" } });
    p.accept({ type: "message_end", message: { role: "assistant", content: "final" } });
    expect(texts).toEqual(["partial", "partial stale", "final"]);
    expect(p.snapshot()).toMatchObject({ seq: 3, items: [{ text: "final", state: "complete" }] });
  } finally {
    p.dispose();
    vi.useRealTimers();
  }
});

it("bounds unknown tool structures, excludes binary data and marks missing lifecycle explicitly", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "tool_execution_update", toolCallId: "orphan", toolName: "future",
    partialResult: {
      content: [{ type: "image", data: "secret-binary".repeat(10000), mimeType: "image/png" }],
      details: { unknown: Array.from({ length: 1000 }, () => ({ text: "x".repeat(10000) })) },
    },
  });
  const snapshot = p.snapshot();
  expect(ConversationSnapshotSchema.safeParse(snapshot).success).toBe(true);
  expect(snapshot.items[0]?.tool).toMatchObject({
    toolCallId: "orphan", observed: ["update"], coverage: "partial", truncated: true,
    progress: { truncated: true },
  });
  expect(JSON.stringify(snapshot.items[0]?.tool?.progress)).not.toContain("secret-binary");
  expect(new TextEncoder().encode(JSON.stringify(snapshot.items[0]?.tool?.progress?.value)).length).toBeLessThanOrEqual(8192);
  p.dispose();
});

it("budgets metadata exactly and removes only actually evicted tool mappings", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {}, 1024);
  p.accept({ type: "tool_execution_start", toolCallId: "old-tool", toolName: "read", args: { text: "x".repeat(10000) } });
  const oldId = p.snapshot().items[0]?.id;
  for (let n = 0; n < 8; n++)
    p.accept({ type: "message_end", message: { role: "user", content: "x".repeat(300) } });
  p.accept({ type: "tool_execution_end", toolCallId: "old-tool", toolName: "read", result: { content: [] } });
  const snapshot = p.snapshot();
  expect(snapshot.items.at(-1)?.id).not.toBe(oldId);
  expect(snapshot.items.at(-1)?.tool).toMatchObject({ coverage: "partial", observed: ["end"] });
  expect(new TextEncoder().encode(JSON.stringify(snapshot.items)).length).toBeLessThanOrEqual(1024);
  expect(snapshot.gap).toBe(true);
  p.dispose();
});

it("retains exactly 1000 indexed records and assigns fresh identities after eviction", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  for (let n = 0; n < 1001; n++)
    p.accept({ type: "message_end", message: { role: "user", content: "" } });
  const snapshot = p.snapshot();
  expect(snapshot.items).toHaveLength(1000);
  expect(snapshot.items[0]?.id).toBe(2);
  expect(snapshot.gap).toBe(true);
  p.dispose();
});

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
