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
import { HistoryRequestSchema } from "../features/history/contracts";
import { RuntimeCommandSchema } from "../features/runtime/contracts";
import { SubmissionCommandSchema } from "../features/submission/contracts";
import {
  BridgeDiagnosticSchema,
  EnvelopeSchema,
  TraceIdSchema,
} from "../shared/contracts";
import { diagnosticCode } from "./diagnostic-code";
import { Diagnostics } from "./diagnostics";
import { DraftService, failure } from "./draft-service";
import { readNativeHistory } from "./native-history";
import { RuntimeService } from "./runtime-service";
import { DraftStorage } from "./storage";

if (process.env.D_PI_DATA_DIR)
  app.setPath("userData", process.env.D_PI_DATA_DIR);
app.setName("d-pi");
const locked = app.requestSingleInstanceLock();
let window: BrowserWindow | null = null;
let store: DraftStorage | undefined;
let service: DraftService | undefined;
let runtime: RuntimeService | undefined;
let startupCauseCode: string | undefined;
function initializeStorage(): void {
  if (service) return;
  try {
    const data = app.getPath("userData");
    mkdirSync(data, { recursive: true, mode: 0o700 });
    store = new DraftStorage(join(data, "drafts.sqlite"));
    service = new DraftService(store, async () => {
      if (!window) return null;
      const result = await dialog.showOpenDialog(window, {
        title: "选择项目并创建草稿",
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
  void dialog
    .showMessageBox(window, {
      type: "warning",
      message: "诊断日志暂时无法写入",
      detail:
        "排查记录可能不完整。草稿是否保存仍以编辑区的保存状态为准。请检查应用数据目录的可写性。",
      buttons: ["知道了"],
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
    if (window)
      void dialog.showMessageBox(window, {
        type: "warning",
        message: "未能确认草稿已保存",
        detail: "窗口保持打开。请检查当前输入与保存状态，再尝试关闭。",
        buttons: ["保留窗口"],
      });
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
    void dialog
      .showMessageBox(current, {
        type: "error",
        message: "输入窗口已中断",
        detail: "重新打开会恢复最后已确认保存的草稿；未保存的输入可能丢失。",
        buttons: ["重新打开"],
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
      if (!parsed.success || store?.active()?.threadId !== parsed.data) return;
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
      if (store.active()?.threadId !== threadId) throw Error("Foreign Thread");
      const binding = store.nativeSession(threadId);
      return binding
        ? readNativeHistory(
            join(app.getPath("userData"), "native-sessions"),
            binding,
            cursor,
          )
        : { kind: "unavailable", reason: "missing" };
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
        return failure(fallbackTrace, "invalid-request", "请求来源无效。");
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
          oversized
            ? "正文超过 UTF-8 4 MiB，输入未被截断，请缩减后保存。"
            : "请求格式不受支持，输入未被截断。",
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
            "本地数据库无法打开。未重置数据，请检查日志与数据库备份。",
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
        if (window)
          void dialog.showMessageBox(window, {
            type: "warning",
            message: "草稿尚未保存，窗口已保留",
            detail: "请先确认输入法候选，或处理界面中的保存失败后再关闭。",
            buttons: ["继续编辑"],
          });
        return;
      }
      approved = true;
      if (quitting) app.quit();
      else window?.close();
    });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "d-pi",
          submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
        },
        {
          label: "编辑",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" },
          ],
        },
        {
          label: "窗口",
          submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
        },
      ]),
    );
    createWindow();
  });
  app.on("activate", () => {
    if (!window) createWindow();
    else window.show();
  });
  app.on("window-all-closed", () => {
    // Window lifetime is separate from Main; explicit Quit owns application shutdown.
  });
  app.on("before-quit", (event) => {
    if (runtime?.hasActiveWork()) {
      event.preventDefault();
      quitting = false;
      if (!window) createWindow();
      else window.show();
      if (window)
        void dialog.showMessageBox(window, {
          type: "warning",
          message: "仍有原生工作或状态尚未确认",
          detail:
            "应用会保留运行中的任务。当前阶段尚未提供完整停止后退出；请等待任务结束后再退出。",
          buttons: ["保留应用"],
        });
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
