import { z } from "zod";

// Fixed OMP JSON event envelope, independent of transport framing.
export const NativeFrameSchema = z.looseObject({ type: z.string().min(1) });
export type NativeFrame = z.infer<typeof NativeFrameSchema>;

// OMP may add frame types and fields independently of the App. Keep this list
// limited to names the App currently interprets; it is not the protocol schema.
export const NativeFrameTypes = {
  rpcChunk: "rpc_chunk",
  ready: "ready",
  response: "response",
  agentStart: "agent_start",
  agentEnd: "agent_end",
  messageStart: "message_start",
  messageEnd: "message_end",
  messageUpdate: "message_update",
  toolExecutionStart: "tool_execution_start",
  toolExecutionEnd: "tool_execution_end",
  toolExecutionUpdate: "tool_execution_update",
  turnStart: "turn_start",
  turnEnd: "turn_end",
  promptResult: "prompt_result",
  availableCommandsUpdate: "available_commands_update",
  sessionInfoUpdate: "session_info_update",
  configUpdate: "config_update",
  extensionUiRequest: "extension_ui_request",
  extensionUiResponse: "extension_ui_response",
  dPiControlState: "d_pi_control_state",
  hostToolCancel: "host_tool_cancel",
  hostUriCancel: "host_uri_cancel",
  hostToolCall: "host_tool_call",
  hostUriRequest: "host_uri_request",
} as const;

export type KnownNativeFrameType =
  (typeof NativeFrameTypes)[keyof typeof NativeFrameTypes];
// Only fields consumed by the App are certified. Additional native fields stay
// intact, and a new event name is still an open envelope, never a known payload.
export const NativeResponseSchema = z.looseObject({
  type: z.literal("response"),
  id: z.string().optional(),
  command: z.string(),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});
export type NativeResponse = z.infer<typeof NativeResponseSchema>;
const message = z.looseObject({
  role: z.string(),
  content: z.unknown(),
  toolCallId: z.string().optional(),
  isError: z.boolean().optional(),
  errorMessage: z.string().optional(),
});
const nativePayloadSchemas = {
  response: NativeResponseSchema,
  agent_end: z.looseObject({
    type: z.literal("agent_end"),
    isTerminal: z.boolean().optional(),
  }),
  prompt_result: z.looseObject({
    type: z.literal("prompt_result"),
    agentInvoked: z.boolean(),
    id: z.string().optional(),
  }),
  message_start: z.looseObject({ type: z.literal("message_start"), message }),
  message_end: z.looseObject({ type: z.literal("message_end"), message }),
  message_update: z.looseObject({
    type: z.literal("message_update"),
    assistantMessageEvent: z.looseObject({ type: z.string() }),
  }),
  tool_execution_start: z.looseObject({
    type: z.literal("tool_execution_start"),
    toolCallId: z.string(),
    toolName: z.string(),
  }),
  tool_execution_end: z.looseObject({
    type: z.literal("tool_execution_end"),
    toolCallId: z.string(),
    toolName: z.string(),
    isError: z.boolean().optional(),
    result: z.unknown().optional(),
  }),
} as const;
const validators: Readonly<Partial<Record<KnownNativeFrameType, z.ZodType>>> =
  nativePayloadSchemas;
type Payload<T extends KnownNativeFrameType> =
  T extends keyof typeof nativePayloadSchemas
    ? z.infer<(typeof nativePayloadSchemas)[T]>
    : NativeFrame & { type: T };
export type KnownNativeFrame<
  T extends KnownNativeFrameType = KnownNativeFrameType,
> = {
  [K in T]: Payload<K>;
}[T];

const knownNativeFrameTypes = new Set<KnownNativeFrameType>(
  Object.values(NativeFrameTypes),
);

export function isKnownNativeFrameType(
  value: NativeFrame["type"],
): value is KnownNativeFrameType {
  return knownNativeFrameTypes.has(value as KnownNativeFrameType);
}

export function isNativeFrameType<T extends KnownNativeFrameType>(
  frame: NativeFrame,
  ...types: readonly [T, ...T[]]
): frame is KnownNativeFrame<T> {
  return types.some(
    (type) =>
      type === frame.type &&
      (validators[type]?.safeParse(frame).success ?? true),
  );
}
