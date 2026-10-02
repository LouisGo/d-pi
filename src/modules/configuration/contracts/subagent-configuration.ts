import { z } from "zod";
import { ThinkingSelectionSchema } from "./model-selection";

export const SubagentOverrideSchema = z.strictObject({
  provider: z.string().min(1).max(256),
  modelId: z.string().min(1).max(512),
  thinking: ThinkingSelectionSchema,
});
export const SubagentConfigurationCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("set"),
    agent: z.string().min(1).max(256),
    ...SubagentOverrideSchema.shape,
  }),
  z.strictObject({
    kind: z.literal("clear"),
    agent: z.string().min(1).max(256),
  }),
]);
export type SubagentConfigurationCommand = z.infer<
  typeof SubagentConfigurationCommandSchema
>;
export const SubagentConfigurationSnapshotSchema = z.strictObject({
  agents: z.array(
    z.strictObject({
      name: z.string(),
      description: z.string(),
      override: SubagentOverrideSchema.nullable(),
      effectivePatterns: z.array(z.string()),
    }),
  ),
});
export type SubagentConfigurationSnapshot = z.infer<
  typeof SubagentConfigurationSnapshotSchema
>;
