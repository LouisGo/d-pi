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
export function createExecutionBridge(
  ipcRenderer: IpcRenderer,
): Pick<DesktopBridge, "submission" | "conversation" | "runtime"> {
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
      subscribe(listener) {
        const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
          const result = SubmissionReplySchema.safeParse(raw);
          if (result.success) listener(result.data);
        };
        ipcRenderer.on("submission:state", handler);
        return () => ipcRenderer.removeListener("submission:state", handler);
      },
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
      subscribe(listener) {
        const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
          const parsed = RuntimeViewSchema.safeParse(raw);
          if (parsed.success) listener(parsed.data);
        };
        ipcRenderer.on("runtime:state", handler);
        return () => ipcRenderer.removeListener("runtime:state", handler);
      },
    },
  };
}
