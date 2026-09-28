import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../shared/identity";
export const ControlStateSchema = z.object({
  pendingAsync: z.boolean(),
  admitted: z.boolean(),
  paused: z.boolean(),
  stopping: z.boolean(),
  streaming: z.boolean(),
  compacting: z.boolean(),
  queued: z.number().int().nonnegative(),
  background: z.number().int().nonnegative(),
  queue: z
    .array(
      z.object({
        kind: z.enum(["steering", "followUp"]),
        text: z.string().max(2048),
      }),
    )
    .max(64),
});
export type ControlState = z.infer<typeof ControlStateSchema>;
export const ControlCommandSchema = z.strictObject({
  kind: z.enum(["stop", "continue"]),
  threadId: ThreadIdSchema,
  traceId: TraceIdSchema,
  generation: z.uuid(),
});
export type ControlCommand = z.infer<typeof ControlCommandSchema>;
