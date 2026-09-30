import { randomUUID } from "node:crypto";
import {
  type GitReply,
  type GitRequest,
  GitRequestSchema,
} from "../../../modules/changes/contracts/public";
import {
  listGitChanges,
  readGitChange,
} from "../../../modules/changes/main/public";
import { HistoryRequestSchema } from "../../../modules/conversation/contracts/public";
import { readNativeHistory } from "../../../modules/conversation/main/public";
import {
  type FileReply,
  type FileRequest,
  FileRequestSchema,
} from "../../../modules/files/contracts/public";
import {
  listProjectFiles,
  readProjectFile,
} from "../../../modules/files/main/public";
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
  request: { traceId: string; threadId: string; operation: string },
  sample: () => Promise<T>,
): Promise<T> {
  const diagnostics = context.getDiagnostics();
  const requestContext = {
    ...request,
    requestId: randomUUID(),
    connectionId: diagnostics?.processInstanceId ?? randomUUID(),
  };
  const started = performance.now();
  diagnostics?.record({ ...requestContext, stage: "received" });
  try {
    const reply = await sample();
    const unavailable = reply.kind === "unavailable";
    diagnostics?.record({
      ...requestContext,
      stage: unavailable ? "failed" : "completed",
      durationMs: performance.now() - started,
      ...(unavailable && reply.reason ? { code: reply.reason } : {}),
    });
    return reply;
  } catch (error) {
    diagnostics?.record({
      ...requestContext,
      stage: "failed",
      code: "failed",
      durationMs: performance.now() - started,
    });
    throw error;
  }
}

export function registerHistoryIpc(context: ProjectReadContext): void {
  context.ipcMain.handle("history:read", async (event, raw: unknown) => {
    const { threadId, cursor } = HistoryRequestSchema.parse(raw);
    activeThreadFor(context, event, "Invalid history source", threadId);
    const binding = context.getStore()?.threads.nativeSessionBinding(threadId);
    return binding
      ? readNativeHistory(context.nativeSessionsPath(), binding, cursor)
      : { kind: "unavailable", reason: "missing" };
  });
}

export function registerFilesIpc(context: ProjectReadContext): void {
  context.ipcMain.handle("files:request", async (event, raw: unknown) => {
    const command: FileRequest = FileRequestSchema.parse(raw);
    const thread = activeThreadFor(
      context,
      event,
      "Invalid file source",
      command.threadId,
    );
    return recordRead<FileReply>(
      context,
      {
        traceId: command.traceId,
        threadId: command.threadId,
        operation: `files:${command.kind}`,
      },
      () =>
        command.kind === "list"
          ? listProjectFiles(thread.directory, command.path)
          : readProjectFile(thread.directory, command.path),
    );
  });
}

export function registerGitIpc(context: ProjectReadContext): void {
  context.ipcMain.handle("git:request", async (event, raw: unknown) => {
    const command: GitRequest = GitRequestSchema.parse(raw);
    const thread = activeThreadFor(
      context,
      event,
      "Invalid Git source",
      command.threadId,
    );
    return recordRead<GitReply>(
      context,
      {
        traceId: command.traceId,
        threadId: command.threadId,
        operation: `git:${command.kind}`,
      },
      () =>
        command.kind === "list"
          ? listGitChanges(thread.directory)
          : readGitChange(thread.directory, command.scope, command.path),
    );
  });
}
