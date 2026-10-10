import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  MessageChannelMain,
  Notification,
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
import { WindowCloseGuard } from "./window-close";

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
  const { getRuntime, initializeStorage } = services;

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
  let closeGuard: WindowCloseGuard | null = null;
  let saveForQuit: (() => void) | undefined;
  function notifyClosing(title: string, body: string): void {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  }
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
    closeGuard?.request();
  }
  function createWindow(): void {
    if (quitting) return;
    approved = false;
    const current = new BrowserWindow({
      width: 1120,
      height: 780,
      minWidth: 720,
      minHeight: 540,
      title: "d-pi",
      ...(process.platform === "darwin"
        ? {
            titleBarStyle: "hiddenInset" as const,
            // Center the native 14px buttons in the Renderer’s 44px header.
            trafficLightPosition: { x: 12, y: 15 },
          }
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
    const guard = new WindowCloseGuard({
      send: (token) => current.webContents.send("draft:close-request", token),
      approve: () => {
        if (window !== current || current.isDestroyed()) return;
        approved = true;
        if (quitting) saveForQuit?.();
        else current.close();
      },
      blocked: async (reason) => {
        if (window !== current || current.isDestroyed()) return;
        const t = currentT();
        notifyClosing(
          t(
            reason === "unsaved"
              ? "main.closeUnsaved.message"
              : "main.closeUnconfirmed.message",
          ),
          t("main.closeUnconfirmed.detail"),
        );
      },
    });
    closeGuard = guard;
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
      guard.dispose();
      closeGuard = null;
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
      if (quitting) return;
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
          if (quitting || window !== current) return;
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
      if (quitting) return;
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
      const nativeBlobSources = new Map<
        string,
        { at: number; path: Promise<string | null> }
      >();
      const projectReadContext = {
        reads,
        gitReader,
        ...ipcSourceContext,
        getStore: () => services.store,
        getDiagnostics: () => diagnostics,
        projectNativeSessionsPath: async () => null,
        indexedNativeSessionsPath: (traceId: string) =>
          services.nativeSessionIndex?.sessionsRoot(traceId) ??
          Promise.resolve(null),
        nativeSessionsPath: () =>
          join(app.getPath("userData"), "native-sessions"),
        nativeBlobsPath: async (threadId: string, traceId: string) => {
          const thread = services.store?.threads.threadContext(threadId);
          if (!thread || !services.configuration) return null;
          const at = Date.now();
          for (const [key, source] of nativeBlobSources)
            if (at - source.at >= 5000) nativeBlobSources.delete(key);
          const key = JSON.stringify([
            thread.threadId,
            thread.workingDirectoryId,
          ]);
          const cached = nativeBlobSources.get(key);
          if (cached) return cached.path;
          // Several visible thumbnails share one scoped, short-lived SDK path sample.
          const path = services.configuration
            .execute({
              kind: "snapshot",
              traceId,
              scope: {
                kind: "thread",
                threadId: thread.threadId,
                workingDirectoryId: thread.workingDirectoryId,
              },
            })
            .then((reply) =>
              reply.kind === "snapshot"
                ? (reply.nativeBlobsDirectory ?? null)
                : null,
            );
          nativeBlobSources.set(key, { at, path });
          return path;
        },
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
        onEditableReady: () => closeGuard?.markEditable(),
      });
      ipcMain.on("draft:close-result", (event, raw: unknown) => {
        if (!sourceValid(event)) return;
        const parsed = closeResult.safeParse(raw);
        if (parsed.success)
          closeGuard?.resolve(parsed.data.token, parsed.data.saved);
      });
      buildMenu();
      createWindow();
    });
    app.on("activate", () => {
      if (quitting) return;
      if (!window) createWindow();
      else window.show();
    });
    app.on("window-all-closed", () => {
      // Window lifetime is separate from Main; explicit Quit owns application shutdown.
    });
    const quitCoordinator = new QuitCoordinator(
      async () => {
        quitting = true;
        const save =
          window && !approved
            ? new Promise<void>((resolve) => {
                saveForQuit = resolve;
                requestClose();
              })
            : Promise.resolve();
        // Queue/pending evidence remains durable. Stop is requested, never
        // interpreted as confirmation that unknown work completed.
        const runtimes = [...services.runtimes.values()];
        const stopped = Promise.all(
          runtimes.map(async (runtime) => {
            if (runtime.hasActiveWork()) {
              await runtime.requestStop();
              while (runtime.hasActiveWork())
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            await runtime.closeIdle();
          }),
        );
        const results = await Promise.allSettled([
          save,
          stopped,
          services.closeThreadCommands(),
          reads.close(),
          gitReader.close(),
          services.attachments?.close(),
        ]);
        await diagnostics?.close();
        if (results.some((result) => result.status === "rejected"))
          throw Error("Shutdown cleanup unconfirmed");
      },
      (reason) => {
        try {
          if (reason !== "clean")
            notifyClosing(
              currentT()("main.quitActive.message"),
              currentT()("main.quitActive.detail"),
            );
          unsubscribeAttention?.();
          attention?.dispose();
          services.configuration?.dispose();
          if (reason === "clean") services.store?.close();
        } finally {
          app.exit(0);
        }
        // Closing Main is intentional, not an execution outcome. Managed native
        // groups observe Main death through their watchdog; lease evidence stays
        // on disk until real group death is verified during subsequent recovery.
      },
    );
    app.on("before-quit", (event) => {
      event.preventDefault();
      quitting = true;
      quitCoordinator.request();
    });
  }
}
