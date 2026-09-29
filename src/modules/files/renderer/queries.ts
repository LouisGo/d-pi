import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { FileBridge } from "../contracts/public";

/**
 * Query keys and request builders for the read-only project file surface.
 * Keys are the isolation boundary: a late reply for an old path can only ever
 * land in that path's cache entry, so the view never sees a foreign result.
 */
export const fileKeys = {
  all: (threadId: string) => ["files", threadId] as const,
  listing: (threadId: string, path: string) =>
    ["files", threadId, "list", path] as const,
  content: (threadId: string, path: string) =>
    ["files", threadId, "read", path] as const,
};

export function listDirectory(
  files: FileBridge,
  threadId: string,
  path: string,
) {
  return files.request({
    kind: "list",
    traceId: crypto.randomUUID(),
    threadId,
    path,
  });
}

export function readFile(files: FileBridge, threadId: string, path: string) {
  return files.request({
    kind: "read",
    traceId: crypto.randomUUID(),
    threadId,
    path,
  });
}

export function refreshFiles(client: QueryClient, threadId: string): void {
  void client.invalidateQueries({ queryKey: fileKeys.all(threadId) });
}

/**
 * Local project reads do not depend on network connectivity, so they must not
 * be paused by Query's offline state; the desktop read path stays available
 * regardless of what the renderer reports about the network.
 */
const localRead = { networkMode: "always" } as const;

/**
 * The single source of truth for each file query. Hooks and imperative
 * consumers share the same key, enabled rule, and local-read policy.
 */
export const fileQueryOptions = {
  listing(files: FileBridge, threadId: string, path: string | undefined) {
    const resolvedPath = path ?? "";
    return queryOptions({
      queryKey: fileKeys.listing(threadId, resolvedPath),
      queryFn: () => listDirectory(files, threadId, resolvedPath),
      enabled: path !== undefined,
      ...localRead,
    });
  },
  content(files: FileBridge, threadId: string, path: string | undefined) {
    const resolvedPath = path ?? "";
    return queryOptions({
      queryKey: fileKeys.content(threadId, resolvedPath),
      queryFn: () => readFile(files, threadId, resolvedPath),
      enabled: path !== undefined,
      ...localRead,
    });
  },
} as const;

export function useDirectoryListing({
  files,
  threadId,
  path,
}: {
  files: FileBridge;
  threadId: string;
  path: string | undefined;
}) {
  return useQuery(fileQueryOptions.listing(files, threadId, path));
}

export function useFileContent({
  files,
  threadId,
  path,
}: {
  files: FileBridge;
  threadId: string;
  path: string | undefined;
}) {
  return useQuery(fileQueryOptions.content(files, threadId, path));
}
