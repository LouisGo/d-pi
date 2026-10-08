import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../../shared/identity";
import { UiMessageSchema } from "../../../shared/messages/contracts";
import {
  SubagentConfigurationCommandSchema,
  SubagentConfigurationSnapshotSchema,
  ThinkingSelectionSchema,
} from "../../configuration/contracts/public";
import { ControlCommandSchema, ControlStateSchema } from "./control";
import {
  AnswerCommandSchema,
  DismissCommandSchema,
  InteractionViewSchema,
} from "./interactions";
import { QueueCommandSchema, RuntimeOperationSchema } from "./queue";
export const ModelSelectionSchema = z.strictObject({
  provider: z.string().min(1).max(256),
  modelId: z.string().min(1).max(512),
  thinking: ThinkingSelectionSchema,
});
export const SelectModelCommandSchema = z.strictObject({
  kind: z.literal("select-model"),
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  selection: ModelSelectionSchema,
});
export const ConfigureSubagentCommandSchema = z.strictObject({
  kind: z.literal("configure-subagent"),
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  connectionGeneration: z.uuid(),
  command: SubagentConfigurationCommandSchema,
});
export const RuntimeCommandSchema = z.union([
  SelectModelCommandSchema,
  ConfigureSubagentCommandSchema,
  QueueCommandSchema,
  z.strictObject({
    kind: z.enum(["inspect", "allow", "start", "revoke"]),
    threadId: ThreadIdSchema,
    traceId: TraceIdSchema,
  }),
  ControlCommandSchema,
  AnswerCommandSchema,
  DismissCommandSchema,
]);
export type RuntimeCommand = z.infer<typeof RuntimeCommandSchema>;
export const NativeRecoveryReasonSchema = z.enum([
  "occupied",
  "owner-unknown",
  "shutdown-unconfirmed",
  "lease-unavailable",
]);
export type NativeRecoveryReason = z.infer<typeof NativeRecoveryReasonSchema>;
export const RuntimeViewSchema = z.strictObject({
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  configuration: UiMessageSchema,
  connectionGeneration: z.uuid().optional(),
  control: ControlStateSchema.optional(),
  subagents: SubagentConfigurationSnapshotSchema.optional(),
  subagentOperation: RuntimeOperationSchema.optional(),
  queueOperation: RuntimeOperationSchema.optional(),
  interactions: InteractionViewSchema.optional(),
  revision: z.number().int().nonnegative(),
  recoveryFailure: NativeRecoveryReasonSchema.optional(),
  phase: z.enum([
    "browse",
    "allowed",
    "starting",
    "ready",
    "interrupted",
    "failed",
  ]),
  trusted: z.boolean(),
  busy: z.boolean(),
  evidenceCoverage: z.enum(["complete", "gap"]).optional(),
  model: z.string().nullable(),
  selectedModel: ModelSelectionSchema.optional(),
  thinkingLevel: z.string().optional(),
  modelChanging: z.boolean().optional(),
  message: UiMessageSchema,
});
export type RuntimeView = z.infer<typeof RuntimeViewSchema>;
export const RuntimeFailureSchema = z.strictObject({
  traceId: TraceIdSchema,
  code: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/),
  category: z.enum(["resource", "transport", "unknown"]),
  message: UiMessageSchema,
});
export type RuntimeFailure = z.infer<typeof RuntimeFailureSchema>;
export const RuntimeReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("view"), view: RuntimeViewSchema }),
  z.strictObject({ kind: z.literal("failed"), error: RuntimeFailureSchema }),
]);
export type RuntimeReply = z.infer<typeof RuntimeReplySchema>;
export interface RuntimeBridge {
  request(command: RuntimeCommand): Promise<RuntimeReply>;
  subscribe(listener: (view: RuntimeView) => void): () => void;
}
