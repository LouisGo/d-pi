import type { IpcRenderer } from "electron";
import {
  RuntimeCommandSchema,
  RuntimeReplySchema,
  RuntimeViewSchema,
  SubmissionCommandSchema,
  SubmissionReplySchema,
} from "../../../modules/execution/contracts/public";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
import { createConversationPort } from "./conversation-port";
import { createInboundBroadcast } from "./inbound-broadcast";
export function createExecutionBridge(
  ipcRenderer: IpcRenderer,
): Pick<DesktopBridge, "submission" | "conversation" | "runtime"> {
  const submission = createInboundBroadcast(
    ipcRenderer,
    "submission:state",
    SubmissionReplySchema,
    (reply) =>
      reply.kind === "receipt"
        ? [reply.receipt.threadId]
        : reply.kind === "list"
          ? reply.receipts.map((receipt) => receipt.threadId)
          : [],
  );
  const runtime = createInboundBroadcast(
    ipcRenderer,
    "runtime:state",
    RuntimeViewSchema,
    (view) => [view.threadId],
  );
  return {
    submission: {
      async request(command) {
        return SubmissionReplySchema.parse(
          await ipcRenderer.invoke(
            "submission:request",
            SubmissionCommandSchema.parse(command),
          ),
        );
      },
      subscribe: submission,
    },
    conversation: createConversationPort(ipcRenderer),
    runtime: {
      async request(command) {
        const value = RuntimeCommandSchema.parse(command);
        const reply = RuntimeReplySchema.parse(
          await ipcRenderer.invoke("runtime:request", value),
        );
        if (reply.kind === "failed") {
          if (reply.error.traceId !== value.traceId)
            throw Error("Mismatched runtime failure");
          return reply;
        }
        if (reply.view.threadId !== value.threadId)
          throw Error("Foreign runtime reply");
        return reply;
      },
      subscribe: runtime,
    },
  };
}
