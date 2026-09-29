import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { FileBridge, FileReply } from "../contracts/public";

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

/**
 * The Main read surface reports both business conclusions and its own sampling
 * failures through the same `unavailable` shape. Only the latter is worth
 * retrying: a transient filesystem error must reach Query as an error, while
 * missing/denied/binary/too-large/changed stay terminal business answers that
 * the view displays as they are.
 */
function retryableSampling(kind: "list" | "read", reply: FileReply) {
  if (reply.kind === "unavailable" && reply.reason === "failed")
    throw Error(`files:${kind} sampling failed`);
  return reply;
}

export function listDirectory(
  files: FileBridge,
  threadId: string,
  path: string,
) {
  return files
    .request({
      kind: "list",
      traceId: crypto.randomUUID(),
      threadId,
      path,
    })
    .then((reply) => retryableSampling("list", reply));
}

export function readFile(files: FileBridge, threadId: string, path: string) {
  return files
    .request({
      kind: "read",
      traceId: crypto.randomUUID(),
      threadId,
      path,
    })
    .then((reply) => retryableSampling("read", reply));
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
 *
 * A directory always exists to list — the project root is the empty path — so
 * `listing` takes a required `path` and never needs an `enabled` gate. Leaving
 * `path` optional would map "no directory selected" onto the real root entry
 * and let an unselected view read the root's data. Only `content` has a
 * genuine "nothing selected" state, because "" is never a file path.
 */
export const fileQueryOptions = {
  listing(files: FileBridge, threadId: string, path: string) {
    return queryOptions({
      queryKey: fileKeys.listing(threadId, path),
      queryFn: () => listDirectory(files, threadId, path),
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
  path: string;
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
