import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it } from "vitest";
import type { FileBridge, FileReply } from "../contracts/public";
import { fileKeys, listDirectory, readFile, refreshFiles } from "./queries";

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
  const fast = new QueryObserver(client_, {
    queryKey: fileKeys.content(threadId, "fast.ts"),
    queryFn: () => readFile(bridge, threadId, "fast.ts"),
  });
  const slow = new QueryObserver(client_, {
    queryKey: fileKeys.content(threadId, "slow.ts"),
    queryFn: () => readFile(bridge, threadId, "slow.ts"),
  });
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
  const observer = new QueryObserver(client_, {
    queryKey: fileKeys.content(threadId, "gone.ts"),
    queryFn: () => readFile(bridge, threadId, "gone.ts"),
  });
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
  const observer = new QueryObserver(client_, {
    queryKey: fileKeys.listing(threadId, ""),
    queryFn: () => listDirectory(bridge, threadId, ""),
  });
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
  const first = new QueryObserver(client_, {
    queryKey: fileKeys.listing(threadId, ""),
    queryFn: () => listDirectory(bridge, threadId, ""),
  });
  const second = new QueryObserver(client_, {
    queryKey: fileKeys.listing(other, ""),
    queryFn: () => listDirectory(bridge, other, ""),
  });
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
