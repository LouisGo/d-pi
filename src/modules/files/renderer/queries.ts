import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
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

export function useDirectoryListing({
  files,
  threadId,
  path,
}: {
  files: FileBridge;
  threadId: string;
  path: string | undefined;
}) {
  return useQuery({
    queryKey: fileKeys.listing(threadId, path ?? ""),
    queryFn: () => listDirectory(files, threadId, path ?? ""),
    enabled: path !== undefined,
    ...localRead,
  });
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
  return useQuery({
    queryKey: fileKeys.content(threadId, path ?? ""),
    queryFn: () => readFile(files, threadId, path ?? ""),
    enabled: path !== undefined,
    ...localRead,
  });
}
