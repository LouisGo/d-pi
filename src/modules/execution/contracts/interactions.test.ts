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

it("keeps the native rich question set and leaves ask deadlines with the native owner", async () => {
  const { DialogSchema, AnswerSchema } = await import("./interactions");
  const questions = [
    {
      id: "one",
      question: "Choose",
      header: "Mode",
      options: [
        { label: "A", description: "Detail", preview: "Preview" },
        { label: "B" },
      ],
      recommended: 1,
    },
    {
      id: "two",
      question: "Select any",
      options: [{ label: "C" }],
      multi: true,
    },
  ];
  const dialog = DialogSchema.parse({
    id: "native-ask",
    method: "ask",
    questions,
    timeout: 0,
  });
  expect(dialog).toMatchObject({ questions, timeout: 0 });
  expect(defaultAnswerFor(dialog)).toBeNull();
  expect(
    AnswerSchema.parse({
      kind: "ask",
      answers: [
        { id: "one", selectedOptions: ["A"] },
        { id: "two", selectedOptions: [], customInput: "  自填  " },
      ],
    }),
  ).toMatchObject({ kind: "ask" });
});

it("rejects ambiguous question identity and an over-budget rich answer", async () => {
  const { DialogSchema, AnswerSchema } = await import("./interactions");
  const question = { id: "same", question: "Q", options: [{ label: "A" }] };
  expect(
    DialogSchema.safeParse({
      id: "request",
      method: "ask",
      questions: [question, question],
    }).success,
  ).toBe(false);
  expect(
    DialogSchema.safeParse({
      id: "request",
      method: "ask",
      questions: [{ ...question, options: [{ label: "A" }, { label: "A" }] }],
    }).success,
  ).toBe(false);
  expect(
    AnswerSchema.safeParse({
      kind: "ask",
      answers: Array.from({ length: 32 }, (_, i) => ({
        id: `${i}`,
        selectedOptions: [],
        customInput: "中".repeat(16000),
      })),
    }).success,
  ).toBe(false);
});
