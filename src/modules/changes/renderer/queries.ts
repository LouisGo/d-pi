import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  ReadCancelledError,
  ReadOperationError,
  readRetry,
  requestReadOperation,
} from "../../../shared/read-operation";
import type { ThreadContext } from "../../threads/contracts/public";
import type {
  ChangeScope,
  GitBridge,
  GitReply,
  GitRequest,
} from "../contracts/public";

export const gitKeys = {
  all: (resource: ThreadContext) =>
    [
      "git",
      resource.threadId,
      resource.workingDirectoryId,
      resource.directory,
    ] as const,
  changes: (resource: ThreadContext) =>
    [...gitKeys.all(resource), "changes"] as const,
  diff: (resource: ThreadContext, scope: ChangeScope, path: string | null) =>
    [...gitKeys.all(resource), "diff", scope, path] as const,
};

/** The trace records what the renderer requested, not an inferred Main cause. */
export class GitReadError extends Error {
  readonly traceId: string;
  readonly operation: "git:list" | "git:diff";
  readonly attribution: "main" | "unknown";
  readonly code: string;
  readonly retryable: boolean;
  readonly reply: GitReply | undefined;

  constructor(
    readonly request: GitRequest,
    observation: { reply: GitReply } | { cause: unknown },
  ) {
    super(
      `git:${request.kind} sampling failed`,
      "cause" in observation ? { cause: observation.cause } : undefined,
    );
    this.name = "GitReadError";
    this.attribution =
      "cause" in observation && observation.cause instanceof ReadOperationError
        ? (observation.cause.failure?.attribution ?? "unknown")
        : "unknown";
    this.code =
      "cause" in observation && observation.cause instanceof ReadOperationError
        ? observation.cause.code
        : "failed";
    this.retryable =
      "cause" in observation
        ? observation.cause instanceof ReadOperationError &&
          observation.cause.retryable
        : false;
    this.traceId = request.traceId;
    this.operation = request.kind === "list" ? "git:list" : "git:diff";
    this.reply = "reply" in observation ? observation.reply : undefined;
  }
}

async function sample(
  git: GitBridge,
  request: GitRequest,
  signal?: AbortSignal,
): Promise<GitReply> {
  let reply: GitReply;
  try {
    reply = await requestReadOperation(
      {
        request: () => git.request(request),
        cancel: (identity) => git.cancel(identity),
      },
      request,
      signal,
    );
  } catch (cause) {
    if (cause instanceof ReadCancelledError) throw cause;
    throw new GitReadError(request, { cause });
  }
  if (reply.kind === "unavailable" && reply.reason === "failed")
    throw new GitReadError(request, { reply });
  return reply;
}

export function readChanges(
  git: GitBridge,
  resource: ThreadContext,
  signal?: AbortSignal,
) {
  return sample(
    git,
    {
      kind: "list",
      traceId: crypto.randomUUID(),
      operationId: crypto.randomUUID(),
      threadId: resource.threadId,
    },
    signal,
  );
}

export function readDiff(
  git: GitBridge,
  resource: ThreadContext,
  scope: ChangeScope,
  path: string,
  signal?: AbortSignal,
) {
  return sample(
    git,
    {
      kind: "diff",
      traceId: crypto.randomUUID(),
      operationId: crypto.randomUUID(),
      threadId: resource.threadId,
      scope,
      path,
    },
    signal,
  );
}

export function refreshGit(client: QueryClient, resource: ThreadContext): void {
  void client.invalidateQueries({ queryKey: gitKeys.all(resource) });
}

const localRead = { networkMode: "always" } as const;

export const gitQueryOptions = {
  changes(git: GitBridge, resource: ThreadContext) {
    return queryOptions({
      queryKey: gitKeys.changes(resource),
      queryFn: ({ signal }) => readChanges(git, resource, signal),
      retry: readRetry,
      ...localRead,
    });
  },
  diff(
    git: GitBridge,
    resource: ThreadContext,
    scope: ChangeScope,
    path: string | undefined,
  ) {
    return queryOptions({
      queryKey: gitKeys.diff(resource, scope, path ?? null),
      queryFn: ({ signal }) =>
        path === undefined
          ? Promise.resolve(null)
          : readDiff(git, resource, scope, path, signal),
      retry: readRetry,
      enabled: path !== undefined,
      ...localRead,
    });
  },
} as const;

export function useChanges({
  git,
  resource,
}: {
  git: GitBridge;
  resource: ThreadContext;
}) {
  return useQuery(gitQueryOptions.changes(git, resource));
}

export function useDiff({
  git,
  resource,
  scope,
  path,
}: {
  git: GitBridge;
  resource: ThreadContext;
  scope: ChangeScope;
  path: string | undefined;
}) {
  return useQuery(gitQueryOptions.diff(git, resource, scope, path));
}
