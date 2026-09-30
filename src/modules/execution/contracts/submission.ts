import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../../shared/identity";
import { UiMessageSchema } from "../../../shared/messages/contracts";
import { DraftTextSchema } from "../../input/contracts/public";

export const SubmissionIdSchema = z.uuid().brand<"SubmissionId">();
export const SubmissionTargetSchema = z.strictObject({
  processInstanceId: z.uuid(),
  connectionGeneration: z.uuid(),
  configContextId: z.string().min(1),
  nativeSessionRef: z.string().min(1),
});
export const FrozenSubmissionSchema = z.strictObject({
  submissionId: SubmissionIdSchema,
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  revision: z.number().int().nonnegative(),
  text: DraftTextSchema,
  delivery: z.enum(["followUp", "steer"]).optional(),
  // Provenance of the frozen text. Draft-bound submissions must match a saved
  // draft revision (same-revision and draft gates apply). Free text (e.g. a
  // late answer to an already default-answered dialog) has no draft revision:
  // identity is carried by the submissionId primary key alone, and ACK never
  // consumes editor content. Absent means "draft" for pre-existing rows.
  origin: z.enum(["draft", "free"]).optional(),
  target: SubmissionTargetSchema,
  requestId: z.uuid(),
  retryOf: SubmissionIdSchema.optional(),
});
export type FrozenSubmission = z.infer<typeof FrozenSubmissionSchema>;
export const SubmissionRejectionReasonSchema = z.enum([
  "not-ready",
  "native-unavailable",
  "unsupported-native-command",
  "paused",
  "interaction-pending",
  "stale-target",
  "correlation-limit",
]);
export type SubmissionRejectionReason = z.infer<
  typeof SubmissionRejectionReasonSchema
>;

const ReceiptIdentitySchema = FrozenSubmissionSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
});
const ExecutionOutcomeSchema = z.enum(["unobserved", "failed", "unknown"]);
const UnacknowledgedReceiptSchema = ReceiptIdentitySchema.extend({
  acknowledgedAt: z.null(),
  outcome: z.literal("unobserved"),
  rejectionReason: z.never().optional(),
});

// Call confirmation and execution outcome are independent facts. Only the
// acknowledged variant has an ACK time; only a refusal can have its reason.
export const SubmissionReceiptSchema = z.discriminatedUnion("state", [
  UnacknowledgedReceiptSchema.extend({ state: z.literal("prepared") }),
  UnacknowledgedReceiptSchema.extend({ state: z.literal("dispatching") }),
  UnacknowledgedReceiptSchema.extend({
    state: z.literal("unknown"),
    outcome: ExecutionOutcomeSchema,
  }),
  ReceiptIdentitySchema.extend({
    state: z.literal("acknowledged"),
    acknowledgedAt: z.string(),
    outcome: ExecutionOutcomeSchema,
    rejectionReason: z.never().optional(),
  }),
  UnacknowledgedReceiptSchema.extend({
    state: z.literal("rejected"),
    // Absent remains valid for old persisted refusals without a known cause.
    rejectionReason: SubmissionRejectionReasonSchema.optional(),
  }),
]);
export type SubmissionReceipt = z.infer<typeof SubmissionReceiptSchema>;

export class SubmissionConflict extends Error {}
export const SubmissionFailureSchema = z.strictObject({
  errorId: z.uuid(),
  traceId: TraceIdSchema,
  code: z.enum([
    "storage-unavailable",
    "not-ready",
    "content-too-large",
    "unknown-submission",
    "stale-event",
    "revision-conflict",
    "unsupported-native-command",
    "queue-full",
  ]),
  observedAt: z.literal("main"),
  reportedBy: z.literal("app"),
  attribution: z.literal("unknown"),
  handlingOwner: z.literal("submission"),
  recovery: z.enum(["user_action", "reconcile_first"]),
  message: UiMessageSchema,
});
export type SubmissionFailure = z.infer<typeof SubmissionFailureSchema>;
const SubmissionEventIdentitySchema = z.strictObject({
  submissionId: SubmissionIdSchema,
  requestId: z.uuid(),
  target: SubmissionTargetSchema,
});
export const SubmissionEventSchema = z.discriminatedUnion("kind", [
  SubmissionEventIdentitySchema.extend({
    kind: z.enum(["ack", "error", "disconnected"]),
    reason: z.never().optional(),
  }),
  SubmissionEventIdentitySchema.extend({
    kind: z.literal("rejected"),
    reason: SubmissionRejectionReasonSchema.optional(),
  }),
]);
export type SubmissionEvent = z.infer<typeof SubmissionEventSchema>;

export const SubmissionCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("resend"),
    threadId: ThreadIdSchema,
    submissionId: SubmissionIdSchema,
    traceId: TraceIdSchema,
    originalId: SubmissionIdSchema,
  }),
  z.strictObject({
    kind: z.literal("prepare"),
    threadId: ThreadIdSchema,
    submissionId: SubmissionIdSchema,
    traceId: TraceIdSchema,
    revision: z.number().int().nonnegative(),
    text: DraftTextSchema,
    delivery: z.enum(["followUp", "steer"]).optional(),
    origin: z.enum(["draft", "free"]).optional(),
  }),
  z.strictObject({
    kind: z.literal("dispatch"),
    threadId: ThreadIdSchema,
    submissionId: SubmissionIdSchema,
  }),
  z.strictObject({ kind: z.literal("list"), threadId: ThreadIdSchema }),
]);
export type SubmissionCommand = z.infer<typeof SubmissionCommandSchema>;
export const SubmissionReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("receipt"),
    receipt: SubmissionReceiptSchema,
  }),
  z.strictObject({
    kind: z.literal("failed"),
    code: SubmissionFailureSchema.shape.code,
    error: SubmissionFailureSchema,
  }),
  z.strictObject({
    kind: z.literal("list"),
    receipts: z.array(SubmissionReceiptSchema).max(100),
  }),
]);
export type SubmissionReply = z.infer<typeof SubmissionReplySchema>;
export interface SubmissionBridge {
  request(command: SubmissionCommand): Promise<SubmissionReply>;
  subscribe(listener: (reply: SubmissionReply) => void): () => void;
}
