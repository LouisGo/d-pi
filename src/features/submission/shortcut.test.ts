import { expect, it } from "vitest";
import { shouldSend } from "./shortcut";

it("gives composition priority and applies compact/expanded Enter contracts", () => {
  const key = {
    key: "Enter",
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    isComposing: false,
    keyCode: 13,
  };
  expect(shouldSend(key, "enter-send", false)).toBe(true);
  expect(shouldSend({ ...key, isComposing: true }, "enter-send", false)).toBe(
    false,
  );
  expect(shouldSend({ ...key, keyCode: 229 }, "enter-send", false)).toBe(false);
  expect(shouldSend({ ...key, shiftKey: true }, "enter-send", false)).toBe(
    false,
  );
  expect(shouldSend(key, "enter-send", true)).toBe(false);
  expect(shouldSend({ ...key, metaKey: true }, "enter-send", true)).toBe(true);
  expect(shouldSend(key, "enter-newline", false)).toBe(false);
});
