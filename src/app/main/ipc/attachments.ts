import { randomUUID } from "node:crypto";
import type { Diagnostics } from "../../../platform/main/diagnostics/public";
import { AttachmentRequestSchema } from "../../contracts/attachments";
import type { AttachmentService } from "../wiring/attachment-service";
import type { IpcSourceContext } from "./context";
export function registerAttachmentIpc(
  context: IpcSourceContext & {
    getService: () => AttachmentService | undefined;
    getDiagnostics: () =>
      | Pick<Diagnostics, "record" | "processInstanceId">
      | undefined;
  },
) {
  context.ipcMain.handle("attachments:request", async (event, raw: unknown) => {
    if (!context.sourceValid(event)) throw Error("Invalid attachment source");
    const command = AttachmentRequestSchema.parse(raw);
    const diagnostics = context.getDiagnostics();
    const started = performance.now();
    const identity = {
      traceId: command.traceId,
      requestId: randomUUID(),
      threadId: command.threadId,
      connectionId: diagnostics?.processInstanceId ?? randomUUID(),
      operation: `attachments:${command.kind}`,
    };
    diagnostics?.record({ ...identity, stage: "received" });
    try {
      const service = context.getService();
      if (!service) throw Error("Attachment storage unavailable");
      const reply = await service.execute(command);
      diagnostics?.record({
        ...identity,
        stage: reply.kind === "unavailable" ? "failed" : "completed",
        ...(reply.kind === "unavailable" ? { code: reply.reason } : {}),
        durationMs: performance.now() - started,
      });
      return reply;
    } catch (error) {
      diagnostics?.record({
        ...identity,
        stage: "failed",
        code: "attachment-operation-unavailable",
        durationMs: performance.now() - started,
      });
      throw error;
    }
  });
}
