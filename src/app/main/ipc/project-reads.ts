import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import {
  type GitReply,
  type GitRequest,
  GitRequestSchema,
} from "../../../modules/changes/contracts/public";
import {
  HistoryRequestSchema,
  ProjectHistoryRequestSchema,
} from "../../../modules/conversation/contracts/public";
import {
  listProjectNativeHistory,
  readNativeHistory,
  readProjectNativeHistory,
} from "../../../modules/conversation/main/public";
import {
  type FileReply,
  type FileRequest,
  FileRequestSchema,
} from "../../../modules/files/contracts/public";
import {
  listProjectFiles,
  readProjectFile,
} from "../../../modules/files/main/public";
import {
  ReadCancellationSchema,
  ReadCancelledError,
  type ReadIdentity,
  ReadOperationError,
  type ReadResponse,
} from "../../../shared/read-operation";
import type { AppStorage } from "../wiring/app-storage";
import type { ProjectReadContext } from "./context";

type ActiveThread = NonNullable<
  ReturnType<AppStorage["threads"]["activeThread"]>
>;

/**
 * Every project read starts by proving the sender and binding the request to
 * the active Thread. One gate keeps a new read from quietly skipping either.
 */
function activeThreadFor(
  context: ProjectReadContext,
  event: Parameters<ProjectReadContext["sourceValid"]>[0],
  sourceError: string,
  threadId: string,
): ActiveThread {
  const store = context.getStore();
  if (!context.sourceValid(event) || !store) throw Error(sourceError);
  const thread = store.threads.activeThread();
  if (!thread || thread.threadId !== threadId) throw Error("Foreign Thread");
  return thread;
}

/** Snapshot one request context before I/O; never infer a start from its reply. */
async function recordRead<T extends { kind: string; reason?: string }>(
  context: ProjectReadContext,
  request: {
    traceId: string;
    threadId: string;
    operation: string;
    operationId?: string;
  },
  sample: () => Promise<T>,
): Promise<T> {
  const diagnostics = context.getDiagnostics();
  const requestContext = {
    traceId: request.traceId,
    threadId: request.threadId,
    operation: request.operation,
    requestId: request.operationId ?? randomUUID(),
    connectionId: diagnostics?.processInstanceId ?? randomUUID(),
  };
  const started = performance.now();
  diagnostics?.record({ ...requestContext, stage: "received" });
  try {
    const reply = await sample();
    const unavailable = reply.kind === "unavailable";
    const partial = "partial" in reply && reply.partial === true;
    diagnostics?.record({
      ...requestContext,
      stage: unavailable ? "failed" : partial ? "unknown" : "completed",
      ...(partial ? { code: "history-catalog-partial" } : {}),
      durationMs: performance.now() - started,
      ...(unavailable && reply.reason ? { code: reply.reason } : {}),
    });
    return reply;
  } catch (error) {
    diagnostics?.record({
      ...requestContext,
      stage: "failed",
      code:
        error instanceof ReadCancelledError
          ? "cancelled"
          : error instanceof ReadOperationError
            ? error.code
            : "failed",
      durationMs: performance.now() - started,
    });
    throw error;
  }
}

