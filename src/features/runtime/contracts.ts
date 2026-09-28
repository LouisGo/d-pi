import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../shared/identity";
import { ControlCommandSchema, ControlStateSchema } from "../control/contracts";
import {
  AnswerCommandSchema,
  InteractionViewSchema,
} from "../control/interactions";
import type { ConversationPort } from "../conversation/contracts";
export const RuntimeCommandSchema = z.union([
  z.strictObject({
    kind: z.enum(["inspect", "allow", "start", "revoke"]),
    threadId: ThreadIdSchema,
    traceId: TraceIdSchema,
  }),
  ControlCommandSchema,
  AnswerCommandSchema,
]);
export type RuntimeCommand = z.infer<typeof RuntimeCommandSchema>;
export const RuntimeViewSchema = z.strictObject({
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  configuration: z.string(),
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
  message: z.string(),
});
export type RuntimeView = z.infer<typeof RuntimeViewSchema>;
export interface RuntimeBridge {
  conversation?: ConversationPort;
  request(command: RuntimeCommand): Promise<RuntimeView>;
  subscribe(listener: (view: RuntimeView) => void): () => void;
}
