import { z } from "zod";
import { DirectoryIdentitySchema } from "../../workspace/contracts/public";
import { ControlCommandSchema, ControlStateSchema } from "./control";
import {
  AnswerCommandSchema,
  DismissCommandSchema,
  InteractionViewSchema,
} from "./interactions";
import { FrozenSubmissionSchema, SubmissionEventSchema } from "./submission";
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
});
export type HostStart = z.infer<typeof HostStartSchema>;
export const HostCommandSchema = z.discriminatedUnion("kind", [
  HostStartSchema,
  z.strictObject({ kind: z.literal("answer"), command: AnswerCommandSchema }),
  z.strictObject({ kind: z.literal("dismiss"), command: DismissCommandSchema }),
  z.strictObject({ kind: z.literal("control"), command: ControlCommandSchema }),
  z.strictObject({ kind: z.literal("attach") }),
  z.strictObject({
    kind: z.literal("dispatch"),
    value: FrozenSubmissionSchema,
  }),
  z.strictObject({ kind: z.literal("state") }),
  z.strictObject({ kind: z.literal("close-idle") }),
]);
export const NativeStateSchema = z.object({
  sessionId: z.string(),
  sessionFile: z.string().optional(),
  model: z
    .object({ id: z.string(), provider: z.string() })
    .nullable()
    .optional(),
  isStreaming: z.boolean(),
  isCompacting: z.boolean(),
  queuedMessageCount: z.number().int().nonnegative(),
});
export type NativeState = z.infer<typeof NativeStateSchema>;

export const HostSubmissionRejectionReasonSchema = z.enum([
  "not-ready",
  "native-unavailable",
  "unsupported-native-command",
  "paused",
  "interaction-pending",
  "stale-target",
  "correlation-limit",
]);
export type HostSubmissionRejectionReason = z.infer<
  typeof HostSubmissionRejectionReasonSchema
>;
const HostSubmissionEventSchema = z.union([
  // Keep accepting the pre-reason shape while Host producers roll forward.
  SubmissionEventSchema,
  SubmissionEventSchema.extend({
    kind: z.literal("rejected"),
    reason: HostSubmissionRejectionReasonSchema,
  }),
]);

export type HostCommand = z.infer<typeof HostCommandSchema>;
export const HostMessageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("idle-confirmed"),
    generation: z.uuid(),
    afterSubmissionId: z.uuid().nullable(),
  }),
  z.object({
    kind: z.literal("operation-result"),
    traceId: z.uuid(),
    generation: z.uuid(),
    operation: z.enum(["answer", "dismiss", "stop", "continue"]),
    status: z.enum(["acknowledged", "failed", "unknown"]),
  }),
  z.object({ kind: z.literal("interactions"), view: InteractionViewSchema }),
  z.object({
    kind: z.literal("control"),
    generation: z.uuid(),
    state: ControlStateSchema,
  }),
  z.object({ kind: z.literal("submission"), event: HostSubmissionEventSchema }),
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
  z.object({ kind: z.literal("failed"), code: z.string() }),
  z.object({ kind: z.literal("interrupted"), reason: z.string() }),
]);
export type HostMessage = z.infer<typeof HostMessageSchema>;
