import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { HistoryBridge, HistoryPage } from "../contracts/public";
import { boundHistoryPageQuery } from "./history-queries";

it("keeps a same-cursor retry's busy/data ownership when an old unmounted read returns", async () => {
  const gates: ((page: HistoryPage) => void)[] = [];
  const bridge: HistoryBridge = {
    projectList: async () => ({
      kind: "catalog",
      sessions: [],
      partial: false,
    }),
    projectRead: async () => ({ kind: "unavailable", reason: "missing" }),
    read: vi.fn(
      () => new Promise<HistoryPage>((resolve) => gates.push(resolve)),
    ),
  };
  const client = new QueryClient();
  const firstOptions = boundHistoryPageQuery(bridge, "thread", {
    id: "first",
    cursor: null,
  });
  const first = new QueryObserver(client, firstOptions);
  const stopFirst = first.subscribe(() => {});
  await vi.waitFor(() => expect(gates).toHaveLength(1));
  stopFirst();
  const current = new QueryObserver(
    client,
    boundHistoryPageQuery(bridge, "thread", { id: "retry", cursor: null }),
  );
  const stopCurrent = current.subscribe(() => {});
  try {
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    const page = (text: string): HistoryPage => ({
      kind: "page",
      entries: [{ id: text, parentId: null, role: "user", text }],
      source: text,
      next: null,
      coverage: "append-order",
      incompleteTail: false,
      omitted: 0,
    });
    gates[0]?.(page("old"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(current.getCurrentResult().isFetching).toBe(true);
    expect(current.getCurrentResult().data).toBeUndefined();
    expect(client.getQueryData(firstOptions.queryKey)).toBeUndefined();
    gates[1]?.(page("new"));
    await vi.waitFor(() =>
      expect(current.getCurrentResult().data).toEqual(page("new")),
    );
    expect(current.getCurrentResult().isFetching).toBe(false);
    expect(bridge.read).toHaveBeenCalledTimes(2);
  } finally {
    stopCurrent();
    client.clear();
  }
});
