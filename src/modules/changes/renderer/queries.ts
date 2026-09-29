import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { ChangeScope, GitBridge } from "../contracts/public";

/**
 * Query keys and request builders for the read-only Git sample. The scope and
 * path are part of the key, so a reply for another selection can only land in
 * that selection's cache entry.
 */
export const gitKeys = {
  all: (threadId: string) => ["git", threadId] as const,
  changes: (threadId: string) => ["git", threadId, "changes"] as const,
  diff: (threadId: string, scope: ChangeScope, path: string) =>
    ["git", threadId, "diff", scope, path] as const,
};

export function readChanges(git: GitBridge, threadId: string) {
  return git.request({ kind: "list", traceId: crypto.randomUUID(), threadId });
}

export function readDiff(
  git: GitBridge,
  threadId: string,
  scope: ChangeScope,
  path: string,
) {
  return git.request({
    kind: "diff",
    traceId: crypto.randomUUID(),
    threadId,
    scope,
    path,
  });
}

export function refreshGit(client: QueryClient, threadId: string): void {
  void client.invalidateQueries({ queryKey: gitKeys.all(threadId) });
}

/** Git reads sample the local repository, not the network. */
const localRead = { networkMode: "always" } as const;

export function useChanges({
  git,
  threadId,
}: {
  git: GitBridge;
  threadId: string;
}) {
  return useQuery({
    queryKey: gitKeys.changes(threadId),
    queryFn: () => readChanges(git, threadId),
    ...localRead,
  });
}

export function useDiff({
  git,
  threadId,
  scope,
  path,
}: {
  git: GitBridge;
  threadId: string;
  scope: ChangeScope;
  path: string | undefined;
}) {
  return useQuery({
    queryKey: gitKeys.diff(threadId, scope, path ?? ""),
    queryFn: () => readDiff(git, threadId, scope, path ?? ""),
    enabled: path !== undefined,
    ...localRead,
  });
}
