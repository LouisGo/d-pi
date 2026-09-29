import {
  onlineManager,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { expect, it } from "vitest";
import type { FileBridge, FileReply } from "../contracts/public";
import { fileKeys, fileQueryOptions, refreshFiles } from "./queries";

const threadId = crypto.randomUUID();

const text = (path: string, value: string): FileReply => ({
  kind: "text",
  path,
  text: value,
  bytes: value.length,
  version: "v1",
  capturedAt: "2026-09-29T00:00:00.000Z",
  coverage: "complete",
});

const entries = (paths: string[]): FileReply => ({
  kind: "entries",
  path: "",
  entries: paths.map((path) => ({
    path,
    name: path,
    kind: "file" as const,
  })),
  truncated: false,
});

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

it("keeps concurrent paths in separate cache entries so a late reply cannot overwrite the view", async () => {
  const client_ = client();
  let finishSlow: (reply: FileReply) => void = () => {};
  const bridge: FileBridge = {
    request: ({ path }) =>
      path === "slow.ts"
        ? new Promise<FileReply>((accept) => {
            finishSlow = accept;
          })
        : Promise.resolve(text(path, "fast")),
  };
  const fast = new QueryObserver(
    client_,
    fileQueryOptions.content(bridge, threadId, "fast.ts"),
  );
  const slow = new QueryObserver(
    client_,
    fileQueryOptions.content(bridge, threadId, "slow.ts"),
  );
  const releaseFast = fast.subscribe(() => {});
  const releaseSlow = slow.subscribe(() => {});
  await fast.refetch();
  const slowRun = slow.refetch();
  finishSlow(text("slow.ts", "slow"));
  await slowRun;
  expect(fast.getCurrentResult().data).toMatchObject({ text: "fast" });
  expect(slow.getCurrentResult().data).toMatchObject({ text: "slow" });
  expect(
    client_.getQueryData(fileKeys.content(threadId, "fast.ts")),
  ).toMatchObject({ text: "fast" });
  releaseFast();
  releaseSlow();
  client_.clear();
});

it("treats a business unavailable reply as data rather than a retryable failure", async () => {
  const client_ = client();
  let attempts = 0;
  const bridge: FileBridge = {
    request: () => {
      attempts += 1;
      return Promise.resolve({ kind: "unavailable", reason: "missing" });
    },
  };
  const observer = new QueryObserver(
    client_,
    fileQueryOptions.content(bridge, threadId, "gone.ts"),
  );
  const release = observer.subscribe(() => {});
  await observer.refetch();
  const result = observer.getCurrentResult();
  expect(attempts).toBe(1);
  expect(result.isSuccess).toBe(true);
  expect(result.data).toEqual({ kind: "unavailable", reason: "missing" });
  expect(result.isError).toBe(false);
  release();
  client_.clear();
});

it("invalidating the thread scope makes an active query sample the source again", async () => {
  const client_ = client();
  const replies = [entries(["a.ts"]), entries([])];
  let index = 0;
  const bridge: FileBridge = {
    request: () => {
      const reply = replies[Math.min(index, replies.length - 1)];
      index += 1;
      if (!reply) throw Error("missing fixture");
      return Promise.resolve(reply);
    },
  };
  const observer = new QueryObserver(
    client_,
    fileQueryOptions.listing(bridge, threadId, ""),
  );
  const release = observer.subscribe(() => {});
  await observer.refetch();
  expect(observer.getCurrentResult().data).toMatchObject({
    entries: [{ path: "a.ts" }],
  });
  refreshFiles(client_, threadId);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(index).toBe(2);
  expect(observer.getCurrentResult().data).toMatchObject({ entries: [] });
  release();
  client_.clear();
});

it("does not serve a cached listing from another thread", async () => {
  const client_ = client();
  const other = crypto.randomUUID();
  const bridge: FileBridge = {
    request: ({ threadId: requested }) =>
      Promise.resolve(entries([requested === threadId ? "1.ts" : "2.ts"])),
  };
  const first = new QueryObserver(
    client_,
    fileQueryOptions.listing(bridge, threadId, ""),
  );
  const second = new QueryObserver(
    client_,
    fileQueryOptions.listing(bridge, other, ""),
  );
  const releaseFirst = first.subscribe(() => {});
  const releaseSecond = second.subscribe(() => {});
  await first.refetch();
  await second.refetch();
  expect(first.getCurrentResult().data).toMatchObject({
    entries: [{ path: "1.ts" }],
  });
  expect(second.getCurrentResult().data).toMatchObject({
    entries: [{ path: "2.ts" }],
  });
  releaseFirst();
  releaseSecond();
  client_.clear();
});

it("runs local file reads while Query reports the renderer offline", async () => {
  const client_ = client();
  let requests = 0;
  const bridge: FileBridge = {
    request: () => {
      requests += 1;
      return Promise.resolve(entries(["offline.ts"]));
    },
  };
  const wasOnline = onlineManager.isOnline();
  onlineManager.setOnline(false);
  try {
    const observer = new QueryObserver(
      client_,
      fileQueryOptions.listing(bridge, threadId, ""),
    );
    const release = observer.subscribe(() => {});
    await observer.refetch();
    expect(requests).toBe(1);
    expect(observer.getCurrentResult().isSuccess).toBe(true);
    release();
  } finally {
    onlineManager.setOnline(wasOnline);
    client_.clear();
  }
});

it("retries a transient sampling failure instead of treating it as a terminal result", async () => {
  const client_ = new QueryClient({
    defaultOptions: { queries: { retry: 2, retryDelay: 0 } },
  });
  let attempts = 0;
  const bridge: FileBridge = {
    request: () => {
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? { kind: "unavailable", reason: "failed" }
          : text("flaky.ts", "eventually"),
      );
    },
  };
  const observer = new QueryObserver(
    client_,
    fileQueryOptions.content(bridge, threadId, "flaky.ts"),
  );
  const release = observer.subscribe(() => {});
  await observer.refetch();
  expect(attempts).toBe(2);
  expect(observer.getCurrentResult().data).toMatchObject({
    text: "eventually",
  });
  expect(observer.getCurrentResult().isError).toBe(false);
  release();
  client_.clear();
});

