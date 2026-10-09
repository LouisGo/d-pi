import type { IpcRenderer } from "electron";
import {
  GitRequestSchema,
  GitResponseSchema,
} from "../../../modules/changes/contracts/public";
import {
  HistoryImageReplySchema,
  HistoryImageRequestSchema,
  HistoryPageSchema,
  HistoryRequestSchema,
  ProjectHistoryCatalogSchema,
  ProjectHistoryRequestSchema,
} from "../../../modules/conversation/contracts/public";
import {
  FileRequestSchema,
  FileResponseSchema,
} from "../../../modules/files/contracts/public";
import {
  ReadCancellationSchema,
  ReadCancelReplySchema,
  type ReadIdentity,
  ReadOperationError,
  type ReadResponse,
} from "../../../shared/read-operation";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
export function createProjectReadBridge(
  ipcRenderer: IpcRenderer,
): Pick<DesktopBridge, "history" | "files" | "git"> {
  async function cancel(
    channel: "files:cancel" | "git:cancel",
    command: ReadIdentity,
  ) {
    const value = ReadCancellationSchema.parse(command);
    const response = ReadCancelReplySchema.safeParse(
      await ipcRenderer.invoke(channel, value),
    );
    if (
      !response.success ||
      response.data.operationId !== value.operationId ||
      response.data.traceId !== value.traceId
    )
      throw new ReadOperationError("invalid-reply");
    return response.data;
  }
  return {
    history: {
      async image(threadId, cursor, recordId, index, traceId) {
        return HistoryImageReplySchema.parse(
          await ipcRenderer.invoke(
            "history:image",
            HistoryImageRequestSchema.parse({
              threadId,
              cursor,
              recordId,
              index,
              traceId,
            }),
          ),
        );
      },
      async projectList(threadId) {
        return ProjectHistoryCatalogSchema.parse(
          await ipcRenderer.invoke(
            "history:project",
            ProjectHistoryRequestSchema.parse({
              kind: "list",
              threadId,
              traceId: crypto.randomUUID(),
            }),
          ),
        );
      },
      async projectRead(threadId, key, cursor) {
        return HistoryPageSchema.parse(
          await ipcRenderer.invoke(
            "history:project",
            ProjectHistoryRequestSchema.parse({
              kind: "read",
              threadId,
              key,
              cursor,
              traceId: crypto.randomUUID(),
            }),
          ),
        );
      },
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
      cancel: (command) => cancel("files:cancel", command),
      async request(command) {
        const value = FileRequestSchema.parse(command);
        const response = FileResponseSchema.safeParse(
          await ipcRenderer.invoke("files:request", value),
        );
        if (!response.success) throw new ReadOperationError("invalid-reply");
        return correlated(value, response.data);
      },
    },
    git: {
      cancel: (command) => cancel("git:cancel", command),
      async request(command) {
        const value = GitRequestSchema.parse(command);
        const response = GitResponseSchema.safeParse(
          await ipcRenderer.invoke("git:request", value),
        );
        if (!response.success) throw new ReadOperationError("invalid-reply");
        return correlated(value, response.data);
      },
    },
  };
}

function correlated<T>(
  identity: ReadIdentity,
  response: ReadResponse<T>,
): ReadResponse<T> {
  const returned = response.kind === "failed" ? response.error : response;
  if (
    returned.operationId !== identity.operationId ||
    returned.traceId !== identity.traceId
  )
    throw new ReadOperationError("invalid-reply");
  return response;
}
