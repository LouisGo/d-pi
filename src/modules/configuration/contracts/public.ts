import { z } from "zod";
import {
  ThreadIdSchema,
  WorkingDirectoryIdSchema,
} from "../../../shared/identity";
import { EffortSchema } from "./model-selection";
import {
  ConfigurationRevisionSchema,
  CustomModelInputSchema,
  ModelCostSchema,
  ModelRoleSummarySchema,
  ProviderIdSchema,
  ProviderSummarySchema,
} from "./provider-models";

export * from "./provider-models";
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
    providerId: ProviderIdSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("login"),
    ...identity,
    providerId: ProviderIdSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("logout"),
    ...identity,
    providerId: ProviderIdSchema,
    credentialId: z.number().int().positive(),
    expectedRevision: ConfigurationRevisionSchema,
  }),
  z.strictObject({
    kind: z.literal("refresh-catalog"),
    ...identity,
    providerId: ProviderIdSchema,
  }),
  z.strictObject({
    kind: z.literal("provider-enable"),
    ...identity,
    providerId: ProviderIdSchema,
    enabled: z.boolean(),
    expectedRevision: ConfigurationRevisionSchema,
  }),
  z.strictObject({
    kind: z.literal("set-model-role"),
    ...identity,
    role: z.string().trim().min(1).max(256),
    selector: z.string().trim().min(1).max(1024).nullable(),
    target: z.enum(["global", "project"]),
    expectedRevision: ConfigurationRevisionSchema,
  }),
  z.strictObject({
    kind: z.literal("upsert-custom-model"),
    ...identity,
    model: CustomModelInputSchema,
    expectedRevision: ConfigurationRevisionSchema,
  }),
  z.strictObject({
    kind: z.literal("delete-custom-model"),
    ...identity,
    providerId: ProviderIdSchema,
    modelId: z.string().min(1).max(512),
    expectedRevision: ConfigurationRevisionSchema,
  }),
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
  sessionSelectable: z.boolean().optional(),
  reason: z
    .enum(["authentication-required", "disabled", "configuration-unknown"])
    .nullable(),
  kind: z.string().optional(),
  contextWindow: z.number().nullable().optional(),
  maxTokens: z.number().nullable().optional(),
  cost: ModelCostSchema.nullable().optional(),
  pricingStatus: z
    .enum(["fixed", "free", "included", "variable", "unknown"])
    .optional(),
  custom: z.boolean().optional(),
  assignableRoles: z.array(z.string()).optional(),
  api: z.string().optional(),
  baseUrl: z.string().nullable().optional(),
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
  providers: z.array(ProviderSummarySchema).optional(),
  modelRoles: z.array(ModelRoleSummarySchema).optional(),
  modelRoleStorage: z.enum(["global", "project"]).optional(),
  revision: ConfigurationRevisionSchema.optional(),
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
  "configuration-conflict",
  "configuration-invalid",
  "provider-unavailable",
  "credential-not-found",
  "catalog-refresh-failed",
  "model-not-found",
]);
export const ConfigurationEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("challenge"),
    ...eventIdentity,
    url: z.string().url(),
    instructions: z.string(),
    launchUrl: z.string().url().optional(),
    providerId: ProviderIdSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("prompt"),
    ...eventIdentity,
    message: z.string(),
    secret: z.boolean(),
    placeholder: z.string().optional(),
    allowEmpty: z.boolean().optional(),
    providerId: ProviderIdSchema.optional(),
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
  z.strictObject({
    kind: z.literal("done"),
    ...replyIdentity,
    snapshot: ConfigurationSnapshotSchema.optional(),
  }),
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
