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
export type KnownNativeFrame<
  T extends KnownNativeFrameType = KnownNativeFrameType,
> = NativeFrame & { type: T };

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
  return types.some((type) => type === frame.type);
}
