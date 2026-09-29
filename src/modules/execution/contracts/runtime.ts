import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../../shared/identity";
import { UiMessageSchema } from "../../../shared/messages/contracts";
import { ControlCommandSchema, ControlStateSchema } from "./control";
import {
  AnswerCommandSchema,
  DismissCommandSchema,
  InteractionViewSchema,
} from "./interactions";
export const RuntimeCommandSchema = z.union([
  z.strictObject({
    kind: z.enum(["inspect", "allow", "start", "revoke"]),
    threadId: ThreadIdSchema,
    traceId: TraceIdSchema,
  }),
  ControlCommandSchema,
  AnswerCommandSchema,
  DismissCommandSchema,
]);
export type RuntimeCommand = z.infer<typeof RuntimeCommandSchema>;
export const RuntimeViewSchema = z.strictObject({
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  configuration: UiMessageSchema,
  generation: z.uuid().optional(),
  control: ControlStateSchema.optional(),
  interactions: InteractionViewSchema.optional(),
  revision: z.number().int().nonnegative(),
  phase: z.enum([
    "browse",
    "allowed",
    "starting",
    "ready",
    "interrupted",
    "failed",
  ]),
  trusted: z.boolean(),
  busy: z.boolean(),
  model: z.string().nullable(),
  message: UiMessageSchema,
});
export type RuntimeView = z.infer<typeof RuntimeViewSchema>;
export const RuntimeFailureSchema = z.strictObject({
  traceId: TraceIdSchema,
  code: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/),
  category: z.enum(["resource", "transport", "unknown"]),
  message: UiMessageSchema,
});
export type RuntimeFailure = z.infer<typeof RuntimeFailureSchema>;
export const RuntimeReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("view"), view: RuntimeViewSchema }),
  z.strictObject({ kind: z.literal("failed"), error: RuntimeFailureSchema }),
]);
export type RuntimeReply = z.infer<typeof RuntimeReplySchema>;
export interface RuntimeBridge {
  request(command: RuntimeCommand): Promise<RuntimeReply>;
  subscribe(listener: (view: RuntimeView) => void): () => void;
}
