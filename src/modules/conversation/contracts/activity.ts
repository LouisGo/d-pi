import { z } from "zod";

export const TurnOutcomeSchema = z.strictObject({
  scope: z.literal("native-turn"),
  observationId: z.string().min(1).max(120),
  stopReason: z.string().max(120).optional(),
  toolResults: z.number().int().nonnegative(),
  failedTools: z.number().int().nonnegative(),
  unknownTools: z.number().int().nonnegative(),
});
export const LifecycleObservationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("compaction"),
    phase: z.enum(["started", "ended"]),
    observedAt: z.number().int().nonnegative(),
    action: z.enum([
      "context-full",
      "remote",
      "handoff",
      "shake",
      "snapcompact",
    ]),
    reason: z.enum(["threshold", "overflow", "idle", "incomplete"]).optional(),
    aborted: z.boolean().optional(),
    willRetry: z.boolean().optional(),
    skipped: z.boolean().optional(),
  }),
  z.strictObject({
    kind: z.literal("retry"),
    phase: z.enum(["started", "ended"]),
    observedAt: z.number().int().nonnegative(),
    attempt: z.number().int().nonnegative(),
    maxAttempts: z.number().int().nonnegative().optional(),
    delayMs: z.number().int().nonnegative().optional(),
    success: z.boolean().optional(),
  }),
  z.strictObject({
    kind: z.literal("model-change"),
    observedAt: z.number().int().nonnegative(),
  }),
]);
export type LifecycleObservation = z.infer<typeof LifecycleObservationSchema>;
export type TurnOutcome = z.infer<typeof TurnOutcomeSchema>;
