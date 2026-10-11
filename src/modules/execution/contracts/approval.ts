import { z } from "zod";

/** Native tool facts only. OMP select dialogs do not carry this identity. */
export const ApprovalObservationSchema = z.strictObject({
  nativeSessionKey: z.string().min(1).max(512),
  toolCallId: z.string().min(1).max(256),
  toolName: z.string().min(1).max(120),
  approvalMode: z.enum(["always-ask", "write", "yolo"]).optional(),
  reason: z.string().max(4096).optional(),
  reasonTruncated: z.literal(true).optional(),
  status: z.enum(["pending", "approved", "denied", "unknown"]),
  requestedAt: z.number().int().nonnegative().optional(),
  resolvedAt: z.number().int().nonnegative().optional(),
});
export type ApprovalObservation = z.infer<typeof ApprovalObservationSchema>;
export const ApprovalStateSchema = z.strictObject({
  items: z.array(ApprovalObservationSchema).max(64),
  coverage: z.enum(["observed", "gap"]),
});
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;
export const ApprovalViewSchema = ApprovalStateSchema.extend({
  connectionGeneration: z.uuid(),
});
export type ApprovalView = z.infer<typeof ApprovalViewSchema>;
