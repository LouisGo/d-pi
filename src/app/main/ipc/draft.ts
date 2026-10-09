import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Diagnostics } from "../../../platform/main/diagnostics/public";
import { TraceIdSchema } from "../../../shared/identity";
import {
  BridgeDiagnosticSchema,
  EnvelopeSchema,
} from "../../contracts/desktop-bridge";
import { failure } from "../../contracts/failure";
import type { DesktopCommandService } from "../wiring/desktop-command-service";
import type { IpcSourceContext } from "./context";

const traceContext = z.object({
  command: z.object({ traceId: TraceIdSchema }),
});
export function registerDraftIpc(
  dependencies: IpcSourceContext & {
    getDiagnostics: () => Diagnostics | undefined;
    initializeStorage: () => void;
    getService: () => DesktopCommandService | undefined;
    getStartupCauseCode: () => string | undefined;
    onEditableReady: () => void;
  },
): void {
  dependencies.ipcMain.on("draft:diagnostic", (event, raw: unknown) => {
    if (!dependencies.sourceValid(event)) return;
    const parsed = BridgeDiagnosticSchema.safeParse(raw);
    if (parsed.success) {
      const { code, ...context } = parsed.data;
      dependencies.getDiagnostics()?.record({
        ...context,
        observedAt: "preload",
        ...(code ? { code } : {}),
      });
    }
  });
  dependencies.ipcMain.handle("draft:request", async (event, raw: unknown) => {
    const fallbackTrace = randomUUID();
    if (!dependencies.sourceValid(event))
      return failure(fallbackTrace, "invalid-request", "draft.invalidSource");
    // Validate shape and bound body before passing it to the domain service.
    const parsed = EnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      const identity = traceContext.safeParse(raw);
      const oversized = parsed.error.issues.some(
        (issue) =>
          issue.code === "custom" && issue.path.join(".") === "command.text",
      );
      return failure(
        identity.success ? identity.data.command.traceId : fallbackTrace,
        oversized ? "content-too-large" : "invalid-request",
        oversized ? "draft.contentTooLarge" : "draft.invalidRequest",
      );
    }
    const { command, connectionId, requestId } = parsed.data;
    const context = {
      traceId: command.traceId,
      requestId,
      connectionId,
      operation: command.kind,
    };
    dependencies.getDiagnostics()?.record({ ...context, stage: "received" });
    const started = performance.now();
    // Initial restore and the explicit "重新检查" action share this path.
    // Other commands must not reopen storage or retry an uncertain write.
    if (command.kind === "restore") dependencies.initializeStorage();
    const service = dependencies.getService();
    const reply = service
      ? await service.execute(command)
      : failure(
          command.traceId,
          "storage-unavailable",
          "draft.storageOpenFailed",
          dependencies.getStartupCauseCode(),
        );
    if (reply.kind === "failed")
      dependencies.getDiagnostics()?.record({
        ...context,
        stage: "failed",
        durationMs: performance.now() - started,
        errorId: reply.error.errorId,
        code: reply.error.code,
        ...(reply.error.causeCode ? { causeCode: reply.error.causeCode } : {}),
      });
    else
      dependencies.getDiagnostics()?.record({
        ...context,
        stage: "completed",
        durationMs: performance.now() - started,
      });
    // Arm before publishing an editable snapshot. Keep this armed across
    // navigation: a reload cannot prove the previous in-memory tail was saved.
    if (reply.kind === "ready" && dependencies.sourceValid(event))
      dependencies.onEditableReady();
    return reply;
  });
}
