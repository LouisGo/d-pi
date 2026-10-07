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

it.each([
  ["success", "before"],
  ["success", "after"],
  ["failure", "before"],
  ["failure", "after"],
] as const)(
  "ignores an old same-cursor %s settling %s the current attempt",
  async (outcome, order) => {
    const pending: {
      resolve: (page: HistoryPage) => void;
      reject: (error: Error) => void;
    }[] = [];
    const bridge: HistoryBridge = {
      projectList: async () => ({
        kind: "catalog",
        sessions: [],
        partial: false,
      }),
      projectRead: async () => ({ kind: "unavailable", reason: "missing" }),
      read: () =>
        new Promise<HistoryPage>((resolve, reject) =>
          pending.push({ resolve, reject }),
        ),
    };
    const client = new QueryClient();
    const first = new QueryObserver(
      client,
      boundHistoryPageQuery(bridge, "thread", { id: "old", cursor: null }),
    );
    const stopFirst = first.subscribe(() => {});
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    stopFirst();
    const current = new QueryObserver(
      client,
      boundHistoryPageQuery(bridge, "thread", { id: "new", cursor: null }),
    );
    const stopCurrent = current.subscribe(() => {});
    const result: HistoryPage = { kind: "unavailable", reason: "changed" };
    const old = () =>
      outcome === "failure"
        ? pending[0]?.reject(Error("old connection failed"))
        : pending[0]?.resolve({ kind: "unavailable", reason: "denied" });
    try {
      await vi.waitFor(() => expect(pending).toHaveLength(2));
      if (order === "before") {
        old();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(current.getCurrentResult().isFetching).toBe(true);
        expect(current.getCurrentResult().data).toBeUndefined();
        expect(current.getCurrentResult().isError).toBe(false);
      }
      pending[1]?.resolve(result);
      await vi.waitFor(() =>
        expect(current.getCurrentResult().data).toEqual(result),
      );
      if (order === "after") old();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(current.getCurrentResult().data).toEqual(result);
      expect(current.getCurrentResult().isFetching).toBe(false);
      expect(current.getCurrentResult().isError).toBe(false);
    } finally {
      stopCurrent();
      client.clear();
    }
  },
);
