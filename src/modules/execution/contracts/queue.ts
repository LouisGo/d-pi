import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../../shared/identity";
import { utf8ByteLength } from "../../../shared/text/utf8";
import { SubmissionTargetSchema } from "./submission";
export const QueueTextSchema = z
  .string()
  .max(262144)
  .refine(
    (text) => utf8ByteLength(JSON.stringify(text)) <= 262144,
    "Queue text too large",
  );
export const QueueActionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.enum(["begin-edit", "cancel-edit", "delete"]),
    entryId: z.uuid(),
    revision: z.number().int().nonnegative(),
  }),
  z.strictObject({
    action: z.literal("move"),
    entryId: z.uuid(),
    revision: z.number().int().nonnegative(),
    toIndex: z.number().int().nonnegative(),
  }),
  z.strictObject({
    action: z.enum(["update-edit", "save-edit"]),
    entryId: z.uuid(),
    revision: z.number().int().nonnegative(),
    text: QueueTextSchema,
  }),
]);
export type QueueAction = z.infer<typeof QueueActionSchema>;
export const QueueSnapshotSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  items: z
    .array(
      z.strictObject({
        id: z.uuid(),
        kind: z.enum(["steering", "followUp"]),
        text: QueueTextSchema,
        editable: z.boolean(),
        editing: z.boolean(),
        truncated: z.boolean(),
      }),
    )
    .max(128),
  editing: z
    .strictObject({ entryId: z.uuid(), draftText: QueueTextSchema })
    .nullable(),
  hiddenCount: z.number().int().nonnegative(),
  coverage: z.enum(["complete", "limited"]),
});
export type QueueSnapshot = z.infer<typeof QueueSnapshotSchema>;
export const QueueCommandSchema = z.strictObject({
  kind: z.literal("manage-queue"),
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  connectionGeneration: z.uuid(),
  command: QueueActionSchema,
});
export const RuntimeOperationSchema = z.strictObject({
  traceId: TraceIdSchema,
  status: z.enum(["pending", "acknowledged", "failed", "unknown"]),
  reconciled: z.boolean().optional(),
  code: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional(),
});
export const QueueChangeSchema = z.strictObject({
  traceId: TraceIdSchema,
  threadId: ThreadIdSchema,
  target: SubmissionTargetSchema,
  command: QueueActionSchema,
  previousText: QueueTextSchema,
  previousTruncated: z.boolean().optional(),
  status: z.enum(["dispatching", "acknowledged", "failed", "unknown"]),
  createdAt: z.string(),
});
export type QueueChange = z.infer<typeof QueueChangeSchema>;
