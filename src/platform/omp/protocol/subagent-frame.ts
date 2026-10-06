import { z } from "zod";

const identity = {
  id: z.string().min(1).max(512),
  parentToolCallId: z.string().max(512).optional(),
  sessionFile: z.string().max(8192).optional(),
};
export const NativeSubagentStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "aborted",
]);
const owner = {
  parentToolCallId: identity.parentToolCallId,
  sessionFile: identity.sessionFile,
};
const details = {
  index: z.number().int().nonnegative(),
  agent: z.string(),
  agentSource: z.string(),
  description: z.string().optional(),
};
export const NativeSubagentLifecycleSchema = z.looseObject({
  ...identity,
  ...details,
  status: z.enum(["started", "completed", "failed", "aborted"]),
});
export const NativeSubagentProgressSchema = z.looseObject({
  ...owner,
  ...details,
  task: z.string(),
  assignment: z.string().optional(),
  progress: z.looseObject({
    id: identity.id,
    status: NativeSubagentStatusSchema,
    recentOutput: z.array(z.string()),
    description: z.string().optional(),
    currentTool: z.string().optional(),
    resolvedModel: z.string().optional(),
  }),
});
export const NativeSubagentSnapshotSchema = z.looseObject({
  ...identity,
  ...details,
  status: NativeSubagentStatusSchema,
  task: z.string().optional(),
  lastUpdate: z.number(),
  progress: NativeSubagentProgressSchema.shape.progress.optional(),
});
export const NativeSubagentsResultSchema = z.looseObject({
  subagents: z.array(NativeSubagentSnapshotSchema),
});
export const NativeSubagentEventSchema = z.looseObject({
  id: identity.id,
  event: z.looseObject({ type: z.string() }),
});
export const NativeSubagentTranscriptSchema = z.looseObject({
  sessionFile: z.string(),
  fromByte: z.number().int().nonnegative(),
  nextByte: z.number().int().nonnegative(),
  reset: z.boolean(),
  messages: z.array(z.unknown()),
});
export type NativeSubagentLifecycle = z.infer<
  typeof NativeSubagentLifecycleSchema
>;
/** Native yield data is a result even when the final assistant has no prose. */
export function nativeSubagentResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const prose = content
    .flatMap((part: unknown) => {
      const parsed = z
        .object({ type: z.literal("text"), text: z.string() })
        .safeParse(part);
      return parsed.success ? [parsed.data.text] : [];
    })
    .join("\n");
  if (prose) return prose;
  for (const part of content) {
    const parsed = z
      .object({
        type: z.literal("toolCall"),
        name: z.literal("yield"),
        arguments: z.object({
          data: z.unknown().optional(),
          error: z.string().optional(),
        }),
      })
      .safeParse(part);
    if (parsed.success) {
      const data = parsed.data.arguments.data;
      if (data !== undefined)
        return typeof data === "string" ? data : JSON.stringify(data);
      if (parsed.data.arguments.error) return parsed.data.arguments.error;
    }
  }
  return "";
}
