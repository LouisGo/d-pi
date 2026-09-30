import {
  onlineManager,
  QueryClient,
  QueryObserver,
  type QueryObserverResult,
} from "@tanstack/react-query";
import { expect, it } from "vitest";
import { ThreadContextSchema } from "../../workspace/contracts/public";
import type { FileBridge, FileReply } from "../contracts/public";
import { fileKeys, fileQueryOptions, refreshFiles } from "./queries";

const resource = ThreadContextSchema.parse({
  threadId: crypto.randomUUID(),
  workspaceId: crypto.randomUUID(),
  directory: "/fixture/project",
});

it("isolates snapshots by the actual workspace and directory, while ignoring bridge object identity", async () => {
  const client_ = client();
  let current = "first";
  let requests = 0;
  const createBridge = (): FileBridge => ({
    request: () => {
      requests += 1;
      return Promise.resolve(text("same.ts", current));
    },
  });
  const first = createBridge();
  const fetch = (context: typeof resource, bridge = first) =>
    client_.fetchQuery({
      ...fileQueryOptions.content(bridge, context, "same.ts"),
      staleTime: Infinity,
    });
  await fetch(resource);
  current = "second directory";
  const directory = { ...resource, directory: "/second" };
  expect(await fetch(directory)).toMatchObject({ text: current });
  current = "second workspace";
  const workspace = ThreadContextSchema.parse({
    ...directory,
    workspaceId: crypto.randomUUID(),
  });
  expect(await fetch(workspace)).toMatchObject({ text: current });
  expect(requests).toBe(3);
  expect(await fetch({ ...resource }, createBridge())).toMatchObject({
    text: "first",
  });
  expect(requests).toBe(3);
  client_.clear();
});

it("never sends an unselected file read through fetchQuery or refetch", async () => {
  const client_ = client();
  let requests = 0;
  const bridge: FileBridge = {
    request: () => {
      requests += 1;
      return Promise.resolve({ kind: "unavailable", reason: "not-file" });
    },
  };
  const options = fileQueryOptions.content(bridge, resource, undefined);
  await client_.fetchQuery(options);
  const observer = new QueryObserver(client_, options);
  const release = observer.subscribe(() => {});
  const result = await observer.refetch();
  expect(requests).toBe(0);
  expect(result.data).toBeNull();
  release();
  client_.clear();
});

it("retains the request trace and original failed sample without inventing attribution", async () => {
  const client_ = client();
  let requestedTrace: string | undefined;
  const failed: FileReply = { kind: "unavailable", reason: "failed" };
  const bridge: FileBridge = {
    request: (request) => {
      requestedTrace = request.traceId;
      return Promise.resolve(failed);
    },
  };
  const observer = new QueryObserver(
    client_,
    fileQueryOptions.content(bridge, resource, "broken.ts"),
  );
  const result: QueryObserverResult = await observer.refetch();
  expect(result.error).toMatchObject({
    traceId: requestedTrace,
    operation: "files:read",
    attribution: "unknown",
    reply: failed,
  });
  client_.clear();
});

it("retains the actual bridge rejection as cause with the request identity", async () => {
  const client_ = client();
  const cause = Error("fixture bridge disconnected");
  let requestedTrace: string | undefined;
  const bridge: FileBridge = {
    request: (request) => {
      requestedTrace = request.traceId;
      return Promise.reject(cause);
    },
  };
  const result = await new QueryObserver(
    client_,
    fileQueryOptions.content(bridge, resource, "disconnected.ts"),
  ).refetch();
  expect(result.error).toMatchObject({
    traceId: requestedTrace,
    operation: "files:read",
    attribution: "unknown",
    cause,
  });
  client_.clear();
});

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
    fileQueryOptions.content(bridge, resource, "fast.ts"),
  );
  const slow = new QueryObserver(
    client_,
    fileQueryOptions.content(bridge, resource, "slow.ts"),
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
    client_.getQueryData(fileKeys.content(resource, "fast.ts")),
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
    fileQueryOptions.content(bridge, resource, "gone.ts"),
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
    fileQueryOptions.listing(bridge, resource, ""),
  );
  const release = observer.subscribe(() => {});
  await observer.refetch();
  expect(observer.getCurrentResult().data).toMatchObject({
    entries: [{ path: "a.ts" }],
  });
  refreshFiles(client_, resource);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(index).toBe(2);
  expect(observer.getCurrentResult().data).toMatchObject({ entries: [] });
  release();
  client_.clear();
});

it("does not serve a cached listing from another thread", async () => {
  const client_ = client();
  const other = ThreadContextSchema.parse({
    ...resource,
    threadId: crypto.randomUUID(),
  });
  const bridge: FileBridge = {
    request: ({ threadId: requested }) =>
      Promise.resolve(
        entries([requested === resource.threadId ? "1.ts" : "2.ts"]),
      ),
  };
  const first = new QueryObserver(
    client_,
    fileQueryOptions.listing(bridge, resource, ""),
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
      fileQueryOptions.listing(bridge, resource, ""),
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
    fileQueryOptions.content(bridge, resource, "flaky.ts"),
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
    fileQueryOptions.content(bridge, resource, "broken.ts"),
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
    fileQueryOptions.content(bridge, resource, "denied.ts"),
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
