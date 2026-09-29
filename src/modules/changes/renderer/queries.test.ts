import {
  onlineManager,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { expect, it } from "vitest";
import type { GitBridge, GitReply } from "../contracts/public";
import { gitQueryOptions, refreshGit } from "./queries";

const threadId = crypto.randomUUID();

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
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

it("runs local Git reads while Query reports the renderer offline", async () => {
  const client_ = client();
  let requests = 0;
  const bridge: GitBridge = {
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
      gitQueryOptions.changes(bridge, threadId),
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
  const bridge: GitBridge = {
    request: (command) =>
      Promise.resolve(
        command.kind === "diff"
          ? diff(command.scope, command.path)
          : changes("unused"),
      ),
  };
  const first = new QueryObserver(
    client_,
    gitQueryOptions.diff(bridge, threadId, "index-worktree", "a.ts"),
  );
  const second = new QueryObserver(
    client_,
    gitQueryOptions.diff(bridge, threadId, "untracked", "b.ts"),
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
  const bridge: GitBridge = {
    request: () => Promise.resolve(changes(`sample-${++index}`)),
  };
  const observer = new QueryObserver(
    client_,
    gitQueryOptions.changes(bridge, threadId),
  );
  const release = observer.subscribe(() => {});
  await observer.refetch();
  expect(observer.getCurrentResult().data).toMatchObject({
    repository: "sample-1",
  });
  refreshGit(client_, threadId);
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
    request: () => {
      sampleAttempts += 1;
      return Promise.resolve(
        sampleAttempts === 1
          ? ({ kind: "unavailable", reason: "failed" } as GitReply)
          : changes("recovered"),
      );
    },
  };
  const list = new QueryObserver(
    client_,
    gitQueryOptions.changes(flaky, threadId),
  );
  const releaseList = list.subscribe(() => {});
  await list.refetch();
  expect(sampleAttempts).toBe(2);
  expect(list.getCurrentResult().data).toMatchObject({
    repository: "recovered",
  });

  let conclusionAttempts = 0;
  const notRepository: GitBridge = {
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
    gitQueryOptions.changes(notRepository, crypto.randomUUID()),
  );
  const releaseConclusion = conclusion.subscribe(() => {});
  await conclusion.refetch();
  expect(conclusionAttempts).toBe(1);
  expect(conclusion.getCurrentResult().isError).toBe(false);

  releaseList();
  releaseConclusion();
  client_.clear();
});
