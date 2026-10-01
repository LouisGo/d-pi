import type { IpcRenderer } from "electron";
import { ConversationEventSchema } from "../../../modules/conversation/contracts/public";
import {
  RuntimeCommandSchema,
  RuntimeReplySchema,
  RuntimeViewSchema,
  SubmissionCommandSchema,
  SubmissionReplySchema,
} from "../../../modules/execution/contracts/public";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
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
    conversation: {
      connect(threadId, listener) {
        let port: MessagePort | null = null;
        const handler = (event: Electron.IpcRendererEvent, data: unknown) => {
          if (
            typeof data !== "object" ||
            data === null ||
            !("threadId" in data) ||
            data.threadId !== threadId
          )
            return;
          port?.close();
          port = event.ports[0] ?? null;
          if (!port) return;
          port.onmessage = (message) => {
            const parsed = ConversationEventSchema.safeParse(message.data);
            if (parsed.success) listener(parsed.data);
          };
          port.start();
        };
        ipcRenderer.on("runtime:port", handler);
        ipcRenderer.send("runtime:connect", threadId);
        return () => {
          ipcRenderer.removeListener("runtime:port", handler);
          port?.close();
        };
      },
    },
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
