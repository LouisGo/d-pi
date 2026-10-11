import { z } from "zod";
import { UiMessageSchema } from "../../../shared/messages/contracts";
import type { ToolDetailPort } from "../../resources/contracts/public";
import { LifecycleObservationSchema, TurnOutcomeSchema } from "./activity";
import { MessageTimestampSchema } from "./message-time";
import { ToolExecutionObservationSchema } from "./tool-observation";

export type { LifecycleObservation, TurnOutcome } from "./activity";
export * from "./history";
export type {
  ToolExecutionObservation,
  ToolPayload,
} from "./tool-observation";
export {
  ToolExecutionObservationSchema,
  ToolPayloadSchema,
} from "./tool-observation";
export type { ToolChange, ToolSearchHit, ToolSemantic } from "./tool-semantic";
export { ToolSemanticSchema } from "./tool-semantic";
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
  turnOutcome: TurnOutcomeSchema.optional(),
  lifecycle: LifecycleObservationSchema.optional(),
  state: z.enum(["streaming", "complete", "failed", "aborted"]),
  detail: z.string().max(4096).optional(),
  continuationOf: z.number().int().nonnegative().optional(),
  nativeRecordId: z.string().min(1).max(512).optional(),
  /** Actual assistant toolCall owner; absence means no proven grouping relation. */
  activityParent: z
    .strictObject({
      itemId: z.number().int().nonnegative(),
      recordId: z.string().min(1).max(512).optional(),
    })
    .optional(),
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
  nativeSessionKey: z.string().max(512).optional(),
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
  bodyMode: z.enum(["replace", "snapshot", "final"]).optional(),
});
export type ConversationUpdate = z.infer<typeof ConversationUpdateSchema>;
export const ConversationAppendSchema = z.strictObject({
  kind: z.literal("append"),
  connectionGeneration: z.uuid(),
  seq: z.number().int().nonnegative(),
  item: ConversationItemSchema.omit({ text: true, thinking: true }),
  text: z.string().max(8 * 1024 * 1024),
  thinking: z.string().max(8 * 1024 * 1024),
  droppedBefore: z.number().int().nonnegative(),
  gap: z.boolean(),
});
export type ConversationAppend = z.infer<typeof ConversationAppendSchema>;
export const ConversationEventSchema = z.discriminatedUnion("kind", [
  ConversationSnapshotSchema,
  ConversationUpdateSchema,
  ConversationAppendSchema,
]);
export type ConversationEvent = z.infer<typeof ConversationEventSchema>;
/** The authenticated Thread port scopes demand; changing demand never changes execution. */
export const ConversationReadCommandSchema = z.strictObject({
  kind: z.literal("timeline-demand"),
  active: z.boolean(),
});

export interface ConversationPort {
  watchTool?: ToolDetailPort["watchTool"];
  connect(
    threadId: string,
    listener: (event: ConversationEvent) => void,
  ): () => void;
}
/** Wire body codec after generation/sequence admission. Missing append bases require resync. */
export function applyConversationUpdate(
  prior: ConversationItem | undefined,
  event: ConversationUpdate | ConversationAppend,
): ConversationItem | null {
  if (event.kind === "update") return event.item;
  if (!prior) return null;
  return {
    ...event.item,
    text: prior.text + event.text,
    thinking: (prior.thinking ?? "") + event.thinking,
  };
}
