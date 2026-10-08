import { z } from "zod";

export const ProviderIdSchema = z.string().trim().min(1).max(256);
export const ConfigurationRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const ModelCostSchema = z.strictObject({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
});
export const ProviderSummarySchema = z.strictObject({
  id: ProviderIdSchema,
  name: z.string(),
  storageProvider: ProviderIdSchema,
  disabled: z.boolean(),
  authState: z.enum(["configured", "required", "keyless", "unknown"]),
  authSource: z
    .strictObject({
      kind: z.enum(["runtime", "config", "oauth", "api_key", "env"]),
      concrete: z.boolean(),
      envVar: z.string().optional(),
    })
    .nullable(),
  loginMethods: z.array(
    z.strictObject({
      id: ProviderIdSchema,
      name: z.string(),
      available: z.boolean(),
      kind: z.enum(["api-key", "oauth-code", "device-code", "custom"]),
      probe: z.enum([
        "none",
        "models-endpoint",
        "chat-completions",
        "anthropic-messages",
      ]),
    }),
  ),
  accounts: z.array(
    z.strictObject({
      credentialId: z.number().int().positive(),
      type: z.enum(["oauth", "api_key"]),
      email: z.string().optional(),
      accountId: z.string().optional(),
      orgId: z.string().optional(),
      orgName: z.string().optional(),
      projectId: z.string().optional(),
      enterpriseUrl: z.string().optional(),
    }),
  ),
  apiKeyEditable: z.boolean().optional(),
  keyValidation: z.enum(["native", "none"]).optional(),
  modelCount: z.number().int().nonnegative(),
  baseUrl: z.string().nullable(),
});
export type ProviderSummary = z.infer<typeof ProviderSummarySchema>;
export const ModelRoleSummarySchema = z.strictObject({
  role: z.string(),
  name: z.string(),
  value: z.string().nullable(),
  source: z.string().nullable(),
  globalValue: z.string().nullable(),
  projectValue: z.string().nullable(),
});
export type ModelRoleSummary = z.infer<typeof ModelRoleSummarySchema>;
export const CustomModelInputSchema = z.strictObject({
  provider: ProviderIdSchema,
  id: z.string().trim().min(1).max(512),
  name: z.string().trim().min(1).max(512),
  baseUrl: z
    .url({ protocol: /^https?$/ })
    .refine(
      (value) => !/[?#]/.test(value) && !/^https?:\/\/[^/]*@/.test(value),
    ),
  api: z.string().trim().min(1).max(128).optional(),
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
  reasoning: z.boolean(),
  input: z.array(z.enum(["text", "image"])).min(1),
  cost: ModelCostSchema.optional(),
});
export type CustomModelInput = z.infer<typeof CustomModelInputSchema>;
