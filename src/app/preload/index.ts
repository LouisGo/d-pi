import { contextBridge, ipcRenderer } from "electron";
import {
  GitReplySchema,
  GitRequestSchema,
} from "../../modules/changes/contracts/public";
import {
  ConfigurationCommandSchema,
  ConfigurationEventSchema,
  ConfigurationReplySchema,
} from "../../modules/configuration/contracts/public";
import {
  ConversationEventSchema,
  HistoryPageSchema,
  HistoryRequestSchema,
} from "../../modules/conversation/contracts/public";
import {
  RuntimeCommandSchema,
  RuntimeReplySchema,
  RuntimeViewSchema,
  SubmissionCommandSchema,
  SubmissionReplySchema,
} from "../../modules/execution/contracts/public";
import {
  FileReplySchema,
  FileRequestSchema,
} from "../../modules/files/contracts/public";
import {
  LocalePreferenceSchema,
  LocaleSnapshotSchema,
} from "../../shared/i18n/locale";
import {
  type BridgeDiagnostic,
  type Command,
  type DesktopBridge,
  DesktopRequestError,
  LocaleSetResultSchema,
  parseDesktopReply,
} from "../contracts/desktop-bridge";

const connectionId = crypto.randomUUID();
function report(event: BridgeDiagnostic): void {
  try {
    ipcRenderer.send("draft:diagnostic", event);
  } catch {
    /* Diagnostics cannot change the operation result. */
  }
}
const bridge: DesktopBridge = {
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
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
        const parsed = ConfigurationEventSchema.safeParse(raw);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on("configuration:state", handler);
      ipcRenderer.send("configuration:subscribe");
      return () => ipcRenderer.removeListener("configuration:state", handler);
    },
  },
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
  files: {
    async request(command) {
      const value = FileRequestSchema.parse(command);
      return FileReplySchema.parse(
        await ipcRenderer.invoke("files:request", value),
      );
    },
  },
  git: {
    async request(command) {
      const value = GitRequestSchema.parse(command);
      return GitReplySchema.parse(
        await ipcRenderer.invoke("git:request", value),
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
  runtime: {
    async request(command) {
      const value = RuntimeCommandSchema.parse(command);
      const reply = RuntimeReplySchema.parse(
        await ipcRenderer.invoke("runtime:request", value),
      );
      if (reply.kind === "failed") {
        if (reply.error.traceId !== value.traceId)
          throw Error("Mismatched runtime failure");
        return reply;
      }
      if (reply.view.threadId !== value.threadId)
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
  async request<C extends Command>(command: C) {
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
    } catch (cause) {
      report({
        ...context,
        stage: "acknowledgement-failed",
        code: "transport-unavailable",
      });
      throw new DesktopRequestError("transport-unavailable", command.traceId, {
        cause,
      });
    }
    try {
      const reply = parseDesktopReply(command, raw);
      report({ ...context, stage: "confirmed" });
      return reply;
    } catch (error) {
      report({
        ...context,
        stage: "acknowledgement-failed",
        code: "invalid-reply",
      });
      throw error;
    }
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
