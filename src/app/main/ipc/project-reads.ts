import { randomUUID } from "node:crypto";
import { GitRequestSchema } from "../../../modules/changes/contracts/public";
import {
  listGitChanges,
  readGitChange,
} from "../../../modules/changes/main/public";
import { HistoryRequestSchema } from "../../../modules/conversation/contracts/public";
import { readNativeHistory } from "../../../modules/conversation/main/public";
import { FileRequestSchema } from "../../../modules/files/contracts/public";
import {
  listProjectFiles,
  readProjectFile,
} from "../../../modules/files/main/public";
import type { ProjectReadContext } from "./context";

export function registerHistoryIpc(context: ProjectReadContext): void {
  context.ipcMain.handle("history:read", async (event, raw: unknown) => {
    const store = context.getStore();
    if (!context.sourceValid(event) || !store)
      throw Error("Invalid history source");
    const { threadId, cursor } = HistoryRequestSchema.parse(raw);
    if (store.threads.activeThread()?.threadId !== threadId)
      throw Error("Foreign Thread");
    const binding = store.threads.nativeSession(threadId);
    return binding
      ? readNativeHistory(context.nativeSessionsPath(), binding, cursor)
      : { kind: "unavailable", reason: "missing" };
  });
}

export function registerFilesIpc(context: ProjectReadContext): void {
  context.ipcMain.handle("files:request", async (event, raw: unknown) => {
    const store = context.getStore();
    if (!context.sourceValid(event) || !store)
      throw Error("Invalid file source");
    const command = FileRequestSchema.parse(raw);
    const thread = store.threads.activeThread();
    if (!thread || thread.threadId !== command.threadId)
      throw Error("Foreign Thread");
    const diagnostics = context.getDiagnostics();
    const requestContext = {
      traceId: command.traceId,
      requestId: randomUUID(),
      connectionId: diagnostics?.processInstanceId ?? randomUUID(),
      operation: `files:${command.kind}`,
    };
    diagnostics?.record({ ...requestContext, stage: "received" });
    const reply =
      command.kind === "list"
        ? await listProjectFiles(thread.directory, command.path)
        : await readProjectFile(thread.directory, command.path);
    diagnostics?.record({
      ...requestContext,
      stage: reply.kind === "unavailable" ? "failed" : "completed",
      ...(reply.kind === "unavailable" ? { code: reply.reason } : {}),
    });
    return reply;
  });
}

export function registerGitIpc(context: ProjectReadContext): void {
  context.ipcMain.handle("git:request", async (event, raw: unknown) => {
    const store = context.getStore();
    if (!context.sourceValid(event) || !store)
      throw Error("Invalid Git source");
    const command = GitRequestSchema.parse(raw);
    const thread = store.threads.activeThread();
    if (!thread || thread.threadId !== command.threadId)
      throw Error("Foreign Thread");
    const diagnostics = context.getDiagnostics();
    const requestContext = {
      traceId: command.traceId,
      requestId: randomUUID(),
      connectionId: diagnostics?.processInstanceId ?? randomUUID(),
      operation: `git:${command.kind}`,
    };
    diagnostics?.record({ ...requestContext, stage: "received" });
    const reply =
      command.kind === "list"
        ? await listGitChanges(thread.directory)
        : await readGitChange(thread.directory, command.scope, command.path);
    diagnostics?.record({
      ...requestContext,
      stage: reply.kind === "unavailable" ? "failed" : "completed",
      ...(reply.kind === "unavailable" ? { code: reply.reason } : {}),
    });
    return reply;
  });
}
