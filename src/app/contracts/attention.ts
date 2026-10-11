import { z } from "zod";
import { RequestKeySchema } from "../../modules/execution/contracts/public";
import { NotificationPreferencesSchema } from "../../modules/preferences/contracts/public";
import { ThreadIdSchema, TraceIdSchema } from "../../shared/identity";

export const ActivationSourceTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("request"), requestKey: RequestKeySchema }),
  z.strictObject({ kind: z.literal("receipt"), traceId: TraceIdSchema }),
  z.strictObject({ kind: z.literal("runtime"), traceId: TraceIdSchema }),
  z.strictObject({ kind: z.literal("result"), traceId: TraceIdSchema }),
  z.strictObject({ kind: z.literal("thread") }),
]);
export type ActivationSourceTarget = z.infer<
  typeof ActivationSourceTargetSchema
>;
export const ActivationOutcomeSchema = z.enum([
  "located",
  "target-unavailable",
  "cancelled",
]);
export type ActivationOutcome = z.infer<typeof ActivationOutcomeSchema>;

export const AttentionEntrySchema = z.strictObject({
  threadId: ThreadIdSchema,
  eventId: z.uuid(),
  traceId: TraceIdSchema,
  kind: z.enum(["needs-answer", "failed", "completed", "interrupted"]),
  unread: z.boolean(),
  sourceTarget: ActivationSourceTargetSchema.optional(),
});
export type AttentionEntry = z.infer<typeof AttentionEntrySchema>;
export const ActivationIntentSchema = z
  .strictObject({
    id: z.uuid(),
    threadId: ThreadIdSchema,
    eventId: z.uuid(),
    target: AttentionEntrySchema.extend({
      sourceTarget: ActivationSourceTargetSchema,
    }),
  })
  .refine(
    (intent) =>
      intent.target.threadId === intent.threadId &&
      intent.target.eventId === intent.eventId &&
      (intent.target.sourceTarget.kind !== "request" ||
        intent.target.sourceTarget.requestKey.threadId === intent.threadId),
    "Activation target identity mismatch",
  );
export type ActivationIntent = z.infer<typeof ActivationIntentSchema>;
export const AttentionSnapshotSchema = z.strictObject({
  instanceId: z.uuid(),
  revision: z.number().int().nonnegative(),
  entries: z.array(AttentionEntrySchema).max(512),
  preferences: NotificationPreferencesSchema,
  system: z.enum(["disabled", "available", "unavailable", "failed"]),
  coverageGap: z.boolean(),
  openRequest: ActivationIntentSchema.nullable(),
});
export type AttentionSnapshot = z.infer<typeof AttentionSnapshotSchema>;
export const AttentionCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("activation-ready"),
    traceId: TraceIdSchema,
    rendererId: z.uuid(),
    ready: z.boolean(),
  }),
  z.strictObject({ kind: z.literal("snapshot"), traceId: TraceIdSchema }),
  z.strictObject({
    kind: z.literal("preferences"),
    traceId: TraceIdSchema,
    value: NotificationPreferencesSchema,
  }),
  z.strictObject({
    kind: z.literal("visible"),
    traceId: TraceIdSchema,
    threadId: ThreadIdSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal("seen"),
    traceId: TraceIdSchema,
    threadId: ThreadIdSchema,
    eventId: z.uuid(),
  }),
  z.strictObject({
    kind: z.literal("opened"),
    traceId: TraceIdSchema,
    id: z.uuid(),
    rendererId: z.uuid(),
    outcome: ActivationOutcomeSchema,
  }),
]);
export type AttentionCommand = z.infer<typeof AttentionCommandSchema>;
export const AttentionReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("snapshot"),
    traceId: TraceIdSchema,
    snapshot: AttentionSnapshotSchema,
  }),
  z.strictObject({
    kind: z.literal("failed"),
    traceId: TraceIdSchema,
    code: z.enum(["storage-unavailable", "invalid-request", "source-changed"]),
  }),
]);
export type AttentionReply = z.infer<typeof AttentionReplySchema>;
export interface AttentionBridge {
  request(command: AttentionCommand): Promise<AttentionReply>;
  subscribe(listener: (snapshot: AttentionSnapshot) => void): () => void;
}
