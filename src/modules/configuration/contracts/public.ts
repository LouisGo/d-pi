import { z } from "zod";
import {
  ThreadIdSchema,
  WorkingDirectoryIdSchema,
} from "../../../shared/identity";
import { EffortSchema } from "./model-selection";
export const ConfigurationScopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("application") }),
  z.strictObject({
    kind: z.literal("thread"),
    threadId: ThreadIdSchema,
    workingDirectoryId: WorkingDirectoryIdSchema,
  }),
]);
export type ConfigurationScope = z.infer<typeof ConfigurationScopeSchema>;
export function sameConfigurationScope(
  a: ConfigurationScope,
  b: ConfigurationScope,
): boolean {
  return a.kind === "application"
    ? b.kind === "application"
    : b.kind === "thread" &&
        a.threadId === b.threadId &&
        a.workingDirectoryId === b.workingDirectoryId;
}
export const ConfigurationSourceSchema = z.strictObject({
  directory: z.string(),
  profile: z.string().nullable(),
  cwd: z.string(),
});
export type ConfigurationSource = z.infer<typeof ConfigurationSourceSchema>;
const identity = { scope: ConfigurationScopeSchema, traceId: z.uuid() };
export const ConfigurationCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("snapshot"), ...identity }),
  z.strictObject({
    kind: z.literal("save-key"),
    ...identity,
    key: z.string().trim().min(1).max(8192),
  }),
  z.strictObject({ kind: z.literal("login"), ...identity }),
  z.strictObject({
    kind: z.literal("answer"),
    traceId: z.uuid(),
    jobId: z.uuid(),
    value: z.string().max(8192),
  }),
  z.strictObject({
    kind: z.literal("cancel"),
    traceId: z.uuid(),
    jobId: z.uuid(),
  }),
  z.strictObject({
    kind: z.literal("open-login"),
    traceId: z.uuid(),
    jobId: z.uuid(),
  }),
]);
export type ConfigurationCommand = z.infer<typeof ConfigurationCommandSchema>;
export {
  EffortSchema,
  type ThinkingSelection,
  ThinkingSelectionSchema,
} from "./model-selection";
export * from "./subagent-configuration";
export const ModelSummarySchema = z.strictObject({
  provider: z.string(),
  id: z.string(),
  name: z.string(),
  available: z.boolean(),
  reason: z
    .enum(["authentication-required", "disabled", "configuration-unknown"])
    .nullable(),
  reasoning: z.boolean(),
  input: z.array(z.string()),
  thinking: z.strictObject({
    efforts: z.array(EffortSchema),
    adjustable: z.boolean(),
    requiresEffort: z.boolean(),
    defaultEffort: EffortSchema.nullable(),
    defaultLevel: z.string().nullable(),
  }),
});
export const ConfigurationSnapshotSchema = z.strictObject({
  kind: z.literal("snapshot"),
  ...identity,
  source: ConfigurationSourceSchema,
  models: z.array(ModelSummarySchema),
  defaultModel: z.string().nullable(),
  openaiAuthenticated: z.boolean().nullable(),
  deepseekAuthenticated: z.boolean().nullable(),
  catalogError: z.boolean(),
  coverage: z.enum(["complete", "partial", "unavailable"]),
  issues: z.array(z.string().regex(/^[a-z0-9-]+$/)),
});
export type ConfigurationSnapshot = z.infer<typeof ConfigurationSnapshotSchema>;
const eventIdentity = {
  ...identity,
  source: ConfigurationSourceSchema.nullable(),
  jobId: z.uuid(),
};
export const ConfigurationFailureCodeSchema = z.enum([
  "configuration-unavailable",
  "stale-target",
  "operation-in-progress",
  "authentication-failed",
  "authentication-rejected",
  "authentication-network",
  "authentication-provider-unavailable",
  "operation-timed-out",
  "invalid-job",
  "unsafe-login-url",
]);
export const ConfigurationEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("challenge"),
    ...eventIdentity,
    url: z.string().url(),
    instructions: z.string(),
  }),
  z.strictObject({
    kind: z.literal("prompt"),
    ...eventIdentity,
    message: z.string(),
    secret: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("progress"),
    ...eventIdentity,
    message: z.string(),
  }),
  z.strictObject({
    kind: z.literal("finished"),
    ...eventIdentity,
    result: z.enum(["saved", "cancelled", "failed", "timed-out"]),
    code: ConfigurationFailureCodeSchema.optional(),
  }),
]);
export type ConfigurationEvent = z.infer<typeof ConfigurationEventSchema>;
const replyIdentity = {
  ...identity,
  source: ConfigurationSourceSchema.nullable(),
};
export const ConfigurationReplySchema = z.union([
  ConfigurationSnapshotSchema,
  z.strictObject({
    kind: z.literal("started"),
    ...replyIdentity,
    jobId: z.uuid(),
  }),
  z.strictObject({ kind: z.literal("done"), ...replyIdentity }),
  z.strictObject({
    kind: z.literal("failed"),
    ...replyIdentity,
    code: ConfigurationFailureCodeSchema,
  }),
]);
export type ConfigurationReply = z.infer<typeof ConfigurationReplySchema>;
export interface ConfigurationBridge {
  request(command: ConfigurationCommand): Promise<ConfigurationReply>;
  subscribe(listener: (event: ConfigurationEvent) => void): () => void;
}
export const ConfigurationTransportFrameSchema = z.strictObject({
  traceId: z.uuid(),
  message: z.unknown(),
});