it("stops retrying a sampling failure once the attempts are exhausted", async () => {
  const client_ = new QueryClient({
    defaultOptions: { queries: { retry: 2, retryDelay: 0 } },
  });
  let attempts = 0;
  const bridge: FileBridge = {
    request: () => {
      attempts += 1;
      return Promise.resolve({ kind: "unavailable", reason: "failed" });
    },
  };
  const observer = new QueryObserver(
    client_,
    fileQueryOptions.content(bridge, threadId, "broken.ts"),
  );
  const release = observer.subscribe(() => {});
  await observer.refetch();
  expect(attempts).toBe(3);
  expect(observer.getCurrentResult().isError).toBe(true);
  release();
  client_.clear();
});

it("keeps a business unavailable reason as a single terminal sample", async () => {
  const client_ = new QueryClient({
    defaultOptions: { queries: { retry: 2, retryDelay: 0 } },
  });
  let attempts = 0;
  const bridge: FileBridge = {
    request: () => {
      attempts += 1;
      return Promise.resolve({ kind: "unavailable", reason: "denied" });
    },
  };
  const observer = new QueryObserver(
    client_,
    fileQueryOptions.content(bridge, threadId, "denied.ts"),
  );
  const release = observer.subscribe(() => {});
  await observer.refetch();
  expect(attempts).toBe(1);
  expect(observer.getCurrentResult().data).toEqual({
    kind: "unavailable",
    reason: "denied",
  });
  expect(observer.getCurrentResult().isError).toBe(false);
  release();
  client_.clear();
});
