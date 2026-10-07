import { z } from "zod";
import { SubagentConfigurationSnapshotSchema } from "../../configuration/contracts/public";
import { DirectoryIdentitySchema } from "../../threads/contracts/public";
import { ControlCommandSchema, ControlStateSchema } from "./control";
import {
  AnswerCommandSchema,
  DismissCommandSchema,
  InteractionViewSchema,
} from "./interactions";
import { NativeFailureSummarySchema } from "./native-failure";
import { QueueCommandSchema } from "./queue";
import {
  ConfigureSubagentCommandSchema,
  SelectModelCommandSchema,
} from "./runtime";
import { FrozenSubmissionSchema, SubmissionEventSchema } from "./submission";
export const NativeTerminationSchema = z.strictObject({
  reason: z.enum([
    "watchdog-owner-changed",
    "watchdog-owner-missing",
    "watchdog-main-changed",
    "watchdog-main-missing",
    "permit-timeout",
    "permit-rejected",
    "stdin-eof",
    "bootstrap-error",
    "sdk-exit",
  ]),
  requestedExitCode: z.number().int().nullable(),
});
export const ProcessExitEvidenceSchema = z.strictObject({
  process: z.enum(["native", "utility"]),
  pid: z.number().int().positive().nullable(),
  exitCode: z.number().int().nullable(),
  signal: z
    .string()
    .max(32)
    .regex(/^SIG[A-Z0-9]+$/)
    .nullable(),
  reason: NativeTerminationSchema.shape.reason.nullable(),
  requestedExitCode: z.number().int().nullable(),
});
export type ProcessExitEvidence = z.infer<typeof ProcessExitEvidenceSchema>;
export const NativeProcessRegistrationSchema = z.strictObject({
  pid: z.number().int().min(2),
  parentPid: z.number().int().positive(),
  groupId: z.number().int().min(2),
  birth: z.string().min(1),
  executable: z.string().min(1),
  processInstanceId: z.uuid(),
  token: z.uuid(),
});
export const HostStartSchema = z.strictObject({
  kind: z.literal("start"),
  threadId: z.uuid(),
  traceId: z.uuid(),
  processInstanceId: z.uuid(),
  connectionGeneration: z.uuid(),
  configContextId: z.string().min(1),
  binary: z.string().min(1),
  sdkEntry: z.string().optional(),
  identity: DirectoryIdentitySchema,
  environment: z.record(z.string(), z.string()),
  sessionDirectory: z.string().min(1),
  supervision: z
    .strictObject({
      mainPid: z.number().int().min(2),
      mainBirth: z.string().min(1),
      token: z.uuid(),
    })
    .optional(),
});
export type HostStart = z.infer<typeof HostStartSchema>;
export const HostCommandSchema = z.discriminatedUnion("kind", [
  HostStartSchema,
  z.strictObject({
    kind: z.literal("configure-subagent"),
    command: ConfigureSubagentCommandSchema,
  }),
  z.strictObject({
    kind: z.literal("manage-queue"),
    command: QueueCommandSchema,
  }),
  z.strictObject({
    kind: z.literal("native-permit"),
    processInstanceId: z.uuid(),
    token: z.uuid(),
    allowed: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("select-model"),
    command: SelectModelCommandSchema,
    connectionGeneration: z.uuid(),
  }),
  z.strictObject({ kind: z.literal("answer"), command: AnswerCommandSchema }),
  z.strictObject({ kind: z.literal("dismiss"), command: DismissCommandSchema }),
  z.strictObject({ kind: z.literal("control"), command: ControlCommandSchema }),
  z.strictObject({ kind: z.literal("attach") }),
  z.strictObject({
    kind: z.literal("dispatch"),
    value: FrozenSubmissionSchema,
  }),
  z.strictObject({
    kind: z.literal("state"),
    traceId: z.uuid().optional(),
    connectionGeneration: z.uuid().optional(),
  }),
  z.strictObject({ kind: z.literal("replay-evidence") }),
  z.strictObject({
    kind: z.literal("confirm-evidence"),
    evidenceId: z.uuid(),
    connectionGeneration: z.uuid(),
  }),
  z.strictObject({ kind: z.literal("close-idle") }),
]);
export const NativeStateSchema = z.object({
  sessionId: z.string(),
  sessionFile: z.string().optional(),
  model: z
    .object({ id: z.string(), provider: z.string() })
    .nullable()
    .optional(),
  thinkingLevel: z.string().default("inherit"),
  isStreaming: z.boolean(),
  isCompacting: z.boolean(),
  isSettled: z.boolean().optional(),
  hasPendingAsyncWork: z.boolean().optional(),
  queuedMessages: z
    .object({ steering: z.array(z.string()), followUp: z.array(z.string()) })
    .optional(),
  queuedMessageCount: z.number().int().nonnegative(),
});
export type NativeState = z.infer<typeof NativeStateSchema>;