export function registerHistoryIpc(context: ProjectReadContext): void {
  context.ipcMain.handle("history:project", async (event, raw: unknown) => {
    const request = ProjectHistoryRequestSchema.parse(raw);
    const thread = activeThreadFor(
      context,
      event,
      "Invalid history source",
      request.threadId,
    );
    return recordRead(
      context,
      {
        traceId: request.traceId,
        threadId: request.threadId,
        operation: `history:project-${request.kind}`,
      },
      async () => {
        const root = await context.projectNativeSessionsPath(
          thread.threadId,
          request.traceId,
        );
        activeThreadFor(
          context,
          event,
          "Invalid history source",
          request.threadId,
        );
        if (!root) return { kind: "unavailable", reason: "invalid" } as const;
        return request.kind === "list"
          ? listProjectNativeHistory(root, thread.directory)
          : readProjectNativeHistory(
              root,
              thread.directory,
              thread.threadId,
              request.key,
              request.cursor,
            );
      },
    );
  });
  context.ipcMain.handle("history:read", async (event, raw: unknown) => {
    const { threadId, cursor } = HistoryRequestSchema.parse(raw);
    const thread = activeThreadFor(
      context,
      event,
      "Invalid history source",
      threadId,
    );
    const binding = context.getStore()?.threads.nativeSessionBinding(threadId);
    if (!binding) return { kind: "unavailable", reason: "unbound" };
    if (binding.origin !== "cli")
      return readNativeHistory(context.nativeSessionsPath(), binding, cursor);
    const root = await context.indexedNativeSessionsPath?.(randomUUID());
    activeThreadFor(context, event, "Invalid history source", threadId);
    if (!root || !binding.historyRoot)
      return { kind: "unavailable", reason: "denied" };
    try {
      if ((await realpath(root)) !== binding.historyRoot)
        return { kind: "unavailable", reason: "denied" };
    } catch {
      return { kind: "unavailable", reason: "denied" };
    }
    return readNativeHistory(
      root,
      binding,
      cursor,
      undefined,
      thread.directory,
    );
  });
}

export { ProjectReadOperations } from "./project-reads.operations";

function verifyRead(
  context: ProjectReadContext,
  event: Parameters<ProjectReadContext["sourceValid"]>[0],
  threadId: string,
) {
  if (!context.sourceValid(event))
    throw new ReadOperationError("invalid-source");
  const thread = context.getStore()?.threads.activeThread();
  if (!thread || thread.threadId !== threadId)
    throw new ReadOperationError("foreign-thread");
  return thread;
}
export function registerFilesIpc(context: ProjectReadContext): void {
  context.ipcMain.handle("files:request", (event, raw: unknown) => {
    const command: FileRequest = FileRequestSchema.parse(raw);
    return context.reads.run<FileReply>(event, command, async (signal) => {
      const thread = verifyRead(context, event, command.threadId);
      return recordRead<FileReply>(
        context,
        {
          traceId: command.traceId,
          operationId: command.operationId,
          threadId: command.threadId,
          operation: `files:${command.kind}`,
        },
        () =>
          command.kind === "list"
            ? listProjectFiles(thread.directory, command.path, signal)
            : readProjectFile(
                thread.directory,
                command.path,
                undefined,
                undefined,
                signal,
              ),
      );
    });
  });
  context.ipcMain.handle("files:cancel", (event, raw: unknown) => {
    const command = ReadCancellationSchema.parse(raw);
    if (!context.sourceValid(event))
      throw new ReadOperationError("invalid-source");
    context.reads.cancel(event, command);
    return { kind: "acknowledged", ...command };
  });
}
export function registerGitIpc(context: ProjectReadContext): void {
  context.ipcMain.handle("git:request", (event, raw: unknown) => {
    const command: GitRequest = GitRequestSchema.parse(raw);
    return context.reads.run<GitReply>(event, command, async (signal) => {
      const thread = verifyRead(context, event, command.threadId);
      const validate = () => {
        const current = verifyRead(context, event, command.threadId);
        if (
          current.workingDirectoryId !== thread.workingDirectoryId ||
          current.directory !== thread.directory
        )
          throw new ReadOperationError("owner-released");
      };
      return recordRead<GitReply>(
        context,
        {
          traceId: command.traceId,
          operationId: command.operationId,
          threadId: command.threadId,
          operation: `git:${command.kind}`,
        },
        () =>
          command.kind === "list"
            ? context.gitReader.list(thread.directory, signal, validate)
            : context.gitReader.diff(
                thread.directory,
                command.scope,
                command.path,
                signal,
                undefined,
                validate,
              ),
      );
    });
  });
  context.ipcMain.handle("git:cancel", (event, raw: unknown) => {
    const command = ReadCancellationSchema.parse(raw);
    if (!context.sourceValid(event))
      throw new ReadOperationError("invalid-source");
    context.reads.cancel(event, command);
    return { kind: "acknowledged", ...command };
  });
}
