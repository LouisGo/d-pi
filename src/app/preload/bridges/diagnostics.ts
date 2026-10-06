import type { IpcRenderer } from "electron";
import { match } from "ts-pattern";
import {
  type DiagnosticBridge,
  DiagnosticReplySchema,
  DiagnosticRequestSchema,
} from "../../../shared/diagnostics";

class DiagnosticRequestError extends Error {
  constructor(
    readonly code: "invalid-reply" | "transport-unavailable",
    readonly traceId: string,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "DiagnosticRequestError";
  }
}
export function createDiagnosticBridge(
  ipcRenderer: Pick<IpcRenderer, "invoke">,
): { diagnostics: DiagnosticBridge } {
  return {
    diagnostics: {
      async request(command) {
        const request = DiagnosticRequestSchema.parse(command);
        let raw: unknown;
        try {
          raw = await ipcRenderer.invoke("diagnostics:request", request);
        } catch (cause) {
          throw new DiagnosticRequestError(
            "transport-unavailable",
            request.traceId,
            { cause },
          );
        }
        const parsed = DiagnosticReplySchema.safeParse(raw);
        if (!parsed.success)
          throw new DiagnosticRequestError("invalid-reply", request.traceId, {
            cause: parsed.error,
          });
        const reply = parsed.data;
        const matches =
          reply.traceId === request.traceId &&
          match(reply)
            .with({ kind: "failed" }, () => true)
            .with(
              { kind: "cancelled" },
              { kind: "exported" },
              () => request.kind === "export",
            )
            .with(
              { kind: "snapshot" },
              ({ snapshot }) =>
                request.kind === "query" &&
                JSON.stringify(snapshot.filter) ===
                  JSON.stringify(request.filter),
            )
            .exhaustive();
        if (!matches)
          throw new DiagnosticRequestError("invalid-reply", request.traceId);
        return reply;
      },
    },
  };
}
