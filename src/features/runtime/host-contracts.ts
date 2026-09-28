import { z } from "zod";
import { FrozenSubmissionSchema } from "../submission/contracts";
import { DirectoryIdentitySchema } from "./admission";
export const HostStartSchema = z.strictObject({
  kind: z.literal("start"),
  threadId: z.uuid(),
  traceId: z.uuid(),
  processInstanceId: z.uuid(),
  connectionGeneration: z.uuid(),
  configContextId: z.string().min(1),
  binary: z.string().min(1),
  identity: DirectoryIdentitySchema,
  environment: z.record(z.string(), z.string()),
  sessionDirectory: z.string().min(1),
});
export type HostStart = z.infer<typeof HostStartSchema>;
export const HostCommandSchema = z.discriminatedUnion("kind", [
  HostStartSchema,
  z.strictObject({ kind: z.literal("attach") }),
  z.strictObject({
    kind: z.literal("dispatch"),
    value: FrozenSubmissionSchema,
  }),
  z.strictObject({ kind: z.literal("state") }),
  z.strictObject({ kind: z.literal("close-idle") }),
]);
export const NativeStateSchema = z.object({
  sessionId: z.string(),
  sessionFile: z.string().optional(),
  model: z
    .object({ id: z.string(), provider: z.string() })
    .nullable()
    .optional(),
  isStreaming: z.boolean(),
  isCompacting: z.boolean(),
  queuedMessageCount: z.number().int().nonnegative(),
});
export type NativeState = z.infer<typeof NativeStateSchema>;

export const NativeBindingSchema = z.strictObject({
  threadId: z.uuid(),
  configContextId: z.string().min(1),
  sessionFile: z.string().min(1),
  sessionId: z.string().min(1),
});
export type NativeBinding = z.infer<typeof NativeBindingSchema>;
