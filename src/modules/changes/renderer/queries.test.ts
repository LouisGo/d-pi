import {
  onlineManager,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { expect, it } from "vitest";
import { ThreadContextSchema } from "../../threads/contracts/public";
import type { GitBridge, GitReply, GitRequest } from "../contracts/public";
import { gitQueryOptions, refreshGit } from "./queries";

const resource = ThreadContextSchema.parse({
  threadId: crypto.randomUUID(),
  workingDirectoryId: crypto.randomUUID(),
  directory: "/fixture/project",
});

it("isolates Git snapshots by working directory identity and path with stable resource keys", async () => {
  const client_ = client();
  let repository = "first";
  const bridge: SampleGitBridge = {
    request: () => Promise.resolve(changes(repository)),
  };
  const fetch = (context: typeof resource) =>
    client_.fetchQuery({
      ...gitQueryOptions.changes(wireBridge(bridge), context),
      staleTime: Infinity,
    });
  await fetch(resource);
  repository = "second directory";
  const directory = { ...resource, directory: "/second" };
  expect(await fetch(directory)).toMatchObject({ repository });
  repository = "second working directory";
  expect(
    await fetch(
      ThreadContextSchema.parse({
        ...directory,
        workingDirectoryId: crypto.randomUUID(),
      }),
    ),
  ).toMatchObject({ repository });
  expect(await fetch({ ...resource })).toMatchObject({ repository: "first" });
  client_.clear();
});

it("never sends an unselected Git diff through fetchQuery or refetch", async () => {
  const client_ = client();
  let requests = 0;
  const bridge: SampleGitBridge = {
    request: () => {
      requests += 1;
      return Promise.resolve({ kind: "unavailable", reason: "missing" });
    },
  };
  const options = gitQueryOptions.diff(
    wireBridge(bridge),
    resource,
    "index-worktree",
    undefined,
  );
  await client_.fetchQuery(options);
  const observer = new QueryObserver(client_, options);
  const release = observer.subscribe(() => {});
  const result = await observer.refetch();
  expect(requests).toBe(0);
  expect(result.data).toBeNull();
  release();
  client_.clear();
});

it("retains a failed Git sample's trace and reply with unknown attribution", async () => {
  const client_ = client();
  const failed: GitReply = { kind: "unavailable", reason: "failed" };
  let requestedTrace: string | undefined;
  const bridge: SampleGitBridge = {
    request: (request) => {
      requestedTrace = request.traceId;
      return Promise.resolve(failed);
    },
  };
  const result = await new QueryObserver(
    client_,
    gitQueryOptions.diff(
      wireBridge(bridge),
      resource,
      "index-worktree",
      "broken.ts",
    ),
  ).refetch();
  expect(result.error).toMatchObject({
    traceId: requestedTrace,
    operation: "git:diff",
    attribution: "unknown",
    reply: failed,
  });
  client_.clear();
});

const changes = (repository: string): GitReply => ({
  kind: "changes",
  repository,
  head: null,
  capturedAt: "2026-09-30T00:00:00.000Z",
  coverage: "project-paths-current-sample",
  entries: [],
  truncated: false,
});

const diff = (
  scope: Extract<GitReply, { kind: "diff" }>["scope"],
  path: string,
): GitReply => ({
  kind: "diff",
  repository: "fixture",
  head: null,
  path,
  scope,
  capturedAt: "2026-09-30T00:00:00.000Z",
  coverage: "single-file-current-sample",
  left: { kind: "absent", source: "HEAD" },
  right: { kind: "absent", source: "working tree" },
});

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
}

it("runs local Git reads while Query reports the renderer offline", async () => {
  const client_ = client();
  let requests = 0;
  const bridge: SampleGitBridge = {
    request: () => {
      requests += 1;
      return Promise.resolve({ kind: "unavailable", reason: "not-git" });
    },
  };
  const wasOnline = onlineManager.isOnline();
  onlineManager.setOnline(false);
  try {
    const observer = new QueryObserver(
      client_,
      gitQueryOptions.changes(wireBridge(bridge), resource),
    );
    const release = observer.subscribe(() => {});
    await observer.refetch();
    expect(requests).toBe(1);
    expect(observer.getCurrentResult().data).toEqual({
      kind: "unavailable",
      reason: "not-git",
    });
    expect(observer.getCurrentResult().isError).toBe(false);
    release();
  } finally {
    onlineManager.setOnline(wasOnline);
    client_.clear();
  }
});

