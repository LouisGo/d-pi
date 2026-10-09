import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../../shared/identity";
export const DialogSchema = z.object({
  id: z.string().min(1).max(256),
  method: z.enum(["confirm", "select", "input", "editor"]),
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
export const InteractionSchema = DialogSchema.extend({
  status: z.enum(["pending", "sent", "cancelled", "expired", "unknown"]),
  expiresAt: z.number().nullable(),
  defaultAnswered: z.boolean().optional(),
  // Local-only cleanup marker. cancelled+ dismissed means the App stopped
  // waiting and released its gates; native never cancelled. Never set by
  // native cancel frames. Renderers must not display it as "原生已取消".
  dismissed: z.boolean().optional(),
});
export type Interaction = z.infer<typeof InteractionSchema>;
export const AnswerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("confirm"), confirmed: z.boolean() }),
  // Select accepts a provided option or a user-written answer via the same
  // native value frame. Confirm remains a separate response above.
  z.strictObject({ kind: z.literal("value"), value: z.string().max(16384) }),
  z.strictObject({ kind: z.literal("cancel") }),
]);
export type Answer = z.infer<typeof AnswerSchema>;
export const AnswerCommandSchema = z.strictObject({
  kind: z.literal("answer"),
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  connectionGeneration: z.uuid(),
  id: z.string().min(1).max(256),
  answer: AnswerSchema,
});
export const InteractionViewSchema = z.object({
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
  if (dialog.method === "confirm") return null;
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
