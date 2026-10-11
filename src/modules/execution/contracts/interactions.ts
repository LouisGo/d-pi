import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../../shared/identity";
import type { UiMessage } from "../../../shared/messages/contracts";
import { utf8ByteLength } from "../../../shared/text/utf8";
export const ASK_ANSWER_BYTE_BUDGET = 262144;
export const AskQuestionSchema = z.strictObject({
  id: z.string().min(1).max(256),
  question: z.string().max(8192),
  header: z.string().max(256).optional(),
  options: z
    .array(
      z.strictObject({
        label: z.string().max(512),
        description: z.string().max(2048).optional(),
        preview: z.string().max(65536).optional(),
      }),
    )
    .max(64)
    .refine(
      (options) =>
        new Set(options.map((option) => option.label)).size === options.length,
      "Duplicate native option labels",
    ),
  multi: z.boolean().optional(),
  recommended: z.number().int().optional(),
});
export type AskQuestion = z.infer<typeof AskQuestionSchema>;
export const AskAnswerItemSchema = z.strictObject({
  id: z.string().min(1).max(256),
  selectedOptions: z.array(z.string().max(512)).max(64),
  customInput: z.string().max(16384).optional(),
});
const dialogBase = z.object({
  id: z.string().min(1).max(256),
  title: z.string().max(2048),
  message: z.string().max(8192).optional(),
  options: z.array(z.string().max(512)).max(64).optional(),
  optionDetails: z
    .array(z.object({ description: z.string().max(2048).optional() }))
    .max(64)
    .optional(),
  placeholder: z.string().max(2048).optional(),
  prefill: z.string().max(16384).optional(),
  timeout: z.number().nonnegative().finite().optional(),
});
const ordinaryDialog = dialogBase.extend({
  method: z.enum(["confirm", "select", "input", "editor"]),
});
const askDialog = dialogBase.extend({
  method: z.literal("ask"),
  title: z.string().max(2048).default(""),
  questions: z
    .array(AskQuestionSchema)
    .min(1)
    .max(64)
    .refine(
      (questions) =>
        new Set(questions.map((question) => question.id)).size ===
        questions.length,
      "Duplicate native question IDs",
    ),
});
export const DialogSchema = z
  .discriminatedUnion("method", [ordinaryDialog, askDialog])
  .refine(
    (dialog) => utf8ByteLength(JSON.stringify(dialog)) <= 1048576,
    "Native question exceeds byte budget",
  );
export const AnswerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("confirm"), confirmed: z.boolean() }),
  // Select accepts a provided option or a user-written answer via the same
  // native value frame. Confirm remains a separate response above.
  z.strictObject({ kind: z.literal("value"), value: z.string().max(16384) }),
  z.strictObject({
    kind: z.literal("ask"),
    answers: z
      .array(AskAnswerItemSchema)
      .min(1)
      .max(64)
      .refine(
        (answers) =>
          utf8ByteLength(JSON.stringify(answers)) <= ASK_ANSWER_BYTE_BUDGET,
        "Answer exceeds byte budget",
      ),
  }),
  z.strictObject({ kind: z.literal("cancel") }),
]);
export type Answer = z.infer<typeof AnswerSchema>;
export const AnswerEvidenceSchema = z.strictObject({
  operationId: TraceIdSchema,
  origin: z.enum(["user", "default"]),
  status: z.enum(["written", "unknown"]),
  observedAt: z.iso.datetime(),
});
const observation = {
  status: z.enum(["pending", "written", "cancelled", "expired", "unknown"]),
  expiresAt: z.number().nullable(),
  defaultAnswered: z.boolean().optional(),
  answerEvidence: AnswerEvidenceSchema.optional(),
  // Local dismissal releases App gates; it is not a native cancellation.
  dismissed: z.boolean().optional(),
  // Local expiry/write cannot prove native completion; exact cancel can.
  requestPresence: z.enum(["observed", "ended", "unknown"]).optional(),
};
export const InteractionSchema = z.discriminatedUnion("method", [
  ordinaryDialog.extend(observation),
  askDialog.extend(observation),
]);
export type Interaction = z.infer<typeof InteractionSchema>;
/** Result observation is independent of RuntimeView revision and native ending. */
export const RequestKeySchema = z.strictObject({
  threadId: ThreadIdSchema,
  nativeSessionKey: z.string().min(1).max(512),
  connectionGeneration: z.uuid(),
  requestId: z.string().min(1).max(256),
});
export type RequestKey = z.infer<typeof RequestKeySchema>;
export const InteractionOperationSchema = z.strictObject({
  operationId: TraceIdSchema,
  threadId: ThreadIdSchema,
  connectionGeneration: z.uuid(),
  requestId: z.string().min(1).max(256),
  nativeSessionKey: z.string().min(1).max(512).optional(),
  kind: z.enum(["answer", "dismiss"]),
  status: z.enum([
    "dispatching",
    "not-dispatched",
    "written",
    "unknown",
    "dismissed",
  ]),
  message: z.string().max(64).optional(),
});
export type InteractionOperation = z.infer<typeof InteractionOperationSchema>;
export interface AskInteractionDraft {
  formVersion: 1;
  questionId: string;
  reviewing: boolean;
  preview?: { questionId: string; label: string } | undefined;
  answers: Record<
    string,
    {
      selectedOptions: string[];
      customInput: string;
      custom: boolean;
      explicitNone: boolean;
    }
  >;
}
export type AskFormAction =
  | { kind: "question"; questionId: string }
  | { kind: "review"; value: boolean }
  | { kind: "preview"; questionId: string; label: string }
  | { kind: "select"; questionId: string; label: string }
  | { kind: "custom"; questionId: string; value: string }
  | { kind: "custom-mode"; questionId: string; value: boolean }
  | { kind: "none"; questionId: string };
