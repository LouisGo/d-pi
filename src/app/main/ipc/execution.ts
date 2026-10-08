import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  RuntimeCommandSchema,
  SubmissionCommandSchema,
} from "../../../modules/execution/contracts/public";
import { diagnosticCode } from "../../../platform/main/diagnostics/public";
import type {
  RuntimeConnectionContext,
  RuntimeRequestContext,
  SubmissionContext,
} from "./context";

export function registerRuntimeConnectionIpc(
  context: RuntimeConnectionContext,
): void {
  context.ipcMain.on("runtime:connect", (event, raw: unknown) => {
    if (!context.sourceValid(event)) return;
    const parsed = z.uuid().safeParse(raw);
    if (!parsed.success) return;
    const runtime = context.getRuntime(parsed.data);
    if (!runtime) return;
    const { port1, port2 } = context.createMessageChannel();
    runtime.attach(port1);
    event.senderFrame?.postMessage("runtime:port", { threadId: parsed.data }, [
      port2,
    ]);
  });
}

export function registerSubmissionIpc(context: SubmissionContext): void {
  context.ipcMain.handle("submission:request", async (event, raw: unknown) => {
    if (!context.sourceValid(event)) throw Error("Invalid submission source");
    const command = SubmissionCommandSchema.parse(raw);
    const runtime = context.getRuntime(command.threadId);
    if (!runtime) throw Error("Invalid submission Thread");
    return runtime.submit(command);
  });
}

export function registerRuntimeRequestIpc(
  context: RuntimeRequestContext,
): void {
  context.ipcMain.handle("runtime:request", async (event, raw: unknown) => {
    if (!context.sourceValid(event))
      throw new Error("Invalid runtime request source");
    const command = RuntimeCommandSchema.parse(raw);
    if (command.kind === "inspect") context.initializeStorage();
    const diagnostics = context.getDiagnostics();
    const requestContext = {
      traceId: command.traceId,
      requestId: randomUUID(),
      connectionId: diagnostics?.processInstanceId ?? randomUUID(),
      operation: `runtime:${command.kind}`,
    };
    diagnostics?.record({ ...requestContext, stage: "received" });
    const runtime = context.getRuntime(command.threadId);
    if (!runtime) {
      const failure = context.runtimeFailure(
        command.traceId,
        Error("Runtime storage unavailable"),
      );
      diagnostics?.record({
        ...requestContext,
        stage: "failed",
        code: failure.code,
      });
      return { kind: "failed", error: failure } as const;
    }
    try {
      const view = await runtime.execute(command);
      diagnostics?.record({
        ...requestContext,
        ...(command.kind === "start" && view.recoveryFailure
          ? { code: `recovery-${view.recoveryFailure}` }
          : {}),
        stage:
          view.phase === "failed" || view.phase === "interrupted"
            ? "failed"
            : command.kind === "stop" ||
                command.kind === "continue" ||
                command.kind === "answer"
              ? "dispatching"
              : "completed",
      });
      return { kind: "view", view } as const;
    } catch (error) {
      const failure = context.runtimeFailure(command.traceId, error);
      const causeCode = diagnosticCode(error);
      diagnostics?.record({
        ...requestContext,
        stage: "failed",
        code: failure.code,
        ...(causeCode ? { causeCode } : {}),
      });
      return { kind: "failed", error: failure } as const;
    }
  });
}
