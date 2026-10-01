import { randomUUID } from "node:crypto";
import type { Diagnostics } from "../../../platform/main/diagnostics/public";
import { diagnosticCode } from "../../../platform/main/diagnostics/public";
import {
  type LocalePreference,
  LocalePreferenceSchema,
  type LocaleSnapshot,
} from "../../../shared/i18n/locale";
import type { AppStorage } from "../wiring/app-storage";
import type { IpcSourceContext } from "./context";
export function registerLocaleIpc(
  dependencies: IpcSourceContext & {
    getDiagnostics: () => Diagnostics | undefined;
    initializeStorage: () => void;
    getSnapshot: () => LocaleSnapshot;
    applyLocale: (preference: LocalePreference, announce: boolean) => void;
    markInteraction: () => void;
    getStore: () => AppStorage | undefined;
  },
): void {
  dependencies.ipcMain.handle("locale:snapshot", (event) => {
    if (!dependencies.sourceValid(event)) throw Error("Invalid locale source");
    return dependencies.getSnapshot();
  });
  dependencies.ipcMain.handle(
    "locale:set-preference",
    async (event, raw: unknown) => {
      if (!dependencies.sourceValid(event))
        throw Error("Invalid locale source");
      const preference = LocalePreferenceSchema.parse(raw);
      const traceId = randomUUID();
      const context = {
        traceId,
        requestId: traceId,
        connectionId:
          dependencies.getDiagnostics()?.processInstanceId ?? randomUUID(),
        operation: "locale:set-preference",
      };
      dependencies.getDiagnostics()?.record({ ...context, stage: "received" });
      dependencies.markInteraction();
      dependencies.applyLocale(preference, true);
      let persisted = false;
      try {
        if (!dependencies.getStore()) dependencies.initializeStorage();
        const store = dependencies.getStore();
        if (!store) throw Error("Locale storage unavailable");
        store.preferences.saveLocale(preference);
        persisted = true;
        dependencies
          .getDiagnostics()
          ?.record({ ...context, stage: "completed" });
      } catch (error) {
        const causeCode = diagnosticCode(error);
        dependencies.getDiagnostics()?.record({
          ...context,
          stage: "failed",
          code: "locale-save-failed",
          ...(causeCode ? { causeCode } : {}),
        });
      }
      return { ...dependencies.getSnapshot(), persisted };
    },
  );
}