it("keeps Git diff selections in separate cache entries", async () => {
  const client_ = client();
  const bridge: SampleGitBridge = {
    request: (command) =>
      Promise.resolve(
        command.kind === "diff"
          ? diff(command.scope, command.path)
          : changes("unused"),
      ),
  };
  const first = new QueryObserver(
    client_,
    gitQueryOptions.diff(
      wireBridge(bridge),
      resource,
      "index-worktree",
      "a.ts",
    ),
  );
  const second = new QueryObserver(
    client_,
    gitQueryOptions.diff(wireBridge(bridge), resource, "untracked", "b.ts"),
  );
  const releaseFirst = first.subscribe(() => {});
  const releaseSecond = second.subscribe(() => {});
  await first.refetch();
  await second.refetch();
  expect(first.getCurrentResult().data).toMatchObject({
    kind: "diff",
    scope: "index-worktree",
    path: "a.ts",
  });
  expect(second.getCurrentResult().data).toMatchObject({
    kind: "diff",
    scope: "untracked",
    path: "b.ts",
  });
  releaseFirst();
  releaseSecond();
  client_.clear();
});

it("invalidates the active Git thread scope and samples again", async () => {
  const client_ = client();
  let index = 0;
  const bridge: SampleGitBridge = {
    request: () => Promise.resolve(changes(`sample-${++index}`)),
  };
  const observer = new QueryObserver(
    client_,
    gitQueryOptions.changes(wireBridge(bridge), resource),
  );
  const release = observer.subscribe(() => {});
  await observer.refetch();
  expect(observer.getCurrentResult().data).toMatchObject({
    repository: "sample-1",
  });
  refreshGit(client_, resource);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(index).toBe(2);
  expect(observer.getCurrentResult().data).toMatchObject({
    repository: "sample-2",
  });
  release();
  client_.clear();
});

it("retries a failed Git sample but keeps a Git conclusion terminal", async () => {
  const client_ = new QueryClient({
    defaultOptions: { queries: { retry: 2, retryDelay: 0 } },
  });
  let sampleAttempts = 0;
  const flaky: GitBridge = {
    request: async (command) => {
      sampleAttempts += 1;
      return sampleAttempts === 1
        ? {
            kind: "failed",
            error: {
              operationId: command.operationId,
              traceId: command.traceId,
              code: "process-exit",
              retryable: true,
              attribution: "main",
            },
          }
        : {
            kind: "completed",
            operationId: command.operationId,
            traceId: command.traceId,
            reply: changes("recovered"),
          };
    },
    cancel: async (identity) => ({ kind: "acknowledged", ...identity }),
  };
  const list = new QueryObserver(
    client_,
    gitQueryOptions.changes(wireBridge(flaky), resource),
  );
  const releaseList = list.subscribe(() => {});
  await list.refetch();
  expect(sampleAttempts).toBe(2);
  expect(list.getCurrentResult().data).toMatchObject({
    repository: "recovered",
  });

  let conclusionAttempts = 0;
  const notRepository: SampleGitBridge = {
    request: () => {
      conclusionAttempts += 1;
      return Promise.resolve({
        kind: "unavailable",
        reason: "not-git",
      } as GitReply);
    },
  };
  // Separate Thread key: the first observer's entry is cached on the shared one.
  const conclusion = new QueryObserver(
    client_,
    gitQueryOptions.changes(
      wireBridge(notRepository),
      ThreadContextSchema.parse({ ...resource, threadId: crypto.randomUUID() }),
    ),
  );
  const releaseConclusion = conclusion.subscribe(() => {});
  await conclusion.refetch();
  expect(conclusionAttempts).toBe(1);
  expect(conclusion.getCurrentResult().isError).toBe(false);

  releaseList();
  releaseConclusion();
  client_.clear();
});

type SampleGitBridge = { request: (command: GitRequest) => Promise<GitReply> };
function wireBridge(bridge: SampleGitBridge | GitBridge): GitBridge {
  return {
    async request(command) {
      const result = await bridge.request(command);
      return result.kind === "completed" ||
        result.kind === "cancelled" ||
        result.kind === "failed"
        ? result
        : {
            kind: "completed",
            operationId: command.operationId,
            traceId: command.traceId,
            reply: result,
          };
    },
    cancel: (command) =>
      "cancel" in bridge
        ? bridge.cancel(command)
        : Promise.resolve({ kind: "acknowledged", ...command }),
  };
}
