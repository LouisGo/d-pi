import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  MessageChannelMain,
} from "electron";
import { z } from "zod";
import { createProjectGitReader } from "../../../modules/changes/main/public";
import { RuntimeFailureSchema } from "../../../modules/execution/contracts/public";
import {
  Diagnostics,
  diagnosticCode,
  readDiagnosticSnapshot,
} from "../../../platform/main/diagnostics/public";
import { RuntimeResourceError } from "../../../platform/omp/resources/public";
import { createI18n } from "../../../shared/i18n/create-i18n";
import {
  type LocalePreference,
  type LocaleSnapshot,
  resolveLocale,
} from "../../../shared/i18n/locale";
import { ThreadIdSchema } from "../../../shared/identity";
import { uiMessage } from "../../../shared/messages/contracts";
import { registerAttachmentIpc } from "../ipc/attachments";
import { registerAttentionIpc } from "../ipc/attention";
import { registerConfigurationIpc } from "../ipc/configuration";
import { registerDiagnosticIpc } from "../ipc/diagnostics";
import { registerDraftIpc } from "../ipc/draft";
import {
  registerRuntimeConnectionIpc,
  registerRuntimeRequestIpc,
  registerSubmissionIpc,
} from "../ipc/execution";

import { registerLocaleIpc } from "../ipc/locale";
import {
  ProjectReadOperations,
  registerFilesIpc,
  registerGitIpc,
  registerHistoryIpc,
} from "../ipc/project-reads";
import { createDesktopServices } from "../wiring/desktop-services";
import { ThreadAttention } from "../wiring/thread-attention";
import { prepareDevelopmentTools } from "./development-tools";
import { buildApplicationMenu } from "./menu";
import { QuitCoordinator } from "./quit";
import { ElectronSystemNotifications } from "./system-notifications";
import { loadWindowRenderer, secureWindow } from "./window";

