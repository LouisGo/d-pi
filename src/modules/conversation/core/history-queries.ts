import { queryOptions } from "@tanstack/react-query";
import type { HistoryBridge, HistoryCursor } from "../contracts/public";

export function projectHistoryCatalogQuery(
  bridge: HistoryBridge,
  threadId: string,
) {
  return queryOptions({
    queryKey: ["project-native-history", threadId] as const,
    networkMode: "always",
    queryFn: () => bridge.projectList(threadId),
  });
}
export function projectHistoryPageQuery(
  bridge: HistoryBridge,
  threadId: string,
  key: string | null,
  cursor: HistoryCursor | null,
) {
  return queryOptions({
    queryKey: ["project-native-history-page", threadId, key, cursor] as const,
    networkMode: "always",
    enabled: key !== null,
    queryFn: () => (key ? bridge.projectRead(threadId, key, cursor) : null),
  });
}
