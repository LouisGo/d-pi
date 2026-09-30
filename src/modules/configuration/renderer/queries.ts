import { queryOptions } from "@tanstack/react-query";
import type { ConfigurationBridge } from "../contracts/public";
export function configurationSnapshotQuery(
  bridge: ConfigurationBridge | undefined,
  scope: string | null,
) {
  return queryOptions({
    queryKey: ["configuration", scope],
    networkMode: "always",
    enabled: !!bridge,
    retry: 0,
    queryFn: async () => {
      if (!bridge) return null;
      const reply = await bridge.request({
        kind: "snapshot",
        traceId: crypto.randomUUID(),
      });
      if (reply.kind === "snapshot") return reply;
      throw Error(
        reply.kind === "failed" ? reply.code : "configuration-unavailable",
      );
    },
  });
}
