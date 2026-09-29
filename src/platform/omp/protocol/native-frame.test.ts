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
