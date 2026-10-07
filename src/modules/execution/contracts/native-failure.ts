import { match } from "ts-pattern";
import { z } from "zod";

// Only adapter-owned methods cross the Host/Main boundary. Unknown method
// strings are never promoted into diagnostic attributes.
export const NativeFailureOperationSchema = z.enum([
  "unknown",
  "startup",
  "write",
  "negotiate_protocol",
  "get_state",
  "d_pi_state",
  "d_pi_subagent_state",
  "d_pi_queue",
  "d_pi_subagent_config",
  "d_pi_model",
  "d_pi_stop",
  "d_pi_continue",
  "set_subagent_subscription",
  "get_subagents",
  "get_subagent_messages",
]);
const identity = {
  operation: NativeFailureOperationSchema,
  requestId: z.uuid().optional(),
};
export const NativeFailureSummarySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.enum(["spawn", "protocol", "interrupted"]),
    ...identity,
  }),
  z.strictObject({
    kind: z.literal("write"),
    ...identity,
    budget: z.literal("input-budget").optional(),
  }),
  z.strictObject({
    kind: z.literal("unavailable"),
    ...identity,
    budget: z.literal("request-limit").optional(),
  }),
  z.strictObject({
    kind: z.literal("timeout"),
    ...identity,
    timeoutMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
]);
export type NativeFailureSummary = z.infer<typeof NativeFailureSummarySchema>;
export type NativeFailureOperation = z.infer<
  typeof NativeFailureOperationSchema
>;

export function nativeFailureCode(value: NativeFailureSummary) {
  return match(value)
    .with(
      { kind: "write", budget: "input-budget" },
      () => "native-input-budget" as const,
    )
    .with(
      { kind: "unavailable", budget: "request-limit" },
      () => "native-request-limit" as const,
    )
    .with({ kind: "spawn" }, () => "native-spawn" as const)
    .with({ kind: "protocol" }, () => "native-protocol" as const)
    .with({ kind: "write" }, () => "native-write" as const)
    .with({ kind: "timeout" }, () => "native-timeout" as const)
    .with({ kind: "interrupted" }, () => "native-interrupted" as const)
    .with({ kind: "unavailable" }, () => "native-unavailable" as const)
    .exhaustive();
}
