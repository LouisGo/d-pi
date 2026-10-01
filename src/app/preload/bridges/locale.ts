import type { IpcRenderer } from "electron";
import {
  LocalePreferenceSchema,
  LocaleSnapshotSchema,
} from "../../../shared/i18n/locale";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
import { LocaleSetResultSchema } from "../../contracts/desktop-bridge";
export function createLocaleBridge(
  ipcRenderer: IpcRenderer,
): Pick<DesktopBridge, "locale"> {
  return {
    locale: {
      async snapshot() {
        return LocaleSnapshotSchema.parse(
          await ipcRenderer.invoke("locale:snapshot"),
        );
      },
      subscribe(listener) {
        const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
          const parsed = LocaleSnapshotSchema.safeParse(raw);
          if (parsed.success) listener(parsed.data);
        };
        ipcRenderer.on("locale:changed", handler);
        return () => ipcRenderer.removeListener("locale:changed", handler);
      },
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
