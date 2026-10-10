import { z } from "zod";

// OMP 18.4.6 tool args / partialResult / result are JSON, not app artifacts.
export const ToolPayloadSchema = z.strictObject({
  value: z.json(),
  truncated: z.boolean(),
});
export const ToolExecutionObservationSchema = z.strictObject({
  toolCallId: z.string().min(1).max(512),
  name: z.string().max(120),
  lifecycle: z.enum(["running", "completed", "failed"]),
  // A returned native call can still report detached background progress.
  backgroundState: z.enum(["running", "completed", "failed"]).optional(),
  observed: z.array(z.enum(["start", "update", "end", "message-end"])).max(4),
  coverage: z.enum(["observed", "partial"]),
  truncated: z.boolean(),
  arguments: ToolPayloadSchema.optional(),
  progress: ToolPayloadSchema.optional(),
  result: ToolPayloadSchema.optional(),
});
export type ToolExecutionObservation = z.infer<
  typeof ToolExecutionObservationSchema
>;
export type ToolPayload = z.infer<typeof ToolPayloadSchema>;
