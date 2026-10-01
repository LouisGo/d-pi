import type { IpcRenderer } from "electron";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
import {
  type BridgeDiagnostic,
  type Command,
  DesktopRequestError,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
export function createDraftBridge(
  ipcRenderer: IpcRenderer,
): Pick<
  DesktopBridge,
  "request" | "onCloseRequest" | "onCloseCancelled" | "completeClose"
> {
  const connectionId = crypto.randomUUID();
  function report(event: BridgeDiagnostic): void {
    try {
      ipcRenderer.send("draft:diagnostic", event);
    } catch {
      /* Diagnostics cannot change the operation result. */
    }
  }
  return {
    async request<C extends Command>(command: C) {
      const requestId = crypto.randomUUID();
      const context = {
        connectionId,
        requestId,
        traceId: command.traceId,
        operation: command.kind,
      };
      report({ ...context, stage: "initiated" });
      let raw: unknown;
      try {
        raw = await ipcRenderer.invoke("draft:request", {
          schemaVersion: 1,
          connectionId,
          requestId,
          command,
        });
      } catch (cause) {
        report({
          ...context,
          stage: "acknowledgement-failed",
          code: "transport-unavailable",
        });
        throw new DesktopRequestError(
          "transport-unavailable",
          command.traceId,
          {
            cause,
          },
        );
      }
      try {
        const reply = parseDesktopReply(command, raw);
        report({ ...context, stage: "confirmed" });
        return reply;
      } catch (error) {
        report({
          ...context,
          stage: "acknowledgement-failed",
          code: "invalid-reply",
        });
        throw error;
      }
    },
    onCloseRequest(listener) {
      const handler = (_event: Electron.IpcRendererEvent, token: unknown) => {
        if (typeof token === "string") listener(token);
      };
      ipcRenderer.on("draft:close-request", handler);
      return () => ipcRenderer.removeListener("draft:close-request", handler);
    },
    onCloseCancelled(listener) {
      const handler = () => listener();
      ipcRenderer.on("draft:close-cancelled", handler);
      return () => ipcRenderer.removeListener("draft:close-cancelled", handler);
    },
    completeClose(token, saved) {
      ipcRenderer.send("draft:close-result", { token, saved });
    },
  };
}
