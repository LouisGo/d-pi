import { expect, it } from "vitest";
import { buildAskAnswer, reduceAskForm, seedAskForm } from "./ask-form";

const questions = [
  {
    id: "one",
    question: "One",
    options: [{ label: "A" }, { label: "B" }],
    recommended: 1,
  },
  {
    id: "many",
    question: "Many",
    options: [{ label: "C" }, { label: "D" }],
    multi: true,
  },
];
it("recommendation does not manufacture an answer and select-none must be explicit", () => {
  let draft = seedAskForm(questions);
  expect(draft.answers.one?.selectedOptions).toEqual([]);
  expect(buildAskAnswer(questions, draft)).toBeNull();
  draft = reduceAskForm(questions, draft, {
    kind: "select",
    questionId: "one",
    label: "B",
  });
  draft = reduceAskForm(questions, draft, {
    kind: "select",
    questionId: "many",
    label: "C",
  });
  draft = reduceAskForm(questions, draft, {
    kind: "select",
    questionId: "many",
    label: "C",
  });
  expect(buildAskAnswer(questions, draft)).toBeNull();
  draft = reduceAskForm(questions, draft, { kind: "none", questionId: "many" });
  expect(buildAskAnswer(questions, draft)).toEqual({
    kind: "ask",
    answers: [
      { id: "one", selectedOptions: ["B"] },
      { id: "many", selectedOptions: [] },
    ],
  });
});
it("keeps displaced single-choice text as a draft and permits multi-choice text with options", () => {
  let draft = seedAskForm(questions);
  draft = reduceAskForm(questions, draft, {
    kind: "custom",
    questionId: "one",
    value: "  中文原文\n ",
  });
  draft = reduceAskForm(questions, draft, {
    kind: "select",
    questionId: "one",
    label: "A",
  });
  expect(draft.answers.one).toMatchObject({
    customInput: "  中文原文\n ",
    custom: false,
    selectedOptions: ["A"],
  });
  draft = reduceAskForm(questions, draft, {
    kind: "custom-mode",
    questionId: "one",
    value: true,
  });
  draft = reduceAskForm(questions, draft, {
    kind: "select",
    questionId: "many",
    label: "C",
  });
  draft = reduceAskForm(questions, draft, {
    kind: "custom",
    questionId: "many",
    value: "and text",
  });
  expect(buildAskAnswer(questions, draft)).toEqual({
    kind: "ask",
    answers: [
      { id: "one", selectedOptions: [], customInput: "  中文原文\n " },
      { id: "many", selectedOptions: ["C"], customInput: "and text" },
    ],
  });
});
it("ignores foreign controls and treats navigation/preview/review as presentation only", () => {
  const initial = seedAskForm(questions);
  expect(
    reduceAskForm(questions, initial, {
      kind: "select",
      questionId: "foreign",
      label: "A",
    }),
  ).toBe(initial);
  expect(
    reduceAskForm(questions, initial, {
      kind: "select",
      questionId: "one",
      label: "foreign",
    }),
  ).toBe(initial);
  expect(
    reduceAskForm(questions, initial, { kind: "none", questionId: "one" }),
  ).toBe(initial);
  let draft = reduceAskForm(questions, initial, {
    kind: "preview",
    questionId: "one",
    label: "A",
  });
  draft = reduceAskForm(questions, draft, {
    kind: "question",
    questionId: "many",
  });
  draft = reduceAskForm(questions, draft, { kind: "review", value: true });
  expect(draft).toMatchObject({
    questionId: "many",
    reviewing: true,
    preview: undefined,
  });
  expect(draft.answers).toBe(initial.answers);
  expect(buildAskAnswer(questions, draft)).toBeNull();
});
