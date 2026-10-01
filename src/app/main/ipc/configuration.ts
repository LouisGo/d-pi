import { randomUUID } from "node:crypto";
import { ConfigurationCommandSchema } from "../../../modules/configuration/contracts/public";
import type { NativeConfiguration } from "../../../modules/configuration/main/public";
import type { Diagnostics } from "../../../platform/main/diagnostics/public";
import type { IpcSourceContext } from "./context";
export function registerConfigurationIpc(
  dependencies: IpcSourceContext & {
    getDiagnostics: () => Diagnostics | undefined;
    initializeStorage: () => void;
    getConfiguration: () => NativeConfiguration | undefined;
  },
): void {
  dependencies.ipcMain.on("configuration:subscribe", (event) => {
    if (dependencies.sourceValid(event)) {
      for (const state of dependencies.getConfiguration()?.currentEvents() ??
        [])
        event.sender.send("configuration:state", state);
    }
  });
  dependencies.ipcMain.handle(
    "configuration:request",
    async (event, raw: unknown) => {
      if (!dependencies.sourceValid(event))
        throw Error("Invalid configuration source");
      const command = ConfigurationCommandSchema.parse(raw);
      if (!dependencies.getConfiguration()) dependencies.initializeStorage();
      const context = {
        traceId: command.traceId,
        requestId: randomUUID(),
        connectionId:
          dependencies.getDiagnostics()?.processInstanceId ?? randomUUID(),
        operation: `configuration:${command.kind}`,
      };
      dependencies.getDiagnostics()?.record({ ...context, stage: "received" });
      const reply = (await dependencies
        .getConfiguration()
        ?.execute(command)) ?? {
        kind: "failed",
        traceId: command.traceId,
        code: "configuration-unavailable",
        scope: "scope" in command ? command.scope : { kind: "application" },
        source: null,
      };
      dependencies.getDiagnostics()?.record({
        ...context,
        stage: reply.kind === "failed" ? "failed" : "completed",
      });
      return reply;
    },
  );
}
