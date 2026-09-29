import { randomUUID } from "node:crypto";
import {
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

/** Record the bounded diagnostic every read owes: identity, operation and a
 * terminal stage carrying the domain's own unavailable reason. */
function recordRead(
  context: ProjectReadContext,
  request: { traceId: string; operation: string },
  reply: { kind: string; reason?: string },
): void {
  const diagnostics = context.getDiagnostics();
  const requestContext = {
    traceId: request.traceId,
    requestId: randomUUID(),
    connectionId: diagnostics?.processInstanceId ?? randomUUID(),
    operation: request.operation,
  };
  diagnostics?.record({ ...requestContext, stage: "received" });
  const unavailable = reply.kind === "unavailable";
  diagnostics?.record({
    ...requestContext,
    stage: unavailable ? "failed" : "completed",
    ...(unavailable && reply.reason ? { code: reply.reason } : {}),
  });
}

export function registerHistoryIpc(context: ProjectReadContext): void {
  context.ipcMain.handle("history:read", async (event, raw: unknown) => {
    const { threadId, cursor } = HistoryRequestSchema.parse(raw);
    activeThreadFor(context, event, "Invalid history source", threadId);
    const binding = context.getStore()?.threads.nativeSession(threadId);
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
    const reply =
      command.kind === "list"
        ? await listProjectFiles(thread.directory, command.path)
        : await readProjectFile(thread.directory, command.path);
    recordRead(
      context,
      { traceId: command.traceId, operation: `files:${command.kind}` },
      reply,
    );
    return reply;
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
    const reply =
      command.kind === "list"
        ? await listGitChanges(thread.directory)
        : await readGitChange(thread.directory, command.scope, command.path);
    recordRead(
      context,
      { traceId: command.traceId, operation: `git:${command.kind}` },
      reply,
    );
    return reply;
  });
}
