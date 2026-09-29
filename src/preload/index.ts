import { contextBridge, ipcRenderer } from "electron";
import { match } from "ts-pattern";
import { ConversationEventSchema } from "../features/conversation/contracts";
import {
  HistoryPageSchema,
  HistoryRequestSchema,
} from "../features/history/contracts";
import {
  RuntimeCommandSchema,
  RuntimeViewSchema,
} from "../features/runtime/contracts";
import {
  SubmissionCommandSchema,
  SubmissionReplySchema,
} from "../features/submission/contracts";
import {
  type BridgeDiagnostic,
  type Command,
  type DesktopBridge,
  LocaleSetResultSchema,
  type Reply,
  ReplySchema,
} from "../shared/desktop-bridge";
import {
  LocalePreferenceSchema,
  LocaleSnapshotSchema,
} from "../shared/i18n/locale";

const connectionId = crypto.randomUUID();
function report(event: BridgeDiagnostic): void {
  try {
    ipcRenderer.send("draft:diagnostic", event);
  } catch {
    /* Diagnostics cannot change the operation result. */
  }
}
function matchesRequest(command: Command, reply: Reply): boolean {
  if (reply.kind === "failed") return reply.error.traceId === command.traceId;
  return match(command)
    .with({ kind: "restore" }, () => reply.kind === "ready")
    .with(
      { kind: "choose-project" },
      () => reply.kind === "ready" || reply.kind === "cancelled",
    )
    .with(
      { kind: "save" },
      ({ threadId, expectedRevision }) =>
        reply.kind === "saved" &&
        reply.threadId === threadId &&
        reply.revision === expectedRevision + 1,
    )
    .with(
      { kind: "preferences" },
      ({ value }) =>
        reply.kind === "preferences-saved" &&
        reply.value.theme === value.theme &&
        reply.value.density === value.density &&
        reply.value.sendKey === value.sendKey,
    )
    .exhaustive();
}
const bridge: DesktopBridge = {
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
  history: {
    async read(threadId, cursor) {
      return HistoryPageSchema.parse(
        await ipcRenderer.invoke(
          "history:read",
          HistoryRequestSchema.parse({ threadId, cursor }),
        ),
      );
    },
  },
  submission: {
    async request(command) {
      return SubmissionReplySchema.parse(
        await ipcRenderer.invoke(
          "submission:request",
          SubmissionCommandSchema.parse(command),
        ),
      );
    },
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
        const result = SubmissionReplySchema.safeParse(raw);
        if (result.success) listener(result.data);
      };
      ipcRenderer.on("submission:state", handler);
      return () => ipcRenderer.removeListener("submission:state", handler);
    },
  },
  runtime: {
    conversation: {
      connect(threadId, listener) {
        let port: MessagePort | null = null;
        const handler = (event: Electron.IpcRendererEvent, data: unknown) => {
          if (
            typeof data !== "object" ||
            data === null ||
            !("threadId" in data) ||
            data.threadId !== threadId
          )
            return;
          port?.close();
          port = event.ports[0] ?? null;
          if (!port) return;
          port.onmessage = (message) => {
            const parsed = ConversationEventSchema.safeParse(message.data);
            if (parsed.success) listener(parsed.data);
          };
          port.start();
        };
        ipcRenderer.on("runtime:port", handler);
        ipcRenderer.send("runtime:connect", threadId);
        return () => {
          ipcRenderer.removeListener("runtime:port", handler);
          port?.close();
        };
      },
    },
    async request(command) {
      const value = RuntimeCommandSchema.parse(command);
      const reply = RuntimeViewSchema.parse(
        await ipcRenderer.invoke("runtime:request", value),
      );
      if (reply.threadId !== value.threadId)
        throw Error("Foreign runtime reply");
      return reply;
    },
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
        const parsed = RuntimeViewSchema.safeParse(raw);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on("runtime:state", handler);
      return () => ipcRenderer.removeListener("runtime:state", handler);
    },
  },
  async request(command: Command) {
    const requestId = crypto.randomUUID();
    const context = {
      connectionId,
      requestId,
      traceId: command.traceId,
      operation: command.kind,
    };
    report({ ...context, stage: "initiated" });
    let raw: unknown;
    try {
      raw = await ipcRenderer.invoke("draft:request", {
        schemaVersion: 1,
        connectionId,
        requestId,
        command,
      });
    } catch {
      report({
        ...context,
        stage: "acknowledgement-failed",
        code: "transport-unavailable",
      });
      throw new Error("Desktop transport unavailable");
    }
    const parsed = ReplySchema.safeParse(raw);
    if (!parsed.success || !matchesRequest(command, parsed.data)) {
      report({
        ...context,
        stage: "acknowledgement-failed",
        code: "invalid-reply",
      });
      throw new Error("Invalid desktop reply");
    }
    report({ ...context, stage: "confirmed" });
    return parsed.data;
  },
  onCloseRequest(listener) {
    const handler = (_event: Electron.IpcRendererEvent, token: unknown) => {
      if (typeof token === "string") listener(token);
    };
    ipcRenderer.on("draft:close-request", handler);
    return () => ipcRenderer.removeListener("draft:close-request", handler);
  },
  onCloseCancelled(listener) {
    const handler = () => listener();
    ipcRenderer.on("draft:close-cancelled", handler);
    return () => ipcRenderer.removeListener("draft:close-cancelled", handler);
  },
  completeClose(token, saved) {
    ipcRenderer.send("draft:close-result", { token, saved });
  },
};
contextBridge.exposeInMainWorld("desktop", bridge);
