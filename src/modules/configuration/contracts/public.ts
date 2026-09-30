import { z } from "zod";
export const ConfigurationCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("snapshot"), traceId: z.uuid() }),
  z.strictObject({
    kind: z.literal("save-key"),
    traceId: z.uuid(),
    key: z.string().trim().min(1).max(8192),
  }),
  z.strictObject({ kind: z.literal("login"), traceId: z.uuid() }),
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
export const ModelSummarySchema = z.strictObject({
  provider: z.string(),
  id: z.string(),
  name: z.string(),
  available: z.boolean(),
  reason: z.enum(["authentication-required", "disabled"]).nullable(),
  reasoning: z.boolean(),
  input: z.array(z.string()),
});
export const ConfigurationSnapshotSchema = z.strictObject({
  kind: z.literal("snapshot"),
  directory: z.string(),
  profile: z.string().nullable(),
  models: z.array(ModelSummarySchema),
  defaultModel: z.string().nullable(),
  openaiAuthenticated: z.boolean(),
  deepseekAuthenticated: z.boolean(),
  catalogError: z.boolean(),
});
export type ConfigurationSnapshot = z.infer<typeof ConfigurationSnapshotSchema>;
export const ConfigurationEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("challenge"),
    jobId: z.uuid(),
    url: z.string().url(),
    instructions: z.string(),
  }),
  z.strictObject({
    kind: z.literal("prompt"),
    jobId: z.uuid(),
    message: z.string(),
    secret: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("progress"),
    jobId: z.uuid(),
    message: z.string(),
  }),
  z.strictObject({
    kind: z.literal("finished"),
    jobId: z.uuid(),
    result: z.enum(["saved", "cancelled", "failed", "timed-out"]),
  }),
]);
export type ConfigurationEvent = z.infer<typeof ConfigurationEventSchema>;
export const ConfigurationReplySchema = z.union([
  ConfigurationSnapshotSchema,
  z.strictObject({ kind: z.literal("started"), jobId: z.uuid() }),
  z.strictObject({ kind: z.literal("done") }),
  z.strictObject({
    kind: z.literal("failed"),
    traceId: z.uuid(),
    code: z.enum([
      "configuration-unavailable",
      "operation-in-progress",
      "authentication-failed",
      "invalid-job",
      "unsafe-login-url",
    ]),
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
