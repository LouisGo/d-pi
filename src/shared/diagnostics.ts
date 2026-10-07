import { z } from "zod";
import { TraceIdSchema } from "./identity";

export const DiagnosticOperationSchema = z.enum([
  "unknown",
  "diagnostics:query",
  "diagnostics:export",
  "diagnostics:writer",
  "attention:snapshot",
  "attention:preferences",
  "attention:visible",
  "attention:seen",
  "attention:opened",
  "attention:invalid",
  "attention:notification",
  "restore",
  "choose-project",
  "new-thread",
  "select-thread",
  "list-threads",
  "save",
  "preferences",
  "window",
  "submit",
  "locale:set-preference",
  "runtime:inspect",
  "runtime:allow",
  "runtime:start",
  "runtime:revoke",
  "runtime:select-model",
  "runtime:configure-subagent",
  "runtime:manage-queue",
  "runtime:answer",
  "runtime:dismiss",
  "runtime:stop",
  "runtime:continue",
  "runtime:host",
  "runtime:native-exit",
  "runtime:utility-exit",
  "runtime:evidence",
  "configuration:snapshot",
  "configuration:snapshot:adapter",
  "configuration:save-key",
  "configuration:save-key:adapter",
  "configuration:login",
  "configuration:login:adapter",
  "configuration:answer",
  "configuration:answer:adapter",
  "configuration:cancel",
  "configuration:cancel:adapter",
  "configuration:open-login",
  "configuration:open-login:adapter",
  "configuration:snapshot:queue",
  "attachments:list",
  "attachments:choose-import",
  "attachments:check-storage",
  "attachments:clean-storage",
  "attachments:import-bytes",
  "attachments:add-reference",
  "attachments:search-reference",
  "attachments:preview",
  "attachments:retry",
  "attachments:set-text-only",
  "attachments:maintenance",
  "history:project-list",
  "history:project-read",
  "files:list",
  "files:read",
  "git:list",
  "git:diff",
]);

export const DiagnosticStageSchema = z.enum([
  "prepared",
  "dispatching",
  "acknowledged",
  "unknown",
  "received",
  "completed",
  "failed",
  "renderer-gone",
  "initiated",
  "confirmed",
  "acknowledgement-failed",
  "disconnected",
  "exited",
]);
export const DiagnosticFilterSchema = z
  .strictObject({
    since: z.iso.datetime(),
    until: z.iso.datetime(),
    traceId: TraceIdSchema.optional(),
    threadId: z.uuid().optional(),
    processInstanceId: z.uuid().optional(),
    stage: DiagnosticStageSchema.optional(),
    operation: DiagnosticOperationSchema.optional(),
    limit: z.number().int().min(1).max(500),
  })
  .refine((scope) => Date.parse(scope.since) <= Date.parse(scope.until), {
    message: "Invalid diagnostic time range",
  });
export type DiagnosticFilter = z.infer<typeof DiagnosticFilterSchema>;
const boundedCode = z.string().max(96);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const DiagnosticWriterGapSchema = z.strictObject({
  startedAt: z.iso.datetime(),
  recoveredAt: z.iso.datetime(),
  dropped: count,
  uncertain: count,
  retentionFailures: count,
});
export type DiagnosticWriterGap = z.infer<typeof DiagnosticWriterGapSchema>;
export const DiagnosticWriterHealthSchema = z.strictObject({
  degraded: z.boolean(),
  dropped: count,
  // Optional only for compatibility with snapshots produced before this contract.
  uncertain: count.optional(),
  retentionFailures: count.optional(),
  rejected: count.optional(),
  drainTimedOut: count.optional(),
  inFlight: count.optional(),
  episode: z
    .strictObject({
      startedAt: z.iso.datetime(),
      reason: z.enum(["prewrite", "append", "retention"]),
    })
    .optional(),
  lastRecovery: DiagnosticWriterGapSchema.optional(),
});
export type DiagnosticWriterHealth = z.infer<
  typeof DiagnosticWriterHealthSchema
>;
export const DiagnosticRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  time: z.iso.datetime(),
  process: z.literal("main"),
  processInstanceId: z.uuid(),
  build: z.strictObject({
    version: boundedCode,
    commit: boundedCode,
    dirty: z.boolean(),
    id: boundedCode,
  }),
  traceId: TraceIdSchema,
  requestId: boundedCode,
  connectionId: boundedCode,
  operation: DiagnosticOperationSchema,
  stage: DiagnosticStageSchema,
  observedAt: z.literal("preload").optional(),
  threadId: z.uuid().optional(),
  submissionId: z.uuid().optional(),
  nativeProcessInstanceId: z.uuid().optional(),
  receiptState: z
    .enum(["prepared", "dispatching", "acknowledged", "unknown", "rejected"])
    .optional(),
  outcome: z
    .enum(["unobserved", "failed", "unknown", "completed", "aborted"])
    .optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  errorId: z.uuid().optional(),
  code: boundedCode.optional(),
  causeCode: boundedCode.optional(),
  processPid: z.number().int().nonnegative().nullable().optional(),
  exitCode: z.number().int().nullable().optional(),
  exitSignal: boundedCode.nullable().optional(),
  terminationReason: boundedCode.nullable().optional(),
  requestedExitCode: z.number().int().nullable().optional(),
  writerGap: DiagnosticWriterGapSchema.optional(),
});
export type DiagnosticRecord = z.infer<typeof DiagnosticRecordSchema>;
export const DiagnosticSnapshotSchema = z.strictObject({
  sampledAt: z.iso.datetime(),
  filter: DiagnosticFilterSchema,
  records: z.array(DiagnosticRecordSchema).max(500),
  coverage: z.strictObject({
    files: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
    lines: z.number().int().nonnegative(),
    malformed: z.number().int().nonnegative(),
    redacted: z.number().int().nonnegative(),
    unreadable: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }),
  writer: DiagnosticWriterHealthSchema,
});
export type DiagnosticSnapshot = z.infer<typeof DiagnosticSnapshotSchema>;
export const DiagnosticRequestSchema = z.strictObject({
  kind: z.enum(["query", "export"]),
  traceId: TraceIdSchema,
  filter: DiagnosticFilterSchema,
});
export type DiagnosticRequest = z.infer<typeof DiagnosticRequestSchema>;
export const DiagnosticReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("snapshot"),
    traceId: TraceIdSchema,
    snapshot: DiagnosticSnapshotSchema,
  }),
  z.strictObject({
    kind: z.literal("exported"),
    traceId: TraceIdSchema,
    fileName: z.string().max(256),
  }),
  z.strictObject({ kind: z.literal("cancelled"), traceId: TraceIdSchema }),
  z.strictObject({
    kind: z.literal("failed"),
    traceId: TraceIdSchema,
    reason: z.enum([
      "busy",
      "read-unavailable",
      "export-unavailable",
      "invalid-request",
      "source-changed",
    ]),
  }),
]);
export type DiagnosticReply = z.infer<typeof DiagnosticReplySchema>;
export interface DiagnosticBridge {
  request(command: DiagnosticRequest): Promise<DiagnosticReply>;
}
