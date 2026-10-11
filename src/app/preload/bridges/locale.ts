import type { IpcRenderer } from "electron";
import {
  LocalePreferenceSchema,
  LocaleSnapshotSchema,
} from "../../../shared/i18n/locale";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
import { LocaleSetResultSchema } from "../../contracts/desktop-bridge";
import { createInboundBroadcast } from "./inbound-broadcast";
export function createLocaleBridge(
  ipcRenderer: IpcRenderer,
): Pick<DesktopBridge, "locale"> {
  const subscribe = createInboundBroadcast(
    ipcRenderer,
    "locale:changed",
    LocaleSnapshotSchema,
  );
  return {
    locale: {
      async snapshot() {
        return LocaleSnapshotSchema.parse(
          await ipcRenderer.invoke("locale:snapshot"),
        );
      },
      subscribe,
      async setPreference(preference) {
        return LocaleSetResultSchema.parse(
          await ipcRenderer.invoke(
            "locale:set-preference",
            LocalePreferenceSchema.parse(preference),
          ),
        );
      },
    },
  };
}
