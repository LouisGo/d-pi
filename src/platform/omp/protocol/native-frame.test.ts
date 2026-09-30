import { expect, it } from "vitest";
import {
  isKnownNativeFrameType,
  isNativeFrameType,
  NativeFrameSchema,
  NativeFrameTypes,
} from "./public";

it("keeps unknown frame types and payload fields open", () => {
  const frame = NativeFrameSchema.parse({
    type: "future_native_event",
    payload: { value: 42 },
  });

  expect(frame).toEqual({
    type: "future_native_event",
    payload: { value: 42 },
  });
  expect(isKnownNativeFrameType(frame.type)).toBe(false);
});

it("guards known frame types without closing the external frame set", () => {
  const frame = NativeFrameSchema.parse({
    type: NativeFrameTypes.agentEnd,
    isTerminal: false,
  });

  expect(isKnownNativeFrameType(NativeFrameTypes.agentEnd)).toBe(true);
  expect(isKnownNativeFrameType("future_native_event")).toBe(false);
  expect(isNativeFrameType(frame, NativeFrameTypes.agentEnd)).toBe(true);
  expect(
    isNativeFrameType(
      frame,
      NativeFrameTypes.messageStart,
      NativeFrameTypes.agentEnd,
    ),
  ).toBe(true);
  expect(isNativeFrameType(frame, NativeFrameTypes.messageEnd)).toBe(false);
});

it("does not certify known event payloads with malformed decision fields", () => {
  expect(
    isNativeFrameType(
      NativeFrameSchema.parse({ type: "agent_end", isTerminal: "false" }),
      NativeFrameTypes.agentEnd,
    ),
  ).toBe(false);
  expect(
    isNativeFrameType(
      NativeFrameSchema.parse({
        type: "response",
        command: "prompt",
        success: "true",
        id: "request",
      }),
      NativeFrameTypes.response,
    ),
  ).toBe(false);
  expect(
    isNativeFrameType(
      NativeFrameSchema.parse({
        type: "message_start",
        message: { role: 7, content: "text" },
      }),
      NativeFrameTypes.messageStart,
    ),
  ).toBe(false);
  expect(
    isNativeFrameType(
      NativeFrameSchema.parse({
        type: "tool_execution_end",
        toolCallId: "tool",
        toolName: "edit",
        isError: "false",
      }),
      NativeFrameTypes.toolExecutionEnd,
    ),
  ).toBe(false);
});

it("retains the fixed SDK's optional tool completion failure flag", () => {
  expect(
    isNativeFrameType(
      NativeFrameSchema.parse({
        type: "tool_execution_end",
        toolCallId: "tool",
        toolName: "read",
        result: { content: [] },
      }),
      NativeFrameTypes.toolExecutionEnd,
    ),
  ).toBe(true);
});
