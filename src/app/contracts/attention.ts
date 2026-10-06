import { z } from "zod";
import { NotificationPreferencesSchema } from "../../modules/preferences/contracts/public";
import { ThreadIdSchema, TraceIdSchema } from "../../shared/identity";

export const AttentionEntrySchema = z.strictObject({
  threadId: ThreadIdSchema,
  eventId: z.uuid(),
  traceId: TraceIdSchema,
  kind: z.enum(["needs-answer", "failed", "completed", "interrupted"]),
  unread: z.boolean(),
});
export type AttentionEntry = z.infer<typeof AttentionEntrySchema>;
export const AttentionSnapshotSchema = z.strictObject({
  instanceId: z.uuid(),
  revision: z.number().int().nonnegative(),
  entries: z.array(AttentionEntrySchema).max(512),
  preferences: NotificationPreferencesSchema,
  system: z.enum(["disabled", "available", "unavailable", "failed"]),
  coverageGap: z.boolean(),
  openRequest: z.strictObject({
    id: z.uuid(),
    threadId: ThreadIdSchema,
    eventId: z.uuid(),
  }).nullable(),
});
export type AttentionSnapshot = z.infer<typeof AttentionSnapshotSchema>;
export const AttentionCommandSchema = z.discriminatedUnion("kind", [
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
