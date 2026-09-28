import { expect, it } from "vitest";
import { ConversationProjection } from "./projection";

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
    { role: "tool", text: "not found", state: "failed", label: "read" },
  ]);
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
  p.dispose();
});
