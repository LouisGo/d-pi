import { queryOptions } from "@tanstack/react-query";
import {
  type ConfigurationBridge,
  type ConfigurationScope,
  sameConfigurationScope,
} from "../contracts/public";
export class ConfigurationReadError extends Error {
  constructor(
    readonly code: string,
    readonly traceId: string,
    readonly scope: ConfigurationScope,
    readonly cause?: unknown,
  ) {
    super(code);
  }
}
export function configurationSnapshotQuery(
  bridge: ConfigurationBridge | undefined,
  scope: ConfigurationScope,
) {
  return queryOptions({
    queryKey: ["configuration", scope],
    networkMode: "always",
    enabled: !!bridge,
    retry: 0,
    queryFn: async () => {
      if (!bridge) return null;
      const traceId = crypto.randomUUID();
      let reply;
      try {
        reply = await bridge.request({ kind: "snapshot", traceId, scope });
      } catch (cause) {
        throw new ConfigurationReadError(
          "transport-failed",
          traceId,
          scope,
          cause,
        );
      }
      if (
        reply.traceId !== traceId ||
        !sameConfigurationScope(reply.scope, scope)
      )
        throw new ConfigurationReadError("identity-mismatch", traceId, scope);
      if (reply.kind === "snapshot") return reply;
      throw new ConfigurationReadError(
        reply.kind === "failed" ? reply.code : "configuration-unavailable",
        traceId,
        scope,
      );
    },
  });
}
