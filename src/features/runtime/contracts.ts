import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../shared/identity";
import { ControlCommandSchema, ControlStateSchema } from "../control/contracts";
import {
  AnswerCommandSchema,
  DismissCommandSchema,
  InteractionViewSchema,
} from "../control/interactions";
import type { ConversationPort } from "../conversation/contracts";
import { UiMessageSchema } from "../localization/contracts";
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
export interface RuntimeBridge {
  conversation?: ConversationPort;
  request(command: RuntimeCommand): Promise<RuntimeView>;
  subscribe(listener: (view: RuntimeView) => void): () => void;
}
