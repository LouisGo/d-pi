import type { IpcRenderer } from "electron";
import {
  type AttachmentBridge,
  AttachmentReplySchema,
  AttachmentRequestSchema,
} from "../../contracts/attachments";
export function createAttachmentBridge(
  ipcRenderer: Pick<IpcRenderer, "invoke">,
): { attachments: AttachmentBridge } {
  return {
    attachments: {
      async request(command) {
        const request = AttachmentRequestSchema.parse(command);
        const reply = AttachmentReplySchema.parse(
          await ipcRenderer.invoke("attachments:request", request),
        );
        if (
          (reply.kind === "attachments" ||
            reply.kind === "clipboard-imported") &&
          reply.items.some((item) => item.threadId !== request.threadId)
        )
          throw Error("Foreign attachment reply");
        return reply;
      },
    },
  };
}
