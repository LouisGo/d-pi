import { z } from "zod";
import { DirectoryIdentitySchema } from "../../threads/contracts/public";
import { ControlCommandSchema, ControlStateSchema } from "./control";
import {
  AnswerCommandSchema,
  DismissCommandSchema,
  InteractionViewSchema,
} from "./interactions";
import { SelectModelCommandSchema } from "./runtime";
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
  thinkingLevel: z.string().optional(),
  isStreaming: z.boolean(),
  isCompacting: z.boolean(),
  queuedMessageCount: z.number().int().nonnegative(),
});
export type NativeState = z.infer<typeof NativeStateSchema>;

export type HostCommand = z.infer<typeof HostCommandSchema>;
export const HostMessageSchema = z.discriminatedUnion("kind", [
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
    ]),
    status: z.enum(["acknowledged", "failed", "unknown"]),
  }),
  z.object({ kind: z.literal("interactions"), view: InteractionViewSchema }),
  z.object({
    kind: z.literal("control"),
    connectionGeneration: z.uuid(),
    state: ControlStateSchema,
  }),
  z.object({ kind: z.literal("submission"), event: SubmissionEventSchema }),
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
