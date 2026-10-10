import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { HistoryBridge } from "../../src/modules/conversation/contracts/public";
import {
  refreshSavedConversation,
  savedConversationQuery,
} from "../../src/modules/conversation/core/public";
import { readNativeHistory } from "../../src/modules/conversation/main/native-history";

it("refreshes loaded JSONL pages from the committed tail without rereading cached bodies", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-cache-"));
  const threadId = crypto.randomUUID();
  mkdirSync(join(root, threadId));
  const sessionFile = join(root, threadId, "session.jsonl");
  const binding = {
    threadId,
    sessionFile,
    sessionId: "session",
    configContextId: "fixture",
  };
  const record = (id: string, content = "x".repeat(1000)) =>
    JSON.stringify({
      type: "message",
      id,
      parentId: null,
      message: { role: "assistant", content },
    });
  const body =
    [
      JSON.stringify({ type: "session", version: 3, id: "session" }),
      ...Array.from({ length: 1100 }, (_, index) => record(String(index))),
    ].join("\n") + "\n";
  writeFileSync(sessionFile, body);
  const client = new QueryClient();
  const read = vi.fn<HistoryBridge["read"]>((_, cursor) =>
    readNativeHistory(root, binding, cursor),
  );
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
    const loaded = await client.fetchInfiniteQuery({ ...options, pages: 2 });
    expect(loaded.pages).toHaveLength(2);
    const original = loaded.pages[0];
    read.mockClear();
    appendFileSync(sessionFile, record("appended", "new output") + "\n");
    await refreshSavedConversation(client, bridge, threadId);
    expect(read).toHaveBeenCalledOnce();
    expect(read.mock.calls[0]?.[1]?.offset).toBe(Buffer.byteLength(body));
    const refreshed = client.getQueryData<typeof loaded>(options.queryKey);
    if (!refreshed) throw Error("expected cached history");
    expect(refreshed.pages[0]).toBe(original);
    expect(
      refreshed.pages.flatMap((page) =>
        page.kind === "page" ? page.entries : [],
      ),
    ).toHaveLength(1101);
    appendFileSync(sessionFile, record("appended", "duplicate") + "\n");
    await refreshSavedConversation(client, bridge, threadId);
    const deduped = client.getQueryData<typeof loaded>(options.queryKey);
    expect(
      deduped?.pages.flatMap((page) =>
        page.kind === "page" ? page.entries : [],
      ),
    ).toHaveLength(1101);
    writeFileSync(
      `${sessionFile}.replacement`,
      JSON.stringify({ type: "session", version: 3, id: "session" }) +
        "\n" +
        record("replacement", "only replacement") +
        "\n",
    );
    renameSync(`${sessionFile}.replacement`, sessionFile);
    await refreshSavedConversation(client, bridge, threadId);
    const reset = client.getQueryData<typeof loaded>(options.queryKey);
    expect(reset?.pages).toHaveLength(1);
    expect(
      reset?.pages.flatMap((page) =>
        page.kind === "page" ? page.entries : [],
      ),
    ).toMatchObject([{ id: "replacement", text: "only replacement" }]);
  } finally {
    client.clear();
    rmSync(root, { recursive: true, force: true });
  }
});

it("keeps the verified JSONL prefix readable when a newly committed record is invalid", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-invalid-tail-"));
  const threadId = crypto.randomUUID();
  mkdirSync(join(root, threadId));
  const sessionFile = join(root, threadId, "session.jsonl");
  const binding = {
    threadId,
    sessionFile,
    sessionId: "session",
    configContextId: "fixture",
  };
  const record = (id: string, content: string) =>
    JSON.stringify({
      type: "message",
      id,
      parentId: null,
      message: { role: "assistant", content },
    });
  const committed =
    JSON.stringify({ type: "session", version: 3, id: "session" }) +
    "\n" +
    record("one", "verified prefix") +
    "\n";
  writeFileSync(sessionFile, committed);
  const client = new QueryClient();
  const read = vi.fn<HistoryBridge["read"]>((_, cursor) =>
    readNativeHistory(root, binding, cursor),
  );
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
    const loaded = await client.fetchInfiniteQuery(options);
    const cursor =
      loaded.pages[0]?.kind === "page"
        ? loaded.pages[0].continuation
        : undefined;
    if (!cursor) throw Error("expected committed continuation");
    read.mockClear();
    appendFileSync(sessionFile, "{invalid appended record}\n");
    expect(await refreshSavedConversation(client, bridge, threadId)).toEqual({
      kind: "unavailable",
      reason: "invalid",
    });
    expect(client.getQueryData(options.queryKey)).toBe(loaded);
    // Repair only the suffix; the same bound file and committed prefix remain.
    writeFileSync(
      sessionFile,
      committed + record("two", "repaired tail") + "\n",
    );
    await refreshSavedConversation(client, bridge, threadId);
    expect(read.mock.calls.map((call) => call[1])).toEqual([
      { ...cursor, append: true },
      { ...cursor, append: true },
    ]);
    const recovered = client.getQueryData<typeof loaded>(options.queryKey);
    expect(
      recovered?.pages.flatMap((page) =>
        page.kind === "page" ? page.entries : [],
      ),
    ).toMatchObject([
      { id: "one", text: "verified prefix" },
      { id: "two", text: "repaired tail" },
    ]);
  } finally {
    client.clear();
    rmSync(root, { recursive: true, force: true });
  }
});
