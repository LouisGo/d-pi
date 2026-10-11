import type { IpcRenderer } from "electron";
import {
  ConfigurationCommandSchema,
  ConfigurationEventSchema,
  ConfigurationReplySchema,
} from "../../../modules/configuration/contracts/public";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
import { createInboundBroadcast } from "./inbound-broadcast";
export function createConfigurationBridge(
  ipcRenderer: IpcRenderer,
): Pick<DesktopBridge, "configuration"> {
  const subscribe = createInboundBroadcast(
    ipcRenderer,
    "configuration:state",
    ConfigurationEventSchema,
  );
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
        const release = subscribe(listener);
        ipcRenderer.send("configuration:subscribe");
        return release;
      },
    },
  };
}
