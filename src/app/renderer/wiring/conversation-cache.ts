import type { QueryClient } from "@tanstack/react-query";
import { historyCacheBytes } from "../../../modules/conversation/core/public";

/** Read-only transcript LRU. Observed/in-flight queries are never retired. */
export function installConversationCacheBudget(
  client: QueryClient,
  limit = 8,
  maxBytes = 32 * 1024 * 1024,
): () => void {
  const cache = client.getQueryCache();
  const visits = new Map<string, number>();
  let clock = 0;
  let pruning = false;
  const unsubscribe = cache.subscribe((event) => {
    const query = event.query;
    if (query.queryKey[0] !== "saved-native-conversation") return;
    if (event.type === "removed") {
      visits.delete(query.queryHash);
      return;
    }
    if (event.type === "observerAdded" || !visits.has(query.queryHash))
      visits.set(query.queryHash, ++clock);
    if (pruning) return;
    const entries = cache
      .findAll({ queryKey: ["saved-native-conversation"] })
      .filter((entry) => entry.state.data !== undefined);
    let bytes = entries.reduce(
      (sum, entry) => sum + historyCacheBytes(entry.state.data),
      0,
    );
    if (entries.length <= limit && bytes <= maxBytes) return;
    const candidates = entries
      .filter(
        (entry) =>
          !entry.getObserversCount() && entry.state.fetchStatus === "idle",
      )
      .sort(
        (a, b) =>
          (visits.get(a.queryHash) ?? 0) - (visits.get(b.queryHash) ?? 0),
      );
    pruning = true;
    try {
      let size = entries.length;
      for (const entry of candidates) {
        if (size <= limit && bytes <= maxBytes) break;
        bytes -= historyCacheBytes(entry.state.data);
        cache.remove(entry);
        size--;
      }
    } finally {
      pruning = false;
    }
  });
  return () => {
    unsubscribe();
    visits.clear();
  };
}