export function startDesktopApplication(mainDirectory: string): void {
  if (process.env.D_PI_DATA_DIR)
    app.setPath("userData", process.env.D_PI_DATA_DIR);
  app.setName("d-pi");
  const locked = app.requestSingleInstanceLock();
  let window: BrowserWindow | null = null;
  let sourceGeneration = 0;
  const reads = new ProjectReadOperations();
  const gitReader = createProjectGitReader();
  let localeSnapshot: LocaleSnapshot = {
    preference: "system",
    resolvedLocale: "en-US",
  };
  let localeInteracted = false;
  function currentT() {
    return createI18n(localeSnapshot.resolvedLocale).t;
  }
  function buildMenu(): void {
    buildApplicationMenu(currentT());
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
  let diagnostics: Diagnostics | undefined;
  let attention: ThreadAttention | undefined;
  let attentionStore: typeof services.store;
  let unsubscribeAttention: (() => void) | undefined;
  const services = createDesktopServices({
    mainDirectory,
    getWindow: () => window,
    getDiagnostics: () => diagnostics,
    currentT,
    onRuntimeView: (view) => attention?.observeRuntime(view),
    onSubmissionReceipt: (receipt) => attention?.observeReceipt(receipt),
    applyStoredLocale: (preference) => {
      if (!localeInteracted) applyLocale(preference, window !== null);
    },
  });
  const { getRuntime, activeWork, initializeStorage } = services;

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
  function runtimeFailure(
    traceId: string,
    error: unknown,
  ): ReturnType<typeof RuntimeFailureSchema.parse> {
    const resource = error instanceof RuntimeResourceError;
    return RuntimeFailureSchema.parse({
      traceId,
      code: resource
        ? error.code
        : (diagnosticCode(error) ?? "runtime-unavailable"),
      category: resource ? "resource" : "unknown",
      message: resource
        ? uiMessage("runtime.sdkResourcesUnavailable")
        : uiMessage("runtime.connectionUnknown"),
    });
  }
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
      ...(process.platform === "darwin"
        ? { titleBarStyle: "hiddenInset" as const }
        : {}),
      show: false,
      webPreferences: {
        preload: join(mainDirectory, "../preload/index.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    window = current;
    const senderId = current.webContents.id;
    sourceGeneration++;
    current.webContents.on(
      "did-start-navigation",
      (_event, _url, _inPlace, isMainFrame) => {
        if (isMainFrame) {
          sourceGeneration++;
          reads.releaseSender(senderId);
          attention?.clearVisible();
        }
      },
    );
    secureWindow(current);
    current.on("focus", () => attention?.setForeground(true));
    current.on("blur", () => attention?.setForeground(false));
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
      reads.releaseSender(senderId);
      attention?.clearVisible();
      attention?.setForeground(false);
      window = null;
      approved = false;
      if (closing) clearTimeout(closing.timer);
      closing = null;
    });
    current.webContents.on("render-process-gone", (_event, details) => {
      reads.releaseSender(senderId);
      attention?.clearVisible();
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
    loadWindowRenderer(
      current,
      mainDirectory,
      () => window,
      () => diagnostics,
    );
  }
  if (!locked) app.quit();
  else {
    app.on("second-instance", () => {
      if (window) {
        window.show();
        window.focus();
      } else createWindow();
    });
    app.whenReady().then(async () => {
      // Extensions must attach before the first renderer loads React.
      await prepareDevelopmentTools();
      const data = app.getPath("userData");
      diagnostics = new Diagnostics(join(data, "logs"), reportLoggingFailure);
      applyLocale("system", false);
      initializeStorage();
      attentionStore = services.store;
      attention = new ThreadAttention({
        getActiveThread: () =>
          services.store?.threads.activeThread()?.threadId ?? null,
        readPreferences: () => {
          if (!services.store) throw Error("storage-unavailable");
          return services.store.preferences.readNotifications();
        },
        savePreferences: (value) => {
          if (!services.store) throw Error("storage-unavailable");
          return services.store.preferences.saveNotifications(value);
        },
        systemNotifications: new ElectronSystemNotifications(),
        getText: (kind, thread) => {
          const names = {
            "needs-answer": "needsAnswer",
            failed: "failed",
            completed: "completed",
            interrupted: "interrupted",
          } as const;
          const name = names[kind];
          return {
            title: currentT()(`attention.native.${name}.title`),
            body: currentT()(`attention.native.${name}.body`, { thread }),
          };
        },
        openWindow: () => {
          if (!window) createWindow();
          if (window?.isMinimized()) window.restore();
          window?.show();
          window?.focus();
        },
        onFailure: (entry) =>
          diagnostics?.record({
            traceId: entry.traceId,
            requestId: entry.eventId,
            threadId: entry.threadId,
            connectionId: diagnostics.processInstanceId,
            operation: "attention:notification",
            stage: "failed",
            code: "notification-unavailable",
          }),
      });
      unsubscribeAttention = attention.subscribe((snapshot) => {
        if (window && !window.webContents.isDestroyed())
          window.webContents.send("attention:state", snapshot);
      });
      const ipcSourceContext = { ipcMain, sourceValid };
      registerAttentionIpc({
        ...ipcSourceContext,
        getSourceGeneration: () => sourceGeneration,
        getAttention: () => {
          initializeStorage();
          if (attentionStore !== services.store) {
            attentionStore = services.store;
            attention?.reloadPreferences();
          }
          return attention;
        },
        isKnownThread: (id) => {
          try {
            return !!services.store?.threads.threadContext(id);
          } catch {
            return false;
          }
        },
        getActiveThread: () => {
          try {
            return ThreadIdSchema.parse(
              services.store?.threads.activeThread()?.threadId,
            );
          } catch {
            return null;
          }
        },
        getWriterId: () => diagnostics?.processInstanceId ?? "unavailable",
        record: (event) => diagnostics?.record(event),
      });
      registerDiagnosticIpc({
        ...ipcSourceContext,
        getSourceGeneration: () => sourceGeneration,
        getWriterId: () => diagnostics?.processInstanceId ?? "unavailable",
        read: (filter) =>
          readDiagnosticSnapshot(
            join(data, "logs"),
            filter,
            diagnostics?.health() ?? { degraded: true, dropped: 0 },
          ),
        record: (event) => diagnostics?.record(event),
        chooseDestination: async () => {
          const owner = window;
          if (!owner) return null;
          const result = await dialog.showSaveDialog(owner, {
            title: currentT()("main.diagnostics.export"),
            defaultPath: `d-pi-diagnostics-${Date.now()}.json`,
            filters: [
              {
                name: currentT()("main.diagnostics.report"),
                extensions: ["json"],
              },
            ],
          });
          return result.canceled ? null : (result.filePath ?? null);
        },
      });
      registerLocaleIpc({
        ...ipcSourceContext,
        getSnapshot: () => localeSnapshot,
        applyLocale,
        markInteraction: () => {
          localeInteracted = true;
        },
        getStore: () => services.store,
        initializeStorage,
        getDiagnostics: () => diagnostics,
      });
      registerConfigurationIpc({
        ...ipcSourceContext,
        getConfiguration: () => services.configuration,
        initializeStorage,
        getDiagnostics: () => diagnostics,
      });

      registerRuntimeConnectionIpc({
        ...ipcSourceContext,
        getRuntime,
        getStore: () => services.store,
        createMessageChannel: () => new MessageChannelMain(),
      });
      const projectReadContext = {
        reads,
        gitReader,
        ...ipcSourceContext,
        getStore: () => services.store,
        getDiagnostics: () => diagnostics,
        projectNativeSessionsPath: async () => null,
        nativeSessionsPath: () =>
          join(app.getPath("userData"), "native-sessions"),
      };
      registerHistoryIpc({
        ...projectReadContext,
        projectNativeSessionsPath: async (threadId, traceId) => {
          const thread = services.store?.threads.threadContext(threadId);
          if (!thread || !services.configuration) return null;
          const reply = await services.configuration.execute({
            kind: "snapshot",
            traceId,
            scope: {
              kind: "thread",
              threadId: thread.threadId,
              workingDirectoryId: thread.workingDirectoryId,
            },
          });
          return reply.kind === "snapshot" && reply.source
            ? join(reply.source.directory, "sessions")
            : null;
        },
      });
      registerAttachmentIpc({
        ...ipcSourceContext,
        getService: () => services.attachments,
        getDiagnostics: () => diagnostics,
      });
      registerFilesIpc(projectReadContext);
      registerGitIpc(projectReadContext);
      registerSubmissionIpc({
        ...ipcSourceContext,
        getRuntime,
      });
      registerRuntimeRequestIpc({
        ...ipcSourceContext,
        getRuntime,
        initializeStorage,
        getDiagnostics: () => diagnostics,
        runtimeFailure,
      });
      registerDraftIpc({
        ...ipcSourceContext,
        getService: () => services.commandService,
        getStartupCauseCode: () => services.startupCauseCode,
        initializeStorage,
        getDiagnostics: () => diagnostics,
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
      () => activeWork(),
      async () => {
        await Promise.all(
          [...services.runtimes.values()]
            .filter((runtime) => runtime.hasActiveWork())
            .map((runtime) => runtime.requestStop()),
        );
      },
      () => app.quit(),
    );
    let quitDialogOpen = false;
    app.on("before-quit", (event) => {
      if (activeWork()) {
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
        await Promise.all(
          [...services.runtimes.values()].map((runtime) => runtime.closeIdle()),
        );
        await Promise.all([reads.close(), gitReader.close()]);
        await services.attachments?.close();
        await diagnostics?.close();
      })()
        .then(() => {
          drained = true;
          unsubscribeAttention?.();
          attention?.dispose();
          services.configuration?.dispose();
          services.store?.close();
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
}
