import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MessageChannelMain,
} from "electron";
import { z } from "zod";
import { GitRequestSchema } from "../features/changes/contracts";
import { QuitCoordinator } from "../features/control/quit";
import { FileRequestSchema } from "../features/files/contracts";
import { HistoryRequestSchema } from "../features/history/contracts";
import { RuntimeCommandSchema } from "../features/runtime/contracts";
import { SubmissionCommandSchema } from "../features/submission/contracts";
import {
  BridgeDiagnosticSchema,
  EnvelopeSchema,
} from "../shared/desktop-bridge";
import { createI18n } from "../shared/i18n/create-i18n";
import {
  type LocalePreference,
  LocalePreferenceSchema,
  type LocaleSnapshot,
  resolveLocale,
} from "../shared/i18n/locale";
import { TraceIdSchema } from "../shared/identity";
import { diagnosticCode } from "./diagnostic-code";
import { Diagnostics } from "./diagnostics";
import { DraftService, failure } from "./draft-service";
import { readNativeHistory } from "./native-history";
import { listProjectFiles, readProjectFile } from "./project-files";
import { listGitChanges, readGitChange } from "./project-git";
import { RuntimeService } from "./runtime-service";
import { AppStorage } from "./storage/app-storage";

if (process.env.D_PI_DATA_DIR)
  app.setPath("userData", process.env.D_PI_DATA_DIR);
