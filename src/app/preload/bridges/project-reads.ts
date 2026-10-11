import type { IpcRenderer } from "electron";
import type { z } from "zod";
import {
  GitRequestSchema,
  GitResponseSchema,
} from "../../../modules/changes/contracts/public";
import {
  type HistoryImageRequest,
  HistoryImageRequestSchema,
  HistoryImageResponseSchema,
  HistoryRequestSchema,
  HistoryResponseSchema,
  type HistoryToolRequest,
  HistoryToolRequestSchema,
  HistoryToolResponseSchema,
  type ProjectHistoryRequest,
  ProjectHistoryRequestSchema,
  ProjectHistoryResponseSchema,
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
  requestReadOperation,
} from "../../../shared/read-operation";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
export function createProjectReadBridge(
  ipcRenderer: IpcRenderer,
): Pick<DesktopBridge, "history" | "files" | "git"> {
  async function cancel(
    channel: "files:cancel" | "git:cancel" | "history:cancel",
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
  async function requestHistory(
    command: ReturnType<typeof HistoryRequestSchema.parse>,
  ) {
    const value = HistoryRequestSchema.parse(command);
    const response = HistoryResponseSchema.safeParse(
      await ipcRenderer.invoke("history:read", value),
    );
    if (!response.success) throw new ReadOperationError("invalid-reply");
    return correlated(value, response.data);
  }
  async function historyRequest<T>(
    channel: string,
    value: ReadIdentity,
    schema: z.ZodType<ReadResponse<T>>,
  ) {
    const response = schema.safeParse(await ipcRenderer.invoke(channel, value));
    if (!response.success) throw new ReadOperationError("invalid-reply");
    return correlated(value, response.data);
  }
  async function requestTool(command: HistoryToolRequest) {
    const value = HistoryToolRequestSchema.parse(command);
    const response = await historyRequest(
      "history:tool",
      value,
      HistoryToolResponseSchema,
    );
    if (
      response.kind === "completed" &&
      response.reply.readerId !== value.readerId
    )
      throw new ReadOperationError("invalid-reply");
    return response;
  }
  const requestImage = (command: HistoryImageRequest) =>
    historyRequest(
      "history:image",
      HistoryImageRequestSchema.parse(command),
      HistoryImageResponseSchema,
    );
  const requestProjectList = (
    command: Extract<ProjectHistoryRequest, { kind: "list" }>,
  ) =>
    historyRequest(
      "history:project",
      ProjectHistoryRequestSchema.parse(command),
      ProjectHistoryResponseSchema,
    );
  const requestProjectRead = (
    command: Extract<ProjectHistoryRequest, { kind: "read" }>,
  ) =>
    historyRequest(
      "history:project",
      ProjectHistoryRequestSchema.parse(command),
      HistoryResponseSchema,
    );
  const cancelHistory = (identity: ReadIdentity) =>
    cancel("history:cancel", identity);
  return {
    history: {
      requestRead: requestHistory,
      requestTool,
      requestImage,
      requestProjectList,
      requestProjectRead,
      cancelRead: cancelHistory,
      async tool(source, cursor, readerId, recordId) {
        const command = {
          operationId: crypto.randomUUID(),
          traceId: readerId,
          threadId: source.threadId,
          source,
          cursor,
          readerId,
          ...(recordId ? { recordId } : {}),
        };
        return requestReadOperation(
          { request: () => requestTool(command), cancel: cancelHistory },
          command,
        );
      },
      async image(threadId, cursor, recordId, index, traceId) {
        const command = {
          operationId: crypto.randomUUID(),
          traceId,
          threadId,
          cursor,
          recordId,
          index,
        };
        return requestReadOperation(
          { request: () => requestImage(command), cancel: cancelHistory },
          command,
        );
      },
      async projectList(threadId) {
        const command = {
          kind: "list" as const,
          operationId: crypto.randomUUID(),
          traceId: crypto.randomUUID(),
          threadId,
        };
        return requestReadOperation(
          { request: () => requestProjectList(command), cancel: cancelHistory },
          command,
        );
      },
      async projectRead(threadId, key, cursor) {
        const command = {
          kind: "read" as const,
          operationId: crypto.randomUUID(),
          traceId: crypto.randomUUID(),
          threadId,
          key,
          cursor,
        };
        return requestReadOperation(
          { request: () => requestProjectRead(command), cancel: cancelHistory },
          command,
        );
      },
      async read(threadId, cursor, range) {
        const identity = {
          operationId: crypto.randomUUID(),
          traceId: crypto.randomUUID(),
        };
        return requestReadOperation(
          {
            request: () =>
              requestHistory({
                ...identity,
                threadId,
                cursor,
                ...(range ? { range } : {}),
              }),
            cancel: (identity) => cancel("history:cancel", identity),
          },
          identity,
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
