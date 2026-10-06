import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, type BrowserWindow, dialog, nativeImage, shell } from "electron";
import { NativeConfiguration } from "../../../modules/configuration/main/public";
import { RuntimeService } from "../../../modules/execution/main/public";
import {
  type Diagnostics,
  diagnosticCode,
} from "../../../platform/main/diagnostics/public";
import type { createI18n } from "../../../shared/i18n/create-i18n";
import type { LocalePreference } from "../../../shared/i18n/locale";
import { AppStorage } from "./app-storage";
import {
  type AttachmentService,
  createAttachmentService,
} from "./attachment-service";
import { DesktopCommandService } from "./desktop-command-service";
export function createDesktopServices(context: {
  mainDirectory: string;
  getWindow: () => BrowserWindow | null;
  getDiagnostics: () => Diagnostics | undefined;
  currentT: () => ReturnType<typeof createI18n>["t"];
  applyStoredLocale: (preference: LocalePreference) => void;
}) {
  let store: AppStorage | undefined;
  let service: DesktopCommandService | undefined;
  let configuration: NativeConfiguration | undefined;
  let attachments: AttachmentService | undefined;
  const runtimes = new Map<string, RuntimeService>();
  function getRuntime(threadId: string): RuntimeService | undefined {
    if (!store) return undefined;
    try {
      store.threads.threadContext(threadId);
    } catch {
      return undefined;
    }
    let runtime = runtimes.get(threadId);
    if (!runtime) {
      runtime = new RuntimeService(
        store,
        app.isPackaged
          ? process.resourcesPath
          : join(context.mainDirectory, "../../resources"),
        app.getPath("userData"),
        process.env,
        (view) => context.getWindow()?.webContents.send("runtime:state", view),
        (reply) =>
          context.getWindow()?.webContents.send("submission:state", reply),
        (event) => context.getDiagnostics()?.record(event),
        threadId,
        (id, text) =>
          attachments
            ? attachments.store.prepare(id, text)
            : Promise.resolve({ ok: false, reason: "storage-unavailable" }),
      );
      runtimes.set(threadId, runtime);
    }
    return runtime;
  }
  function activeWork(): boolean {
    return [...runtimes.values()].some((runtime) => runtime.hasActiveWork());
  }
  let startupCauseCode: string | undefined;
  function initializeStorage(): void {
    if (service) return;
    try {
      const data = app.getPath("userData");
      mkdirSync(data, { recursive: true, mode: 0o700 });
      store = AppStorage.open(join(data, "drafts.sqlite"));
      context.applyStoredLocale(store.preferences.read().locale);
      service = new DesktopCommandService(store, async () => {
        const window = context.getWindow();
        if (!window) return null;
        const result = await dialog.showOpenDialog(window, {
          title: context.currentT()("main.chooseProject.title"),
          properties: ["openDirectory"],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      });
      configuration = new NativeConfiguration(
        app.isPackaged
          ? process.resourcesPath
          : join(context.mainDirectory, "../../resources"),
        store.threads,
        realpathSync(mkdtempSync(join(tmpdir(), "d-pi-configuration-probe-"))),
        process.env,
        (event) =>
          context.getWindow()?.webContents.send("configuration:state", event),
        (url) => shell.openExternal(url),
        (event) => context.getDiagnostics()?.record(event),
      );
      attachments = createAttachmentService(
        store,
        data,
        app.isPackaged
          ? process.resourcesPath
          : join(context.mainDirectory, "../../resources"),
        (bytes) => !nativeImage.createFromBuffer(Buffer.from(bytes)).isEmpty(),
        async () => {
          const window = context.getWindow();
          if (!window) return null;
          const result = await dialog.showOpenDialog(window, {
            properties: ["openFile", "multiSelections"],
          });
          return result.canceled ? null : result.filePaths;
        },
      );
      attachments.startMaintenance(() => {
        const diagnostics = context.getDiagnostics();
        if (!diagnostics) return;
        const traceId = randomUUID();
        diagnostics.record({
          traceId,
          requestId: traceId,
          connectionId: diagnostics.processInstanceId,
          operation: "attachments:maintenance",
          stage: "failed",
          code: "storage-unavailable",
        });
      });
      startupCauseCode = undefined;
    } catch (error) {
      startupCauseCode = diagnosticCode(error);
      // Keep the original database; a later restore may retry opening it.
    }
  }
  return {
    get attachments() {
      return attachments;
    },
    get store() {
      return store;
    },
    get commandService() {
      return service;
    },
    get configuration() {
      return configuration;
    },
    get startupCauseCode() {
      return startupCauseCode;
    },
    runtimes,
    getRuntime,
    activeWork,
    initializeStorage,
  };
}