export type InteractionEditorSurface = "timeline" | "dock";
export interface InteractionEditorHandle {
  identity: string;
  surface: InteractionEditorSurface;
  version: number;
}
export interface InteractionDraft {
  editorSurface?: InteractionEditorSurface;
  editorVersion?: number;
  editorFocusVersion?: number;
  ask?: AskInteractionDraft;
  value: string;
  selection:
    | { kind: "option"; index: number; value: string }
    | { kind: "custom" }
    | null;
  answer?: Answer;
  followUpIds: string[];
  followUpSending: boolean;
  followUpError?: UiMessage | "fallback" | null;
}
export const AnswerCommandSchema = z.strictObject({
  kind: z.literal("answer"),
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  connectionGeneration: z.uuid(),
  id: z.string().min(1).max(256),
  nativeSessionKey: z.string().min(1).max(512).optional(),
  answer: AnswerSchema,
});
export const InteractionViewSchema = z.object({
  nativeSessionKey: z.string().min(1).max(512).optional(),
  connectionGeneration: z.uuid(),
  items: z.array(InteractionSchema).max(32),
  unsupported: z.boolean(),
});
export const DismissCommandSchema = z.strictObject({
  kind: z.literal("dismiss"),
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  connectionGeneration: z.uuid(),
  id: z.string().min(1).max(256),
});

// Timeout default answers (2026-09-28 user decision, clarified 2026-09-29):
// App never auto-answers confirm; select takes the first option, input/editor
// take the prefill when present and cancel otherwise. Returns null when no
// default may be sent. If an extension supplies its own native timeout for
// confirm, native still ends it as false per official SDK; App shows expired
// truthfully instead of pretending eternal pending.
export function defaultAnswerFor(
  dialog: Pick<Interaction, "method" | "options" | "prefill">,
): Answer | null {
  if (dialog.method === "confirm" || dialog.method === "ask") return null;
  if (dialog.method === "select") {
    const first = dialog.options?.[0];
    return first === undefined
      ? { kind: "cancel" }
      : { kind: "value", value: first };
  }
  return dialog.prefill === undefined
    ? { kind: "cancel" }
    : { kind: "value", value: dialog.prefill };
}

/** Native 18.8.9 validates positional IDs, membership and single/multi semantics. */
export function validAnswerFor(dialog: Interaction, answer: Answer): boolean {
  if (answer.kind === "cancel") return true;
  if (dialog.method === "ask") {
    if (
      answer.kind !== "ask" ||
      answer.answers.length !== dialog.questions.length
    )
      return false;
    return dialog.questions.every((question, index) => {
      const value = answer.answers[index];
      if (
        !value ||
        value.id !== question.id ||
        new Set(value.selectedOptions).size !== value.selectedOptions.length ||
        value.selectedOptions.some(
          (label) => !question.options.some((option) => option.label === label),
        )
      )
        return false;
      return (
        question.multi === true ||
        (value.selectedOptions.length <= 1 &&
          !(value.selectedOptions.length > 0 && value.customInput?.trim()))
      );
    });
  }
  return dialog.method === "confirm"
    ? answer.kind === "confirm"
    : answer.kind === "value";
}

/** Null is a private draft index for a source not observed yet, never a native ID. */
export function interactionDraftIdentity(
  threadId: string,
  view: { connectionGeneration: string; nativeSessionKey?: string | undefined },
  id: string,
): string {
  return JSON.stringify([
    threadId,
    view.nativeSessionKey ?? null,
    view.connectionGeneration,
    id,
  ]);
}
