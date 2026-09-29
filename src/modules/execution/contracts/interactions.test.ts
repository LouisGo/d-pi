import { expect, it } from "vitest";
import { defaultAnswerFor } from "./interactions";

it("never provides a timeout default for confirm dialogs", () => {
  expect(
    defaultAnswerFor({
      method: "confirm",
      options: undefined,
      prefill: undefined,
    }),
  ).toBeNull();
});

it("defaults select dialogs to the first option, cancel when options are missing", () => {
  expect(
    defaultAnswerFor({
      method: "select",
      options: ["a", "b"],
      prefill: undefined,
    }),
  ).toEqual({ kind: "value", value: "a" });
  expect(
    defaultAnswerFor({ method: "select", options: [], prefill: undefined }),
  ).toEqual({ kind: "cancel" });
  expect(
    defaultAnswerFor({
      method: "select",
      options: undefined,
      prefill: undefined,
    }),
  ).toEqual({ kind: "cancel" });
});

it("defaults input/editor dialogs to the prefill, cancel when absent", () => {
  expect(
    defaultAnswerFor({ method: "input", options: undefined, prefill: "hello" }),
  ).toEqual({ kind: "value", value: "hello" });
  expect(
    defaultAnswerFor({
      method: "editor",
      options: undefined,
      prefill: undefined,
    }),
  ).toEqual({ kind: "cancel" });
});
