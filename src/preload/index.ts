import { contextBridge, ipcRenderer } from "electron";
import {
  type Command,
  type DesktopBridge,
  ReplySchema,
} from "../shared/contracts";

const connectionId = crypto.randomUUID();
const bridge: DesktopBridge = {
  async request(command: Command) {
    const raw: unknown = await ipcRenderer.invoke("draft:request", {
      schemaVersion: 1,
      connectionId,
      requestId: crypto.randomUUID(),
      command,
    });
    return ReplySchema.parse(raw);
  },
  onCloseRequest(listener) {
    const handler = (_event: Electron.IpcRendererEvent, token: unknown) => {
      if (typeof token === "string") listener(token);
    };
    ipcRenderer.on("draft:close-request", handler);
    return () => ipcRenderer.removeListener("draft:close-request", handler);
  },
  onCloseCancelled(listener) {
    ipcRenderer.on("draft:close-cancelled", listener);
    return () => ipcRenderer.removeListener("draft:close-cancelled", listener);
  },
  completeClose(token, saved) {
    ipcRenderer.send("draft:close-result", { token, saved });
  },
};
contextBridge.exposeInMainWorld("desktop", bridge);
