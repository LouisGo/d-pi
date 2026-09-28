import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../shared/identity";
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
});
export type Interaction = z.infer<typeof InteractionSchema>;
export const AnswerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("confirm"), confirmed: z.boolean() }),
  z.strictObject({ kind: z.literal("value"), value: z.string().max(16384) }),
  z.strictObject({ kind: z.literal("cancel") }),
]);
export type Answer = z.infer<typeof AnswerSchema>;
export const AnswerCommandSchema = z.strictObject({
  kind: z.literal("answer"),
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  generation: z.uuid(),
  id: z.string().min(1).max(256),
  answer: AnswerSchema,
});
export const InteractionViewSchema = z.object({
  generation: z.uuid(),
  items: z.array(InteractionSchema).max(32),
  unsupported: z.boolean(),
});
