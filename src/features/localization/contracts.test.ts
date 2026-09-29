import { expect, it } from "vitest";
import { UiMessageSchema } from "./contracts";

it("accepts only registered semantic messages and bounded parameters", () => {
  expect(
    UiMessageSchema.safeParse({ code: "runtime.readyToSend" }).success,
  ).toBe(true);
  expect(
    UiMessageSchema.safeParse({
      code: "runtime.readyToSend",
      params: { extra: "x" },
    }).success,
  ).toBe(false);
  expect(
    UiMessageSchema.safeParse({
      code: "runtime.configProfile",
      params: { profile: "a".repeat(121) },
    }).success,
  ).toBe(false);
  expect(
    UiMessageSchema.safeParse({
      code: "conversation.unsupportedNativeEvent",
      params: { eventType: "future" },
    }).success,
  ).toBe(true);
  expect(UiMessageSchema.safeParse({ code: "not-registered" }).success).toBe(
    false,
  );
});
