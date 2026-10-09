import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { HistoryBridge, HistoryCursor } from "../contracts/public";

export interface BoundHistoryAttempt {
  readonly id: string;
  readonly cursor: HistoryCursor | null;
}
export function boundHistoryPageQuery(
  bridge: HistoryBridge,
  threadId: string,
  attempt: BoundHistoryAttempt | null,
) {
  return queryOptions({
    queryKey: [
      "bound-native-history-page",
      threadId,
      attempt?.id ?? null,
      attempt?.cursor ?? null,
    ] as const,
    enabled: attempt !== null,
    networkMode: "always",
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      if (!attempt) return null;
      signal.throwIfAborted();
      const page = await bridge.read(threadId, attempt.cursor);
      // This is local attempt cancellation; the existing native I/O is not abortable.
      signal.throwIfAborted();
      return page;
    },
  });
}

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

/** Append committed pages in one read-only transcript; never page away a message. */
export function savedConversationQuery(
  bridge: HistoryBridge,
  threadId: string,
) {
  return infiniteQueryOptions({
    queryKey: ["saved-native-conversation", threadId] as const,
    initialPageParam: null as HistoryCursor | null,
    networkMode: "always",
    retry: false,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    queryFn: async ({ pageParam, signal }) => {
      signal.throwIfAborted();
      const page = await bridge.read(threadId, pageParam);
      signal.throwIfAborted();
      return page;
    },
    getNextPageParam: (page) =>
      page.kind === "page" ? (page.next ?? undefined) : undefined,
  });
}

/** Image bytes belong only to a visible, source-bound thumbnail query. */
export function nativeImageQuery(
  bridge: HistoryBridge,
  threadId: string,
  cursor: HistoryCursor,
  recordId: string,
  index: number,
  newTrace: () => string,
) {
  return queryOptions({
    queryKey: [
      "native-message-image",
      threadId,
      cursor,
      recordId,
      index,
    ] as const,
    networkMode: "always",
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      signal.throwIfAborted();
      const reply =
        (await bridge.image?.(threadId, cursor, recordId, index, newTrace())) ??
        ({ kind: "unavailable", reason: "unsupported" } as const);
      signal.throwIfAborted();
      return reply;
    },
  });
}
