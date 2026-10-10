import {
  type InfiniteData,
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query";
import type { HistoryBridge, HistoryCursor, HistoryPage } from "../contracts/public";

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
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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

const refreshVersions = new WeakMap<QueryClient, Map<string, object>>();
const cachedRecordIds = new WeakMap<object, Set<string>>();

/** Extend the last loaded committed page, not TanStack's all-page refetch. */
export async function refreshSavedConversation(
  client: QueryClient,
  bridge: HistoryBridge,
  threadId: string,
  signal?: AbortSignal,
): Promise<void> {
  let versions = refreshVersions.get(client);
  if (!versions) {
    versions = new Map();
    refreshVersions.set(client, versions);
  }
  const version = {};
  versions.set(threadId, version);
  const options = savedConversationQuery(bridge, threadId);
  try {
  await client.cancelQueries({ queryKey: options.queryKey, exact: true });
  if (signal?.aborted || versions.get(threadId) !== version) return;
  const cached = client.getQueryData<InfiniteData<HistoryPage, HistoryCursor | null>>(
    options.queryKey,
  );
  const last = cached?.pages.at(-1);
  const cursor = last?.kind === "page" ? last.continuation : undefined;
  let page = await bridge.read(threadId, cursor ? { ...cursor, append: true } : null);
  if (signal?.aborted || versions.get(threadId) !== version) return;
  // A replaced/truncated source is a clean reset, never joined to old entries.
  const reset = !cursor || (page.kind === "unavailable" && page.reason === "changed");
  if (cursor && reset) page = await bridge.read(threadId, null);
  if (
    signal?.aborted ||
    versions.get(threadId) !== version ||
    client.getQueryData(options.queryKey) !== cached
  ) return;
  if (reset || !cached || page.kind === "unavailable") {
    client.setQueryData(options.queryKey, { pages: [page], pageParams: [null] });
    return;
  }
  let ids = cachedRecordIds.get(cached);
  if (!ids) {
    ids = new Set<string>();
    for (const loaded of cached.pages) {
      if (loaded.kind === "page") {
        for (const entry of loaded.entries) ids.add(entry.id);
      }
    }
  }
  const recordIds = ids;
  const appended = { ...page, entries: page.entries.filter((entry) => {
    if (recordIds.has(entry.id)) return false;
    recordIds.add(entry.id);
    return true;
  }) };
  // An empty refresh replaces just the tail metadata, preventing one empty
  // cached page per native identity while still advancing omitted records.
  if (appended.entries.length === 0 && last?.kind === "page") {
    const updated = client.setQueryData(options.queryKey, {
      pages: [...cached.pages.slice(0, -1), {
        ...last,
        next: appended.next,
        continuation: appended.continuation,
        incompleteTail: appended.incompleteTail,
        omitted: last.omitted + appended.omitted,
      }],
      pageParams: cached.pageParams,
    });
    if (updated) cachedRecordIds.set(updated, ids);
    return;
  }
  const updated = client.setQueryData(options.queryKey, {
    pages: [...cached.pages, appended],
    pageParams: [...cached.pageParams, cursor ?? null],
  });
  if (updated) cachedRecordIds.set(updated, ids);
  } finally {
    if (versions.get(threadId) === version) versions.delete(threadId);
  }
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