app.setName("d-pi");
const locked = app.requestSingleInstanceLock();
let window: BrowserWindow | null = null;
let store: AppStorage | undefined;
let service: DraftService | undefined;
let runtime: RuntimeService | undefined;
let startupCauseCode: string | undefined;
let localeSnapshot: LocaleSnapshot = {
  preference: "system",
  resolvedLocale: "en-US",
};
let localeInteracted = false;
function currentT() {
  return createI18n(localeSnapshot.resolvedLocale).t;
}
function buildMenu(): void {
  const t = currentT();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "d-pi",
        submenu: [
          { role: "about", label: t("main.menu.about") },
          { type: "separator" },
          { role: "quit", label: t("main.menu.quit") },
        ],
      },
      {
        label: t("main.menu.edit"),
        submenu: [
          { role: "undo", label: t("main.menu.undo") },
          { role: "redo", label: t("main.menu.redo") },
          { type: "separator" },
          { role: "cut", label: t("main.menu.cut") },
          { role: "copy", label: t("main.menu.copy") },
          { role: "paste", label: t("main.menu.paste") },
          { role: "selectAll", label: t("main.menu.selectAll") },
        ],
      },
      {
        label: t("main.menu.window"),
        submenu: [
          { role: "minimize", label: t("main.menu.minimize") },
          { role: "zoom", label: t("main.menu.zoom") },
          { role: "close", label: t("main.menu.close") },
        ],
      },
    ]),
  );
}
function applyLocale(preference: LocalePreference, announce: boolean): void {
  const systemLanguage =
    app.getPreferredSystemLanguages()[0] ?? app.getLocale();
  const next: LocaleSnapshot = {
    preference,
    resolvedLocale: resolveLocale(preference, systemLanguage),
  };
  const changed =
    next.preference !== localeSnapshot.preference ||
    next.resolvedLocale !== localeSnapshot.resolvedLocale;
  localeSnapshot = next;
  if (changed && announce) {
    buildMenu();
    window?.webContents.send("locale:changed", next);
  }
}
function initializeStorage(): void {
  if (service) return;
  try {
    const data = app.getPath("userData");
    mkdirSync(data, { recursive: true, mode: 0o700 });
    store = new AppStorage(join(data, "drafts.sqlite"));
    if (!localeInteracted)
      applyLocale(store.preferences.read().locale, window !== null);
    service = new DraftService(store, async () => {
      if (!window) return null;
      const result = await dialog.showOpenDialog(window, {
        title: currentT()("main.chooseProject.title"),
        properties: ["openDirectory"],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    });
    runtime = new RuntimeService(
      store,
      app.isPackaged
        ? process.resourcesPath
        : join(import.meta.dirname, "../../resources"),
      data,
      process.env,
      (view) => window?.webContents.send("runtime:state", view),
      (reply) => window?.webContents.send("submission:state", reply),
      (event) => diagnostics?.record(event),
    );
    startupCauseCode = undefined;
  } catch (error) {
    startupCauseCode = diagnosticCode(error);
    // Keep the original database; a later restore may retry opening it.
  }
}
let diagnostics: Diagnostics | undefined;
let loggingNoticeShown = false;
function reportLoggingFailure(): void {
  if (!window || loggingNoticeShown) return;
  loggingNoticeShown = true;
  const t = currentT();
  void dialog
    .showMessageBox(window, {
      type: "warning",
      message: t("main.loggingFailure.message"),
      detail: t("main.loggingFailure.detail"),
      buttons: [t("main.loggingFailure.acknowledge")],
    })
    .catch(() => {
      /* The window may have closed while reporting. */
    });
}
let quitting = false;
let approved = false;
let closing: { token: string; timer: ReturnType<typeof setTimeout> } | null =
  null;
const closeResult = z.strictObject({ token: z.uuid(), saved: z.boolean() });
const traceContext = z.object({
  command: z.object({ traceId: TraceIdSchema }),
});
function sourceValid(
  event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
): boolean {
  return (
    !!window &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame
  );
}
function requestClose(): void {
  if (!window || closing) return;
  const token = randomUUID();
  const timer = setTimeout(() => {
    closing = null;
    quitting = false;
    window?.webContents.send("draft:close-cancelled");
    if (window) {
      const t = currentT();
      void dialog.showMessageBox(window, {
        type: "warning",
        message: t("main.closeUnconfirmed.message"),
        detail: t("main.closeUnconfirmed.detail"),
        buttons: [t("main.closeUnconfirmed.keepWindow")],
      });
    }
  }, 5000);
  closing = { token, timer };
  window.webContents.send("draft:close-request", token);
}
function createWindow(): void {
  approved = false;
  const current = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 720,
    minHeight: 540,
    title: "d-pi",
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window = current;
  current.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  current.webContents.on("will-navigate", (event) => event.preventDefault());
  current.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  current.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  current.once("ready-to-show", () => {
    current.show();
    if (diagnostics?.degraded) reportLoggingFailure();
  });
  current.on("close", (event) => {
    if (!approved) {
      event.preventDefault();
      requestClose();
    }
  });
  current.on("closed", () => {
    window = null;
    approved = false;
    if (closing) clearTimeout(closing.timer);
    closing = null;
  });
  current.webContents.on("render-process-gone", (_event, details) => {
    diagnostics?.record({
      traceId: randomUUID(),
      requestId: randomUUID(),
      connectionId: randomUUID(),
      operation: "window",
      stage: "renderer-gone",
      code: details.reason,
    });
    // Confirmed drafts survive; do not misrepresent recovery of the lost in-memory tail.
    const t = currentT();
    void dialog
      .showMessageBox(current, {
        type: "error",
        message: t("main.rendererGone.message"),
        detail: t("main.rendererGone.detail"),
        buttons: [t("main.rendererGone.reopen")],
      })
      .then(() => {
        approved = true;
        current.destroy();
        createWindow();
      });
  });
  if (process.env.ELECTRON_RENDERER_URL)
    void current.loadURL(process.env.ELECTRON_RENDERER_URL);
  else
    void current.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}
if (!locked) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      window.show();
      window.focus();
    } else createWindow();
  });
  app.whenReady().then(() => {
    const data = app.getPath("userData");
    diagnostics = new Diagnostics(join(data, "logs"), reportLoggingFailure);
    applyLocale("system", false);
    initializeStorage();
    ipcMain.handle("locale:snapshot", (event) => {
      if (!sourceValid(event)) throw Error("Invalid locale source");
      return localeSnapshot;
    });
    ipcMain.handle("locale:set-preference", async (event, raw: unknown) => {
      if (!sourceValid(event)) throw Error("Invalid locale source");
      const preference = LocalePreferenceSchema.parse(raw);
      const traceId = randomUUID();
      const context = {
        traceId,
        requestId: traceId,
        connectionId: diagnostics?.processInstanceId ?? randomUUID(),
        operation: "locale:set-preference",
      };
      diagnostics?.record({ ...context, stage: "received" });
      localeInteracted = true;
      applyLocale(preference, true);
      let persisted = false;
      try {
        if (!store) initializeStorage();
        if (!store) throw Error("Locale storage unavailable");
        store.preferences.saveLocale(preference);
        persisted = true;
        diagnostics?.record({ ...context, stage: "completed" });
      } catch (error) {
        const causeCode = diagnosticCode(error);
        diagnostics?.record({
          ...context,
          stage: "failed",
          code: "locale-save-failed",
          ...(causeCode ? { causeCode } : {}),
        });
      }
      return { ...localeSnapshot, persisted };
    });
    ipcMain.on("draft:diagnostic", (event, raw: unknown) => {
      if (!sourceValid(event)) return;
      const parsed = BridgeDiagnosticSchema.safeParse(raw);
      if (parsed.success) {
        const { code, ...context } = parsed.data;
        diagnostics?.record({
          ...context,
          observedAt: "preload",
          ...(code ? { code } : {}),
        });
      }
    });
    ipcMain.on("runtime:connect", (event, raw: unknown) => {
      if (!sourceValid(event) || !runtime) return;
      const parsed = z.uuid().safeParse(raw);
      if (
        !parsed.success ||
        store?.threads.activeThread()?.threadId !== parsed.data
      )
        return;
      const { port1, port2 } = new MessageChannelMain();
      runtime.attach(port1);
      event.senderFrame?.postMessage(
        "runtime:port",
        { threadId: parsed.data },
        [port2],
      );
    });
    ipcMain.handle("history:read", async (event, raw: unknown) => {
      if (!sourceValid(event) || !store) throw Error("Invalid history source");
      const { threadId, cursor } = HistoryRequestSchema.parse(raw);
      if (store.threads.activeThread()?.threadId !== threadId)
        throw Error("Foreign Thread");
      const binding = store.threads.nativeSession(threadId);
      return binding
        ? readNativeHistory(
            join(app.getPath("userData"), "native-sessions"),
            binding,
            cursor,
          )
        : { kind: "unavailable", reason: "missing" };
    });
    ipcMain.handle("files:request", async (event, raw: unknown) => {
      if (!sourceValid(event) || !store) throw Error("Invalid file source");
      const command = FileRequestSchema.parse(raw);
      const thread = store.threads.activeThread();
      if (!thread || thread.threadId !== command.threadId)
        throw Error("Foreign Thread");
      const context = {
        traceId: command.traceId,
        requestId: randomUUID(),
        connectionId: diagnostics?.processInstanceId ?? randomUUID(),
        operation: `files:${command.kind}`,
      };
      diagnostics?.record({ ...context, stage: "received" });
      const reply =
        command.kind === "list"
          ? await listProjectFiles(thread.directory, command.path)
          : await readProjectFile(thread.directory, command.path);
      diagnostics?.record({
        ...context,
        stage: reply.kind === "unavailable" ? "failed" : "completed",
        ...(reply.kind === "unavailable" ? { code: reply.reason } : {}),
      });
      return reply;
    });
    ipcMain.handle("git:request", async (event, raw: unknown) => {
      if (!sourceValid(event) || !store) throw Error("Invalid Git source");
      const command = GitRequestSchema.parse(raw);
      const thread = store.threads.activeThread();
      if (!thread || thread.threadId !== command.threadId)
        throw Error("Foreign Thread");
      const context = {
        traceId: command.traceId,
        requestId: randomUUID(),
        connectionId: diagnostics?.processInstanceId ?? randomUUID(),
        operation: `git:${command.kind}`,
      };
      diagnostics?.record({ ...context, stage: "received" });
      const reply =
        command.kind === "list"
          ? await listGitChanges(thread.directory)
          : await readGitChange(thread.directory, command.scope, command.path);
      diagnostics?.record({
        ...context,
        stage: reply.kind === "unavailable" ? "failed" : "completed",
        ...(reply.kind === "unavailable" ? { code: reply.reason } : {}),
      });
      return reply;
    });
    ipcMain.handle("submission:request", async (event, raw: unknown) => {
      if (!sourceValid(event) || !runtime)
        throw Error("Invalid submission source");
      return runtime.submit(SubmissionCommandSchema.parse(raw));
    });
    ipcMain.handle("runtime:request", async (event, raw: unknown) => {
      if (!sourceValid(event))
        throw new Error("Invalid runtime request source");
      const command = RuntimeCommandSchema.parse(raw);
      if (command.kind === "inspect") initializeStorage();
      if (!runtime) throw new Error("Runtime storage unavailable");
      const context = {
        traceId: command.traceId,
        requestId: randomUUID(),
        connectionId: diagnostics?.processInstanceId ?? randomUUID(),
        operation: `runtime:${command.kind}`,
      };
      diagnostics?.record({ ...context, stage: "received" });
      try {
        const view = await runtime.execute(command);
        diagnostics?.record({
          ...context,
          stage:
            view.phase === "failed" || view.phase === "interrupted"
              ? "failed"
              : command.kind === "stop" ||
                  command.kind === "continue" ||
                  command.kind === "answer"
                ? "dispatching"
                : "completed",
        });
        return view;
      } catch {
        diagnostics?.record({
          ...context,
          stage: "failed",
          code: "runtime-unavailable",
        });
        throw new Error("Runtime operation unavailable");
      }
    });
    ipcMain.handle("draft:request", async (event, raw: unknown) => {
      const fallbackTrace = randomUUID();
      if (!sourceValid(event))
        return failure(fallbackTrace, "invalid-request", "draft.invalidSource");
      // Validate shape and bound body before passing it to the domain service.
      const parsed = EnvelopeSchema.safeParse(raw);
      if (!parsed.success) {
        const identity = traceContext.safeParse(raw);
        const oversized = parsed.error.issues.some(
          (issue) =>
            issue.code === "custom" && issue.path.join(".") === "command.text",
        );
        return failure(
          identity.success ? identity.data.command.traceId : fallbackTrace,
          oversized ? "content-too-large" : "invalid-request",
          oversized ? "draft.contentTooLarge" : "draft.invalidRequest",
        );
      }
      const { command, connectionId, requestId } = parsed.data;
      const context = {
        traceId: command.traceId,
        requestId,
        connectionId,
        operation: command.kind,
      };
      diagnostics?.record({ ...context, stage: "received" });
      const started = performance.now();
      // Initial restore and the explicit "重新检查" action share this path.
      // Other commands must not reopen storage or retry an uncertain write.
      if (command.kind === "restore") initializeStorage();
      const reply = service
        ? await service.execute(command)
        : failure(
            command.traceId,
            "storage-unavailable",
            "draft.storageOpenFailed",
            startupCauseCode,
          );
      if (reply.kind === "failed")
        diagnostics?.record({
          ...context,
          stage: "failed",
          durationMs: performance.now() - started,
          errorId: reply.error.errorId,
          code: reply.error.code,
          ...(reply.error.causeCode
            ? { causeCode: reply.error.causeCode }
            : {}),
        });
      else
        diagnostics?.record({
          ...context,
          stage: "completed",
          durationMs: performance.now() - started,
        });
      return reply;
    });
    ipcMain.on("draft:close-result", (event, raw: unknown) => {
      if (!sourceValid(event)) return;
      const parsed = closeResult.safeParse(raw);
      if (!parsed.success || parsed.data.token !== closing?.token) return;
      clearTimeout(closing.timer);
      closing = null;
      if (!parsed.data.saved) {
        quitting = false;
        window?.webContents.send("draft:close-cancelled");
        if (window) {
          const t = currentT();
          void dialog.showMessageBox(window, {
            type: "warning",
            message: t("main.closeUnsaved.message"),
            detail: t("main.closeUnsaved.detail"),
            buttons: [t("main.closeUnsaved.continueEditing")],
          });
        }
        return;
      }
      approved = true;
      if (quitting) app.quit();
      else window?.close();
    });
    buildMenu();
    createWindow();
  });
  app.on("activate", () => {
    if (!window) createWindow();
    else window.show();
  });
  app.on("window-all-closed", () => {
    // Window lifetime is separate from Main; explicit Quit owns application shutdown.
  });
  const quitCoordinator = new QuitCoordinator(
    () => runtime?.hasActiveWork() ?? false,
    async () => {
      await runtime?.requestStop();
    },
    () => app.quit(),
  );
  let quitDialogOpen = false;
  app.on("before-quit", (event) => {
    if (runtime?.hasActiveWork()) {
      event.preventDefault();
      quitting = false;
      if (!window) createWindow();
      else window.show();
      if (window && !quitDialogOpen) {
        quitDialogOpen = true;
        const t = currentT();
        void dialog
          .showMessageBox(window, {
            type: "warning",
            message: t("main.quitActive.message"),
            detail: t("main.quitActive.detail"),
            buttons: [
              t("main.quitActive.wait"),
              t("main.quitActive.stop"),
              t("main.quitActive.cancel"),
            ],
            cancelId: 2,
            defaultId: 2,
          })
          .then(({ response }) => {
            quitCoordinator.request(
              response === 0 ? "wait" : response === 1 ? "stop" : "cancel",
            );
          })
          .finally(() => {
            quitDialogOpen = false;
          });
      }
      return;
    }
    if (window && !approved) {
      event.preventDefault();
      quitting = true;
      requestClose();
    }
  });
  let drained = false;
  app.on("will-quit", (event) => {
    if (drained) return;
    quitCoordinator.dispose();
    event.preventDefault();
    void (async () => {
      await runtime?.closeIdle();
      await diagnostics?.close();
    })()
      .then(() => {
        drained = true;
        store?.close();
        // Let Electron unwind the prevented will-quit event before retrying Quit.
        setImmediate(() => app.quit());
      })
      .catch(() => {
        quitting = false;
        approved = false;
        if (!window) createWindow();
        window?.webContents.send("draft:close-cancelled");
      });
  });
}
