import { randomUUID } from "node:crypto";
import type { IpcMain } from "electron";
import { AnswerHistoryRequestSchema } from "../../../modules/execution/contracts/public";
import type { Diagnostics } from "../../../platform/main/diagnostics/public";
import type { AppStorage } from "../wiring/app-storage";
import type { IpcSourceContext } from "./context";

export function registerAnswerHistoryIpc(
  context: Omit<IpcSourceContext, "ipcMain"> & {
    ipcMain: Pick<IpcMain, "handle">;
    getStore: () => AppStorage | undefined;
    getDiagnostics: () =>
      | Pick<Diagnostics, "processInstanceId" | "record">
      | undefined;
  },
): void {
  context.ipcMain.handle("runtime:answer-history", (event, raw: unknown) => {
    if (!context.sourceValid(event))
      throw Error("Invalid answer history source");
    const request = AnswerHistoryRequestSchema.parse(raw),
      store = context.getStore();
    if (!store || !store.threads.threadContext(request.threadId))
      throw Error("Invalid answer history Thread");
    const diagnostics = context.getDiagnostics();
    const identity = {
      traceId: request.traceId,
      requestId: randomUUID(),
      connectionId: diagnostics?.processInstanceId ?? randomUUID(),
      threadId: request.threadId,
      operation: "runtime:answer-history",
    };
    diagnostics?.record({ ...identity, stage: "received" });
    try {
      const page = store.answerHistory.page(request.threadId, request.cursor);
      diagnostics?.record({ ...identity, stage: "completed" });
      return page;
    } catch (error) {
      diagnostics?.record({ ...identity, stage: "failed" });
      throw error;
    }
  });
}
