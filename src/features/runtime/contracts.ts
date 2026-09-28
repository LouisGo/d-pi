import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../shared/contracts";
import type { ConversationPort } from "../conversation/model";
export const RuntimeCommandSchema = z.strictObject({
  kind: z.enum(["inspect", "allow", "start", "revoke"]),
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
});
export type RuntimeCommand = z.infer<typeof RuntimeCommandSchema>;
export const RuntimeViewSchema = z.strictObject({
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  configuration: z.string(),
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
