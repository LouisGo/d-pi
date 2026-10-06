import { queryOptions } from "@tanstack/react-query";
import type {
  DiagnosticBridge,
  DiagnosticFilter,
} from "../../../shared/diagnostics";
import { createId } from "../../../shared/identity";

export class DiagnosticReadError extends Error {
  constructor(
    readonly traceId: string,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "DiagnosticReadError";
  }
}
export function diagnosticQuery(
  bridge: DiagnosticBridge,
  filter: DiagnosticFilter,
) {
  return queryOptions({
    queryKey: ["diagnostics", filter],
    networkMode: "always",
    retry: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const traceId = createId();
      try {
        const reply = await bridge.request({ kind: "query", traceId, filter });
        if (reply.kind === "snapshot") return reply.snapshot;
        throw new DiagnosticReadError(
          reply.traceId,
          reply.kind === "failed" ? reply.reason : "invalid-reply",
        );
      } catch (error) {
        if (error instanceof DiagnosticReadError) throw error;
        throw new DiagnosticReadError(traceId, "connection-failed");
      }
    },
  });
}
