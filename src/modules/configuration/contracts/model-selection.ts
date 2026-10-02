import { z } from "zod";
export const EffortSchema = z.enum([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
export const ThinkingSelectionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("default") }),
  z.strictObject({ kind: z.literal("off") }),
  z.strictObject({ kind: z.literal("effort"), effort: EffortSchema }),
]);
export type ThinkingSelection = z.infer<typeof ThinkingSelectionSchema>;
