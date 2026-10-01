import type { IpcRenderer } from "electron";
import {
  ConfigurationCommandSchema,
  ConfigurationEventSchema,
  ConfigurationReplySchema,
} from "../../../modules/configuration/contracts/public";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
export function createConfigurationBridge(
  ipcRenderer: IpcRenderer,
): Pick<DesktopBridge, "configuration"> {
  return {
    configuration: {
      async request(command) {
        return ConfigurationReplySchema.parse(
          await ipcRenderer.invoke(
            "configuration:request",
            ConfigurationCommandSchema.parse(command),
          ),
        );
      },
      subscribe(listener) {
        const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
          const parsed = ConfigurationEventSchema.safeParse(raw);
          if (parsed.success) listener(parsed.data);
        };
        ipcRenderer.on("configuration:state", handler);
        ipcRenderer.send("configuration:subscribe");
        return () => ipcRenderer.removeListener("configuration:state", handler);
      },
    },
  };
}