export type HostCommand = z.infer<typeof HostCommandSchema>;
export const HostMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("subagents"),
    connectionGeneration: z.uuid(),
    state: SubagentConfigurationSnapshotSchema,
  }),
  z.object({
    kind: z.literal("process-exit"),
    connectionGeneration: z.uuid(),
    evidence: ProcessExitEvidenceSchema,
  }),
  z.object({
    kind: z.literal("native-register"),
    registration: NativeProcessRegistrationSchema,
  }),
  z.object({
    kind: z.literal("evidence-gap"),
    connectionGeneration: z.uuid(),
    reason: z.enum([
      "uncorrelated-result",
      "cache-full",
      "correlation-expired",
    ]),
  }),
  z.object({
    kind: z.literal("idle-confirmed"),
    connectionGeneration: z.uuid(),
    afterSubmissionId: z.uuid().nullable(),
  }),
  z.object({
    kind: z.literal("operation-result"),
    traceId: z.uuid(),
    connectionGeneration: z.uuid(),
    operation: z.enum([
      "answer",
      "dismiss",
      "stop",
      "continue",
      "select-model",
      "configure-subagent",
      "manage-queue",
      "inspect",
    ]),
    status: z.enum(["acknowledged", "failed", "unknown"]),
    nativeFailure: NativeFailureSummarySchema.optional(),
    code: z
      .string()
      .regex(/^[a-z0-9-]{1,64}$/)
      .optional(),
  }),
  z.object({ kind: z.literal("interactions"), view: InteractionViewSchema }),
  z.object({
    kind: z.literal("control"),
    connectionGeneration: z.uuid(),
    state: ControlStateSchema,
  }),
  z.object({
    kind: z.literal("submission"),
    evidenceId: z.uuid(),
    event: SubmissionEventSchema,
  }),
  z.object({
    kind: z.literal("ready"),
    state: NativeStateSchema,
    processInstanceId: z.uuid(),
    connectionGeneration: z.uuid(),
  }),
  z.object({
    kind: z.literal("state"),
    state: NativeStateSchema,
    busy: z.boolean(),
    pendingInteraction: z.boolean(),
  }),
  z.object({
    kind: z.literal("failed"),
    code: z.string(),
    nativeFailure: NativeFailureSummarySchema.optional(),
  }),
  z.object({
    kind: z.literal("interrupted"),
    reason: z.string(),
    nativeFailure: NativeFailureSummarySchema.optional(),
  }),
]);
export type HostMessage = z.infer<typeof HostMessageSchema>;

export const HostTransportCommandSchema = z.strictObject({
  scopeId: z.uuid(),
  command: HostCommandSchema,
});
export const HostTransportMessageSchema = z.strictObject({
  scopeId: z.uuid(),
  message: z.union([
    HostMessageSchema,
    z.strictObject({ kind: z.literal("scope-closed") }),
  ]),
});
