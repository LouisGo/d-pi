import { match } from "ts-pattern";
import { utf8ByteLength } from "../../../../shared/text/utf8";
import type {
  Answer,
  AskFormAction,
  AskInteractionDraft,
  AskQuestion,
} from "../../contracts/interactions";
import { ASK_ANSWER_BYTE_BUDGET } from "../../contracts/interactions";

export function seedAskForm(questions: AskQuestion[]): AskInteractionDraft {
  return {
    formVersion: 1,
    questionId: questions[0]?.id ?? "",
    reviewing: false,
    answers: Object.fromEntries(
      questions.map((question) => [
        question.id,
        {
          selectedOptions: [],
          customInput: "",
          custom: false,
          explicitNone: false,
        },
      ]),
    ),
  };
}
export function reduceAskForm(
  questions: AskQuestion[],
  draft: AskInteractionDraft,
  action: AskFormAction,
): AskInteractionDraft {
  if (action.kind === "review") return { ...draft, reviewing: action.value };
  const question = questions.find(
    (question) => question.id === action.questionId,
  );
  if (!question) return draft;
  if (action.kind === "question")
    return {
      ...draft,
      questionId: question.id,
      reviewing: false,
      preview: undefined,
    };
  if (action.kind === "preview") {
    if (!question.options.some((option) => option.label === action.label))
      return draft;
    return {
      ...draft,
      preview:
        draft.preview?.questionId === question.id &&
        draft.preview.label === action.label
          ? undefined
          : { questionId: question.id, label: action.label },
    };
  }
  const old = draft.answers[question.id];
  if (!old) return draft;
  const next = match(action)
    .with({ kind: "select" }, ({ label }) => {
      if (!question.options.some((option) => option.label === label))
        return old;
      const selectedOptions = question.multi
        ? old.selectedOptions.includes(label)
          ? old.selectedOptions.filter((value) => value !== label)
          : [...old.selectedOptions, label]
        : [label];
      return {
        ...old,
        selectedOptions,
        explicitNone: false,
        custom: question.multi === true && old.custom,
      };
    })
    .with({ kind: "custom" }, ({ value }) => ({
      ...old,
      custom: true,
      customInput: value,
      explicitNone: false,
      selectedOptions: question.multi ? old.selectedOptions : [],
    }))
    .with({ kind: "custom-mode" }, ({ value }) => ({
      ...old,
      custom: value,
      explicitNone: false,
      selectedOptions: value && !question.multi ? [] : old.selectedOptions,
    }))
    .with({ kind: "none" }, () =>
      question.multi
        ? { ...old, selectedOptions: [], custom: false, explicitNone: true }
        : old,
    )
    .exhaustive();
  return next === old
    ? draft
    : { ...draft, answers: { ...draft.answers, [question.id]: next } };
}
export type AskAnswerResult =
  | { kind: "ready"; answer: Extract<Answer, { kind: "ask" }> }
  | { kind: "incomplete" }
  | { kind: "too-large" };
export function buildAskAnswer(
  questions: AskQuestion[],
  draft: AskInteractionDraft,
): AskAnswerResult {
  if (questions.length === 0) return { kind: "incomplete" };
  const answers: Extract<Answer, { kind: "ask" }>["answers"] = [];
  for (const question of questions) {
    const value = draft.answers[question.id];
    if (!value) return { kind: "incomplete" };
    const selectedOptions = value.selectedOptions.filter((label) =>
      question.options.some((option) => option.label === label),
    );
    const customInput =
      value.custom && value.customInput.trim() ? value.customInput : undefined;
    if (
      !selectedOptions.length &&
      customInput === undefined &&
      !(question.multi && value.explicitNone)
    )
      return { kind: "incomplete" };
    answers.push({
      id: question.id,
      selectedOptions,
      ...(customInput !== undefined ? { customInput } : {}),
    });
  }
  return utf8ByteLength(JSON.stringify(answers)) > ASK_ANSWER_BYTE_BUDGET
    ? { kind: "too-large" }
    : { kind: "ready", answer: { kind: "ask", answers } };
}
