import type { IpcRenderer } from "electron";
import {
  type AttentionBridge,
  AttentionCommandSchema,
  AttentionReplySchema,
  AttentionSnapshotSchema,
} from "../../contracts/attention";
import { createInboundBroadcast } from "./inbound-broadcast";

class AttentionRequestError extends Error {
  constructor(
    readonly code: "invalid-reply" | "transport-unavailable",
    readonly traceId: string,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "AttentionRequestError";
  }
}

export function createAttentionBridge(
  ipc: Pick<IpcRenderer, "invoke" | "on" | "removeListener">,
): { attention: AttentionBridge } {
  const subscribe = createInboundBroadcast(
    ipc,
    "attention:state",
    AttentionSnapshotSchema,
  );
  return {
    attention: {
      async request(command) {
        const request = AttentionCommandSchema.parse(command);
        let raw: unknown;
        try {
          raw = await ipc.invoke("attention:request", request);
        } catch (cause) {
          throw new AttentionRequestError(
            "transport-unavailable",
            request.traceId,
            { cause },
          );
        }
        const parsed = AttentionReplySchema.safeParse(raw);
        if (!parsed.success)
          throw new AttentionRequestError("invalid-reply", request.traceId, {
            cause: parsed.error,
          });
        const reply = parsed.data;
        if (
          reply.traceId !== request.traceId ||
          (request.kind === "preferences" &&
            reply.kind === "snapshot" &&
            (reply.snapshot.preferences.system !== request.value.system ||
              reply.snapshot.preferences.completion !==
                request.value.completion))
        )
          throw new AttentionRequestError("invalid-reply", request.traceId);
        return reply;
      },
      subscribe,
    },
  };
}
