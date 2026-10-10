import { isCancelledError, QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type {
  HistoryBridge,
  HistoryImageReply,
  HistoryPage,
} from "../contracts/public";
import { HistoryImageRequestSchema } from "../contracts/public";
import {
  nativeImageQuery,
  refreshSavedConversation,
  savedConversationQuery,
} from "./history-queries";

it("binds lazy image reads to the exact message source and drops a cancelled late reply", async () => {
  const client = new QueryClient();
  const threadId = crypto.randomUUID();
  const cursor = {
    threadId,
    source: "original-source",
    offset: 100,
    endOffset: 200,
    prefixHash: "a".repeat(64),
  };
  let finish: (reply: HistoryImageReply) => void = () => {};
  const image = vi.fn<NonNullable<HistoryBridge["image"]>>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const bridge: HistoryBridge = {
    image,
    read: async () => ({ kind: "unavailable", reason: "missing" }),
    projectRead: async () => ({ kind: "unavailable", reason: "missing" }),
    projectList: async () => ({
      kind: "catalog",
      sessions: [],
      partial: false,
    }),
  };
  const options = nativeImageQuery(
    bridge,
    threadId,
    cursor,
    "user-record",
    1,
    () => crypto.randomUUID(),
  );
  const pending = client.fetchQuery(options).catch((error) => error);
  await vi.waitFor(() => expect(image).toHaveBeenCalledOnce());
  const [actualThread, actualCursor, recordId, index, traceId] =
    image.mock.calls[0]!;
  expect(
    HistoryImageRequestSchema.parse({
      threadId: actualThread,
      cursor: actualCursor,
      recordId,
      index,
      traceId,
    }),
  ).toMatchObject({ threadId, cursor, recordId: "user-record", index: 1 });
  await client.cancelQueries({ queryKey: options.queryKey });
  finish({ kind: "image", dataUrl: "data:image/png;base64,AAAA" });
  expect(isCancelledError(await pending)).toBe(true);
  expect(client.getQueryData(options.queryKey)).toBeUndefined();
  expect(
    nativeImageQuery(
      bridge,
      threadId,
      { ...cursor, source: "replacement" },
      "user-record",
      1,
      () => crypto.randomUUID(),
    ).queryKey,
  ).not.toEqual(options.queryKey);
  client.clear();
});

it("drops cancelled and superseded append reads instead of overwriting refreshed pages", async () => {
  const client = new QueryClient();
  const threadId = crypto.randomUUID();
  const pending: ((page: HistoryPage) => void)[] = [];
  const bridge: HistoryBridge = {
    read: () => {
      return new Promise<HistoryPage>((resolve) => pending.push(resolve));
    },
    projectRead: async () => ({ kind: "unavailable", reason: "missing" }),
    projectList: async () => ({
      kind: "catalog",
      sessions: [],
      partial: false,
    }),
  };
  const options = savedConversationQuery(bridge, threadId);
  const controller = new AbortController();
  const cancelled = refreshSavedConversation(
    client,
    bridge,
    threadId,
    controller.signal,
  );
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  controller.abort();
  pending[0]?.({ kind: "unavailable", reason: "missing" });
  await cancelled;
  expect(client.getQueryData(options.queryKey)).toBeUndefined();
  const old = refreshSavedConversation(client, bridge, threadId);
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  const newer = refreshSavedConversation(client, bridge, threadId);
  await vi.waitFor(() => expect(pending).toHaveLength(3));
  pending[2]?.({ kind: "unavailable", reason: "unbound" });
  await newer;
  pending[1]?.({ kind: "unavailable", reason: "missing" });
  await old;
  expect(client.getQueryData(options.queryKey)).toMatchObject({
    pages: [{ kind: "unavailable", reason: "unbound" }],
  });
  client.clear();
});

it("extends partially loaded history without rereading the first loaded page", async () => {
  const client = new QueryClient();
  const threadId = crypto.randomUUID();
  const cursor = {
    threadId,
    source: "original",
    offset: 100,
    endOffset: 200,
    prefixHash: "a".repeat(64),
  };
  const read = vi.fn<HistoryBridge["read"]>().mockResolvedValue({
    kind: "page",
    source: "appended",
    entries: [],
    next: null,
    continuation: {
      ...cursor,
      source: "appended",
      offset: 250,
      endOffset: 250,
    },
    coverage: "append-order",
    incompleteTail: false,
    omitted: 0,
  });
  const bridge: HistoryBridge = {
    read,
    projectRead: async () => ({ kind: "unavailable", reason: "missing" }),
    projectList: async () => ({
      kind: "catalog",
      sessions: [],
      partial: false,
    }),
  };
  const options = savedConversationQuery(bridge, threadId);
  const first: HistoryPage = {
    kind: "page",
    source: "original",
    entries: [],
    next: cursor,
    continuation: cursor,
    coverage: "append-order",
    incompleteTail: false,
    omitted: 0,
  };
  client.setQueryData(options.queryKey, { pages: [first], pageParams: [null] });
  await refreshSavedConversation(client, bridge, threadId);
  expect(read).toHaveBeenCalledExactlyOnceWith(threadId, {
    ...cursor,
    append: true,
  });
  expect(client.getQueryData(options.queryKey)).toMatchObject({
    pages: [{ next: null, continuation: { source: "appended", offset: 250 } }],
  });
  client.clear();
});

it.each([
  "invalid",
  "missing",
  "denied",
  "unsupported",
  "cancelled",
  "unbound",
] as const)(
  "preserves readable pages after a %s append observation and retries only that tail",
  async (reason) => {
    const client = new QueryClient();
    const threadId = crypto.randomUUID();
    const cursor = { threadId, source: "saved", offset: 100, endOffset: 100 };
    const first: HistoryPage = {
      kind: "page",
      source: "saved",
      entries: [
        { id: "one", parentId: null, role: "assistant", text: "readable" },
      ],
      continuation: cursor,
      next: null,
      coverage: "append-order",
      incompleteTail: false,
      omitted: 0,
    };
    const unavailable = { kind: "unavailable", reason } as const;
    const read = vi
      .fn<HistoryBridge["read"]>()
      .mockResolvedValueOnce(unavailable)
      .mockResolvedValueOnce({
        ...first,
        entries: [
          { id: "two", parentId: "one", role: "assistant", text: "new tail" },
        ],
        continuation: { ...cursor, offset: 200, endOffset: 200 },
      });
    const bridge: HistoryBridge = {
      read,
      projectRead: async () => unavailable,
      projectList: async () => ({
        kind: "catalog",
        sessions: [],
        partial: false,
      }),
    };
    const options = savedConversationQuery(bridge, threadId);
    client.setQueryData(options.queryKey, {
      pages: [first],
      pageParams: [null],
    });
    const cached = client.getQueryData(options.queryKey);
    try {
      expect(await refreshSavedConversation(client, bridge, threadId)).toEqual(
        unavailable,
      );
      expect(client.getQueryData(options.queryKey)).toBe(cached);
      await refreshSavedConversation(client, bridge, threadId);
      expect(read.mock.calls).toEqual([
        [threadId, { ...cursor, append: true }],
        [threadId, { ...cursor, append: true }],
      ]);
      expect(client.getQueryData(options.queryKey)).toMatchObject({
        pages: [first, { entries: [{ id: "two", text: "new tail" }] }],
      });
    } finally {
      client.clear();
    }
  },
);

it("retries an unavailable next page from the last committed continuation instead of restarting the transcript", async () => {
  const client = new QueryClient();
  const threadId = crypto.randomUUID();
  const cursor = { threadId, source: "saved", offset: 100, endOffset: 200 };
  const first: HistoryPage = {
    kind: "page",
    source: "saved",
    entries: [
      { id: "one", parentId: null, role: "assistant", text: "readable" },
    ],
    continuation: cursor,
    next: cursor,
    coverage: "append-order",
    incompleteTail: false,
    omitted: 0,
  };
  const read = vi
    .fn<HistoryBridge["read"]>()
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce({ kind: "unavailable", reason: "invalid" })
    .mockResolvedValueOnce({
      ...first,
      entries: [
        { id: "two", parentId: "one", role: "assistant", text: "retried page" },
      ],
      next: null,
      continuation: { ...cursor, offset: 200 },
    });
  const bridge: HistoryBridge = {
    read,
    projectRead: async () => ({ kind: "unavailable", reason: "missing" }),
    projectList: async () => ({
      kind: "catalog",
      sessions: [],
      partial: false,
    }),
  };
  const options = savedConversationQuery(bridge, threadId);
  try {
    await client.fetchInfiniteQuery({ ...options, pages: 2 });
    await refreshSavedConversation(client, bridge, threadId);
    expect(read.mock.calls[2]).toEqual([threadId, { ...cursor, append: true }]);
    expect(client.getQueryData(options.queryKey)).toMatchObject({
      pages: [
        first,
        { kind: "page", entries: [{ id: "two", text: "retried page" }] },
      ],
      pageParams: [null, cursor],
    });
  } finally {
    client.clear();
  }
});
