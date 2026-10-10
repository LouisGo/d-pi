import { z } from "zod";
import { UiMessageSchema } from "../../../shared/messages/contracts";
import { MessageTimestampSchema } from "./message-time";
import { ToolExecutionObservationSchema } from "./tool-observation";

export * from "./history";
export type { ToolExecutionObservation } from "./tool-observation";
export { ToolExecutionObservationSchema } from "./tool-observation";
export const ConversationLabelSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("literal"), text: z.string() }),
  z.strictObject({ kind: z.literal("message"), value: UiMessageSchema }),
]);
export const SubagentObservationSchema = z.strictObject({
  nativeId: z.string().max(512),
  parentToolCallId: z.string().max(512).optional(),
  status: z.enum([
    "pending",
    "running",
    "completed",
    "failed",
    "aborted",
    "unknown",
  ]),
  task: z.string().max(2048),
  description: z.string().max(512),
  currentTool: z.string().max(120),
  unhandledEvent: z.string().max(120).optional(),
  model: z.string().max(256),
  resultSource: z.enum(["none", "progress", "live", "transcript"]),
  coverage: z.enum(["observed", "partial"]),
  reason: z
    .enum([
      "transcript-unavailable",
      "transcript-too-large",
      "transcript-empty",
      "transcript-reset",
      "truncated",
      "identity-ambiguous",
      "missing-lifecycle",
      "observation-unavailable",
    ])
    .optional(),
});
export type SubagentObservation = z.infer<typeof SubagentObservationSchema>;
export const ConversationItemSchema = z.strictObject({
  id: z.number().int().nonnegative(),
  role: z.enum(["user", "assistant", "tool", "notice", "subagent"]),
  text: z.string(),
  thinking: z.string().optional(),
  timestamp: MessageTimestampSchema.optional(),
  state: z.enum(["streaming", "complete", "failed", "aborted"]),
  detail: z.string().max(4096).optional(),
  continuationOf: z.number().int().nonnegative().optional(),
  nativeRecordId: z.string().min(1).max(512).optional(),
  restored: z.boolean().optional(),
  label: ConversationLabelSchema,
  notice: UiMessageSchema.optional(),
  truncated: z.boolean().optional(),
  subagent: SubagentObservationSchema.optional(),
  tool: ToolExecutionObservationSchema.optional(),
  subagentNotice: z
    .enum(["observation-unavailable", "observation-limit"])
    .optional(),
});
export type ConversationItem = z.infer<typeof ConversationItemSchema>;
export const ConversationSnapshotSchema = z.strictObject({
  kind: z.literal("snapshot"),
  connectionGeneration: z.uuid(),
  seq: z.number().int().nonnegative(),
  items: z.array(ConversationItemSchema),
  gap: z.boolean(),
});
export type ConversationSnapshot = z.infer<typeof ConversationSnapshotSchema>;
export const ConversationUpdateSchema = z.strictObject({
  kind: z.literal("update"),
  connectionGeneration: z.uuid(),
  seq: z.number().int().nonnegative(),
  item: ConversationItemSchema,
  droppedBefore: z.number().int().nonnegative(),
  gap: z.boolean(),
});
export type ConversationUpdate = z.infer<typeof ConversationUpdateSchema>;
export const ConversationEventSchema = z.discriminatedUnion("kind", [
  ConversationSnapshotSchema,
  ConversationUpdateSchema,
]);
export type ConversationEvent = z.infer<typeof ConversationEventSchema>;

export interface ConversationPort {
  connect(
    threadId: string,
    listener: (event: ConversationEvent) => void,
  ): () => void;
}
