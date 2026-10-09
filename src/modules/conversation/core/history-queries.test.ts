import { isCancelledError, QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { HistoryBridge, HistoryImageReply } from "../contracts/public";
import { HistoryImageRequestSchema } from "../contracts/public";
import { nativeImageQuery } from "./history-queries";

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
