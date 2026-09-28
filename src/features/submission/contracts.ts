import { z } from "zod";
import {
  DraftTextSchema,
  ThreadIdSchema,
  TraceIdSchema,
} from "../../shared/contracts";

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
  target: SubmissionTargetSchema,
  requestId: z.uuid(),
});
export type FrozenSubmission = z.infer<typeof FrozenSubmissionSchema>;
export const SubmissionReceiptSchema = FrozenSubmissionSchema.extend({
  state: z.enum(["prepared", "dispatching", "acknowledged", "unknown"]),
  acknowledgedAt: z.string().nullable(),
  // An asynchronous error is not proof of rejection before business acceptance.
  outcome: z.enum(["unobserved", "failed", "unknown"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
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
  ]),
  observedAt: z.literal("main"),
  reportedBy: z.literal("app"),
  attribution: z.literal("unknown"),
  handlingOwner: z.literal("submission"),
  recovery: z.enum(["user_action", "reconcile_first"]),
  safeMessage: z.string(),
});
export type SubmissionFailure = z.infer<typeof SubmissionFailureSchema>;
export const SubmissionEventSchema = z.strictObject({
  kind: z.enum(["ack", "error", "disconnected"]),
  submissionId: SubmissionIdSchema,
  requestId: z.uuid(),
  target: SubmissionTargetSchema,
});
export type SubmissionEvent = z.infer<typeof SubmissionEventSchema>;

export const SubmissionCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("prepare"),
    threadId: ThreadIdSchema,
    submissionId: SubmissionIdSchema,
    traceId: TraceIdSchema,
    revision: z.number().int().nonnegative(),
    text: DraftTextSchema,
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
