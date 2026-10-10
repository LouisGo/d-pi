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
