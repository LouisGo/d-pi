import { onlineManager, QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { ThreadIdSchema } from "../../../shared/identity";
import { answerHistoryPageQuery } from "./answer-history-queries";

it("reads a bounded page while offline, isolates Thread/cursor identity and makes an unselected explicit fetch inert", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const bridge = {
    request: vi.fn(async () => ({
      threadId,
      source: "app-observed" as const,
      entries: [],
      cursor: null,
    })),
  };
  const client = new QueryClient();
  const online = onlineManager.isOnline();
  onlineManager.setOnline(false);
  try {
    expect(
      await client.fetchQuery(answerHistoryPageQuery(bridge, null, null)),
    ).toBeNull();
    expect(bridge.request).not.toHaveBeenCalled();
    const page = await client.fetchQuery(
      answerHistoryPageQuery(bridge, threadId, 41),
    );
    expect(page?.source).toBe("app-observed");
    expect(bridge.request).toHaveBeenCalledWith({
      threadId,
      cursor: 41,
      traceId: expect.any(String),
    });
    expect(answerHistoryPageQuery(bridge, threadId, null).queryKey).not.toEqual(
      answerHistoryPageQuery(bridge, threadId, 41).queryKey,
    );
    expect(answerHistoryPageQuery(bridge, threadId, 41).networkMode).toBe(
      "always",
    );
    expect(answerHistoryPageQuery(bridge, threadId, 41).gcTime).toBe(0);
  } finally {
    client.clear();
    onlineManager.setOnline(online);
  }
});
it("retains the failed read trace and does not accept a foreign Thread page", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const bridge = {
    request: vi.fn(async () => ({
      threadId: ThreadIdSchema.parse(crypto.randomUUID()),
      source: "app-observed" as const,
      entries: [],
      cursor: null,
    })),
  };
  const client = new QueryClient();
  try {
    await expect(
      client.fetchQuery(answerHistoryPageQuery(bridge, threadId, null)),
    ).rejects.toMatchObject({
      traceId: expect.any(String),
      operation: "runtime:answer-history",
    });
    expect(bridge.request).toHaveBeenCalledTimes(1);
  } finally {
    client.clear();
  }
});
