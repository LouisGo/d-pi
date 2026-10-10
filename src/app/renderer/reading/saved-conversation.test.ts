// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type {
  ConversationEvent,
  HistoryBridge,
  HistoryPage,
} from "../../../modules/conversation/contracts/public";
import { ConversationModel } from "../../../modules/conversation/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { SavedConversation } from "./saved-conversation";

vi.mock("./markdown", () => ({
  Markdown: ({ text }: { text: string }) => createElement("p", null, text),
}));
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function mount(
  active = true,
  page?: HistoryPage,
  reader?: HistoryBridge["read"],
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let emit: ((event: ConversationEvent) => void) | undefined;
  const model = new ConversationModel({
    connect: (_id, listener) => {
      emit = listener;
      return () => {};
    },
  });
  model.connect("A");
  const bridge: HistoryBridge = {
    projectList: vi.fn(),
    projectRead: vi.fn(),
    read:
      reader ??
      vi.fn<HistoryBridge["read"]>(
        async (_id, cursor) =>
          page ?? {
            kind: "page",
            entries: [
              {
                id: cursor ? "two" : "one",
                parentId: null,
                role: "assistant",
                text: cursor ? "second saved message" : "first saved message",
              },
            ],
            source: "saved",
            coverage: "append-order",
            next: cursor
              ? null
              : { threadId: "A", source: "saved", offset: 100 },
            incompleteTail: false,
            omitted: 0,
          },
      ),
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  cleanups.push(async () => {
    await act(() => root.unmount());
    client.clear();
    model.dispose();
    container.remove();
  });
  const render = () =>
    act(() =>
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(I18nProvider, {
            initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
            children: createElement(SavedConversation, {
              model,
              bridge,
              threadId: "A",
              active,
            }),
          }),
        ),
      ),
    );
  await render();
  return {
    container,
    bridge,
    emit: (event: ConversationEvent) => emit?.(event),
    setActive: async (next: boolean) => {
      active = next;
      await render();
    },
    remount: async () => {
      await act(() => root.render(null));
      await render();
    },
  };
}
it("reuses fresh saved messages on return without another disk read or loading prose", async () => {
  const f = await mount(true, {
    kind: "page",
    entries: [
      { id: "one", parentId: null, role: "assistant", text: "cached message" },
    ],
    source: "saved",
    coverage: "append-order",
    next: null,
    incompleteTail: false,
    omitted: 0,
  });
  await vi.waitFor(() =>
    expect(f.container.textContent).toContain("cached message"),
  );
  expect(f.bridge.read).toHaveBeenCalledTimes(1);
  await f.remount();
  await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
  expect(f.bridge.read).toHaveBeenCalledTimes(1);
  expect(f.container.textContent).not.toContain("Reading native records");
  expect(
    f.container.querySelector('[data-slot="loading-indicator"]'),
  ).toBeNull();
});
it("does not re-read a cached transcript just because its existing live identities remount", async () => {
  const f = await mount(true, {
    kind: "page",
    entries: [
      { id: "one", parentId: null, role: "assistant", text: "cached message" },
    ],
    source: "saved",
    coverage: "append-order",
    next: null,
    incompleteTail: false,
    omitted: 0,
  });
  await vi.waitFor(() =>
    expect(f.container.textContent).toContain("cached message"),
  );
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "ready",
      seq: 1,
      gap: false,
      items: [
        {
          id: 1,
          nativeRecordId: "one",
          role: "assistant",
          state: "complete",
          label: { kind: "literal", text: "OMP" },
          text: "cached message",
        },
      ],
    }),
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
  const calls = vi.mocked(f.bridge.read).mock.calls.length;
  await f.remount();
  await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
  expect(f.bridge.read).toHaveBeenCalledTimes(calls);
  expect(f.container.textContent).toContain("cached message");
});
it("opens bound native messages directly without project selection, execute or a read click", async () => {
  const f = await mount();
  await vi.waitFor(async () => {
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(f.container.textContent).toContain("first saved message");
  });
  expect(f.bridge.read).toHaveBeenCalledWith("A", null);
  expect(f.bridge.projectList).not.toHaveBeenCalled();
  expect(f.container.textContent).not.toContain("Load history");
});
it("keeps pages adjacent in one transcript instead of replacing the previous messages", async () => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.cb(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
      unobserve() {}
    },
  );
  const f = await mount();
  await vi.waitFor(async () => {
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(f.container.textContent).toContain("second saved message");
  });
  expect(f.container.textContent).toContain("first saved message");
});
it("retains the same saved DOM and reading source when execution restores its native branch", async () => {
  const f = await mount();
  await vi.waitFor(async () => {
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(f.container.textContent).toContain("first saved message");
  });
  const row = f.container.querySelector("[data-reading-row=one]");
  const source = f.container
    .querySelector("[data-reading-source]")
    ?.getAttribute("data-reading-source");
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "generation",
      seq: 1,
      gap: false,
      items: [
        {
          id: 1,
          nativeRecordId: "one",
          restored: true,
          role: "assistant",
          state: "complete",
          label: { kind: "literal", text: "OMP" },
          text: "first saved message",
        },
      ],
    }),
  );
  expect(f.container.querySelector("[data-reading-row=one]")).toBe(row);
  expect(
    f.container
      .querySelector("[data-reading-source]")
      ?.getAttribute("data-reading-source"),
  ).toBe(source);
  expect(f.container.querySelectorAll("[data-reading-text]")).toHaveLength(1);
  expect(f.container.textContent).toContain("first saved message");
});
it("does not start a history read from a hidden inactive pane", async () => {
  const f = await mount(false);
  await act(() => new Promise((r) => setTimeout(r, 10)));
  expect(f.bridge.read).not.toHaveBeenCalled();
});

it("retains older saved records beyond the live projection window and appends only newly observed messages", async () => {
  const f = await mount();
  await vi.waitFor(async () => {
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(f.container.textContent).toContain("first saved message");
  });
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "g",
      seq: 1,
      gap: true,
      items: [
        {
          id: 500,
          nativeRecordId: "later",
          restored: true,
          role: "assistant",
          state: "complete",
          label: { kind: "literal", text: "OMP" },
          text: "unloaded restored row",
        },
        {
          id: 501,
          role: "assistant",
          state: "streaming",
          label: { kind: "literal", text: "OMP" },
          text: "new live answer",
        },
      ],
    }),
  );
  expect(f.container.textContent).toContain("first saved message");
  expect(f.container.textContent).toContain("new live answer");
  expect(f.container.textContent).not.toContain("unloaded restored row");
});

it("shows incomplete tail and omitted-record coverage with an explicit refresh", async () => {
  const f = await mount(true, {
    kind: "page",
    source: "saved",
    next: null,
    entries: [],
    omitted: 3,
    incompleteTail: true,
    coverage: "append-order",
  });
  await vi.waitFor(async () => {
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(f.container.textContent).toContain("still being written");
  });
  expect(f.container.textContent).toContain("3");
  const refresh = [...f.container.querySelectorAll("button")].find(
    (b) => b.textContent === "Refresh",
  );
  expect(refresh).toBeTruthy();
  await act(() => refresh?.click());
  expect(f.bridge.read).toHaveBeenCalledTimes(2);
});
it("clears incomplete-tail status after the frozen partial record is committed", async () => {
  vi.useFakeTimers();
  const original: HistoryPage = {
    kind: "page",
    source: "saved",
    coverage: "append-order",
    entries: [
      { id: "one", parentId: null, role: "assistant", text: "cached message" },
    ],
    next: null,
    continuation: { threadId: "A", source: "saved", offset: 100 },
    incompleteTail: true,
    omitted: 0,
  };
  const read = vi
    .fn<HistoryBridge["read"]>()
    .mockResolvedValueOnce(original)
    .mockResolvedValue({
      ...original,
      entries: [
        {
          id: "tail",
          parentId: null,
          role: "assistant",
          text: "completed tail",
        },
      ],
      continuation: { threadId: "A", source: "saved", offset: 200 },
      incompleteTail: false,
    });
  const f = await mount(true, undefined, read);
  await vi.waitFor(async () => {
    await flushRefreshUpdates();
    expect(f.container.textContent).toContain("cached message");
    expect(f.container.querySelector('[role="status"]')).not.toBeNull();
  });
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "committed-tail",
      seq: 1,
      gap: false,
      items: [],
    }),
  );
  await vi.waitFor(async () => {
    await flushRefreshUpdates();
    expect(f.container.textContent).toContain("completed tail");
    expect(f.container.querySelector('p[role="status"]')).toBeNull();
  });
  expect(f.container.textContent).toContain("cached message");
});
it("distinguishes a missing bound file from an empty new conversation", async () => {
  const f = await mount(true, { kind: "unavailable", reason: "missing" });
  await vi.waitFor(async () => {
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(f.container.textContent).toContain("Record missing");
  });
  expect(f.container.textContent).not.toContain("No messages yet");
});

it("keeps the complete saved body when the restored live projection is truncated", async () => {
  const f = await mount();
  await vi.waitFor(async () => {
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(f.container.textContent).toContain("first saved message");
  });
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "g",
      seq: 1,
      gap: true,
      items: [
        {
          id: 1,
          nativeRecordId: "one",
          restored: true,
          truncated: true,
          role: "assistant",
          state: "complete",
          label: { kind: "literal", text: "OMP" },
          text: "shortened",
        },
      ],
    }),
  );
  expect(f.container.textContent).toContain("first saved message");
  expect(f.container.textContent).not.toContain("shortened");
});
it("refreshes an initially unbound transcript after native persistence and retains a message evicted from live", async () => {
  let committed = false;
  const reader: HistoryBridge["read"] = vi.fn<HistoryBridge["read"]>(
    async () =>
      committed
        ? {
            kind: "page",
            source: "committed",
            coverage: "append-order",
            next: null,
            incompleteTail: false,
            omitted: 0,
            entries: [
              {
                id: "persisted",
                parentId: null,
                role: "assistant",
                text: "old persisted reply",
              },
            ],
          }
        : { kind: "unavailable", reason: "unbound" },
  );
  const f = await mount(true, undefined, reader);
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "g",
      seq: 1,
      gap: false,
      items: [
        {
          id: 1,
          nativeRecordId: "persisted",
          role: "assistant",
          state: "complete",
          label: { kind: "literal", text: "OMP" },
          text: "old persisted reply",
        },
      ],
    }),
  );
  committed = true;
  await vi.waitFor(async () => {
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(reader).toHaveBeenCalledTimes(2);
  });
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "g",
      seq: 2,
      gap: true,
      items: [
        {
          id: 1002,
          role: "assistant",
          state: "streaming",
          label: { kind: "literal", text: "OMP" },
          text: "current reply",
        },
      ],
    }),
  );
  expect(f.container.textContent).toContain("old persisted reply");
  expect(f.container.textContent).toContain("current reply");
});
it("keeps a live row, copy focus and selected text through native ID confirmation and saved refetch", async () => {
  let committed = false;
  const reader: HistoryBridge["read"] = vi.fn<HistoryBridge["read"]>(
    async () => ({
      kind: "page",
      source: "saved",
      coverage: "append-order",
      next: null,
      incompleteTail: false,
      omitted: 0,
      entries: committed
        ? [
            {
              id: "persisted",
              parentId: null,
              role: "assistant",
              text: "stable closed paragraph",
            },
          ]
        : [],
    }),
  );
  const f = await mount(true, undefined, reader);
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "g",
      seq: 1,
      gap: false,
      items: [
        {
          id: 1,
          role: "assistant",
          state: "streaming",
          label: { kind: "literal", text: "OMP" },
          text: "stable closed paragraph",
        },
      ],
    }),
  );
  const row = f.container.querySelector<HTMLElement>(".message");
  const text = row?.querySelector("[data-reading-text] p")?.firstChild;
  const button = row?.querySelector("button");
  if (!row || !text || !button) throw Error("missing live row");
  button.focus();
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 6);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  const rowId = row.dataset.readingRow;
  committed = true;
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "g",
      seq: 2,
      gap: false,
      items: [
        {
          id: 1,
          nativeRecordId: "persisted",
          role: "assistant",
          state: "complete",
          label: { kind: "literal", text: "OMP" },
          text: "stable closed paragraph",
        },
      ],
    }),
  );
  await vi.waitFor(async () => {
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(reader).toHaveBeenCalledTimes(2);
  });
  expect(f.container.querySelector(".message")).toBe(row);
  expect(row.dataset.readingRow).toBe(rowId);
  expect(document.activeElement).toBe(button);
  expect(text.isConnected).toBe(true);
  expect(selection?.toString()).toBe("stable");
});

async function flushRefreshUpdates() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150);
  });
}

it("retains cached history and exposes a retry after an incremental refresh transport failure", async () => {
  vi.useFakeTimers();
  const page: HistoryPage = {
    kind: "page",
    entries: [
      { id: "one", parentId: null, role: "assistant", text: "cached message" },
    ],
    source: "saved",
    coverage: "append-order",
    next: null,
    continuation: { threadId: "A", source: "saved", offset: 100 },
    incompleteTail: false,
    omitted: 0,
  };
  const read = vi
    .fn<HistoryBridge["read"]>()
    .mockResolvedValueOnce(page)
    .mockRejectedValueOnce(new Error("IPC transport lost"))
    .mockResolvedValue(page);
  const f = await mount(true, undefined, read);
  await vi.waitFor(async () => {
    await flushRefreshUpdates();
    expect(f.container.textContent).toContain("cached message");
  });
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "refresh-generation",
      seq: 1,
      gap: false,
      items: [],
    }),
  );
  await vi.waitFor(async () => {
    await flushRefreshUpdates();
    expect(f.container.querySelector('[role="alert"]')).not.toBeNull();
  });
  expect(f.container.textContent).toContain("cached message");
  const retry = f.container.querySelector<HTMLButtonElement>(
    '[role="alert"] button',
  );
  if (!retry) throw Error("expected retry button");
  await act(() => retry.click());
  await vi.waitFor(async () => {
    await flushRefreshUpdates();
    expect(read).toHaveBeenCalledTimes(3);
    expect(f.container.querySelector('[role="alert"]')).toBeNull();
  });
  expect(f.container.textContent).toContain("cached message");
});

it("does not publish a cancelled late refresh error over a newer successful generation", async () => {
  vi.useFakeTimers();
  const page: HistoryPage = {
    kind: "page",
    entries: [
      { id: "one", parentId: null, role: "assistant", text: "cached message" },
    ],
    source: "saved",
    coverage: "append-order",
    next: null,
    continuation: { threadId: "A", source: "saved", offset: 100 },
    incompleteTail: false,
    omitted: 0,
  };
  let rejectLate: (cause: unknown) => void = () => {};
  const late = new Promise<HistoryPage>((_resolve, reject) => {
    rejectLate = reject;
  });
  const read = vi
    .fn<HistoryBridge["read"]>()
    .mockResolvedValueOnce(page)
    .mockReturnValueOnce(late)
    .mockResolvedValue(page);
  const f = await mount(true, undefined, read);
  await vi.waitFor(async () => {
    await flushRefreshUpdates();
    expect(f.container.textContent).toContain("cached message");
  });
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "old-generation",
      seq: 1,
      gap: false,
      items: [],
    }),
  );
  await vi.waitFor(async () => {
    await flushRefreshUpdates();
    expect(read).toHaveBeenCalledTimes(2);
  });
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "new-generation",
      seq: 1,
      gap: false,
      items: [],
    }),
  );
  await vi.waitFor(async () => {
    await flushRefreshUpdates();
    expect(read).toHaveBeenCalledTimes(3);
  });
  await act(async () => {
    rejectLate(new Error("old cancelled transport error"));
    await Promise.resolve();
  });
  expect(f.container.querySelector('[role="alert"]')).toBeNull();
  expect(f.container.textContent).toContain("cached message");
});

it("checks an aged saved cache on return without a live generation using append continuation", async () => {
  vi.useFakeTimers();
  const cursor = {
    threadId: "A",
    source: "saved",
    offset: 100,
    endOffset: 100,
    prefixHash: "a".repeat(64),
  };
  const initial: HistoryPage = {
    kind: "page",
    entries: [
      { id: "one", parentId: null, role: "assistant", text: "cached message" },
    ],
    source: "saved",
    coverage: "append-order",
    next: null,
    continuation: cursor,
    incompleteTail: false,
    omitted: 0,
  };
  const read = vi
    .fn<HistoryBridge["read"]>()
    .mockResolvedValueOnce(initial)
    .mockResolvedValue({
      ...initial,
      source: "extended",
      continuation: {
        ...cursor,
        source: "extended",
        offset: 200,
        endOffset: 200,
      },
      entries: [
        {
          id: "two",
          parentId: "one",
          role: "assistant",
          text: "external CLI append",
        },
      ],
    });
  const f = await mount(true, undefined, read);
  await vi.waitFor(async () => {
    await flushRefreshUpdates();
    expect(f.container.textContent).toContain("cached message");
  });
  vi.setSystemTime(Date.now() + 30_001);
  await f.remount();
  await vi.waitFor(async () => {
    await flushRefreshUpdates();
    expect(read).toHaveBeenCalledTimes(2);
    expect(f.container.textContent).toContain("external CLI append");
  });
  expect(read).toHaveBeenLastCalledWith("A", { ...cursor, append: true });
  expect(f.container.textContent).toContain("cached message");
});

it("checks an unbound cache on inactive-to-active return even without a live generation", async () => {
  vi.useFakeTimers();
  const read = vi
    .fn<HistoryBridge["read"]>()
    .mockResolvedValueOnce({ kind: "unavailable", reason: "unbound" })
    .mockResolvedValue({
      kind: "page",
      source: "bound",
      coverage: "append-order",
      next: null,
      incompleteTail: false,
      omitted: 0,
      entries: [
        {
          id: "bound",
          parentId: null,
          role: "assistant",
          text: "now bound history",
        },
      ],
    });
  const f = await mount(true, undefined, read);
  await flushRefreshUpdates();
  expect(read).toHaveBeenCalledTimes(1);
  await f.setActive(false);
  await f.setActive(true);
  await vi.waitFor(async () => {
    await flushRefreshUpdates();
    expect(f.container.textContent).toContain("now bound history");
  });
  expect(read).toHaveBeenCalledTimes(2);
  expect(read).toHaveBeenLastCalledWith("A", null);
});

it("renders cold saved-only tool with shared disclosure, real name, call ID, args, result and full text", async () => {
  const fullText = "COMPLETE_TOOL_OUTPUT_TEXT\nline 2";
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const page: HistoryPage = {
    kind: "page",
    entries: [
      {
        id: "saved_tool_rec_1",
        parentId: null,
        role: "tool",
        text: fullText,
        state: "complete",
        tool: {
          toolCallId: "call_cold_saved_999",
          name: "tool_executor",
          lifecycle: "completed",
          observed: ["record"],
          coverage: "partial",
          truncated: true,
          arguments: {
            value: { command: "run-check", flags: ["--verbose"] },
            truncated: false,
          },
          result: {
            value: { exitCode: 0, stdout: "ok" },
            truncated: true,
          },
        },
      },
    ],
    source: "saved",
    coverage: "append-order",
    next: null,
    incompleteTail: false,
    omitted: 0,
  };
  const f = await mount(true, page);
  await vi.waitFor(() => {
    expect(f.container.textContent).toContain(fullText);
  });

  // Real tool name displayed in shared ToolResultFrame trigger
  const label = f.container.querySelector(".tool-result-label");
  expect(label?.textContent).toBe("tool_executor");

  // Shared ToolResultFrame details disclosure
  const outer = f.container.querySelector<HTMLDetailsElement>("details");
  expect(outer).not.toBeNull();
  await act(() => outer?.querySelector("summary")?.click());

  // Shared ToolObservationDetails disclosure
  const observation = f.container.querySelector<HTMLDetailsElement>(
    "[data-tool-observation]",
  );
  expect(observation).not.toBeNull();
  expect(observation?.open).toBe(false);

  // Expand observation disclosure
  await act(() => observation?.querySelector("summary")?.click());

  // Shows real toolCallId
  expect(observation?.textContent).toContain("call_cold_saved_999");
  // Shows saved arguments on expansion
  expect(observation?.textContent).toContain("run-check");
  expect(observation?.textContent).toContain("--verbose");
  // Shows saved result on expansion
  expect(observation?.textContent).toContain("exitCode");
  expect(observation?.textContent).toContain("stdout");

  // Partial and truncated guidance status indicators
  const statusNotices = [
    ...(observation?.querySelectorAll('[role="status"]') ?? []),
  ].map((el) => el.textContent);
  expect(statusNotices.some((text) => text?.includes("missing"))).toBe(true);
  expect(
    statusNotices.some((text) =>
      text?.includes("Showing part of the structured values"),
    ),
  ).toBe(true);

  // Full available text copy unchanged
  const copyButton = [...f.container.querySelectorAll("button")].find((node) =>
    node.getAttribute("aria-label")?.startsWith("Copy"),
  );
  expect(copyButton).toBeDefined();
  await act(() => copyButton?.click());
  expect(copy).toHaveBeenCalledWith(fullText);
});

it("retains live lifecycle and progress on same-nativeRecordId overlay while filling missing saved args and result", async () => {
  const page: HistoryPage = {
    kind: "page",
    entries: [
      {
        id: "rec_live_overlay",
        parentId: null,
        role: "tool",
        text: "Full committed output from disk",
        state: "complete",
        tool: {
          toolCallId: "call_live_777",
          name: "build_worker",
          lifecycle: "completed",
          observed: ["record"],
          coverage: "observed",
          truncated: false,
          arguments: {
            value: { target: "dist/bundle.js", minify: true },
            truncated: false,
          },
          result: {
            value: { chunks: 3, bytes: 4096 },
            truncated: false,
          },
        },
      },
    ],
    source: "saved",
    coverage: "append-order",
    next: null,
    incompleteTail: false,
    omitted: 0,
  };
  const f = await mount(true, page);
  await vi.waitFor(() => {
    expect(f.container.textContent).toContain(
      "Full committed output from disk",
    );
  });

  // Overlay live item with same nativeRecordId, currently streaming with progress
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "live-gen-1",
      seq: 1,
      gap: false,
      items: [
        {
          id: 101,
          nativeRecordId: "rec_live_overlay",
          role: "tool",
          state: "streaming",
          label: { kind: "literal", text: "build_worker" },
          text: "Live partial text",
          tool: {
            toolCallId: "call_live_777",
            name: "build_worker",
            lifecycle: "running",
            observed: ["start", "update"],
            coverage: "partial",
            truncated: false,
            progress: {
              value: { phase: "optimizing", progressRatio: 0.75 },
              truncated: false,
            },
          },
        },
      ],
    }),
  );

  // 2. Saved text precedence: committed full output from disk is retained
  expect(f.container.textContent).toContain("Full committed output from disk");

  // 3. Expand ToolResultFrame
  const outer = f.container.querySelector<HTMLDetailsElement>("details");
  expect(outer).not.toBeNull();
  await act(() => outer?.querySelector("summary")?.click());

  // 4. Observation details disclosure exists
  const observation = f.container.querySelector<HTMLDetailsElement>(
    "[data-tool-observation]",
  );
  expect(observation).not.toBeNull();
  await act(() => observation?.querySelector("summary")?.click());

  // 5. Retains current live progress
  expect(observation?.textContent).toContain("optimizing");
  expect(observation?.textContent).toContain("0.75");

  // 6. Fills genuinely missing saved arguments
  expect(observation?.textContent).toContain("dist/bundle.js");
  expect(observation?.textContent).toContain("minify");

  // 7. Fills genuinely missing saved result
  expect(observation?.textContent).toContain("chunks");
  expect(observation?.textContent).toContain("4096");

  // 8. Live coverage partial is preserved: partial status notice remains visible even though saved DTO was observed
  const statusNotices = [
    ...(observation?.querySelectorAll('[role="status"]') ?? []),
  ].map((el) => el.textContent);
  expect(statusNotices.some((text) => text?.includes("missing"))).toBe(true);
});

it("does not graft saved arguments or result when live tool call identity mismatches", async () => {
  const page: HistoryPage = {
    kind: "page",
    entries: [
      {
        id: "rec_mismatch",
        parentId: null,
        role: "tool",
        text: "Mismatched tool text",
        state: "complete",
        tool: {
          toolCallId: "call_saved_AAA",
          name: "bash",
          lifecycle: "completed",
          observed: ["record"],
          coverage: "observed",
          truncated: false,
          arguments: {
            value: { cmd: "saved_secret_command" },
            truncated: false,
          },
          result: {
            value: { output: "saved_result" },
            truncated: false,
          },
        },
      },
    ],
    source: "saved",
    coverage: "append-order",
    next: null,
    incompleteTail: false,
    omitted: 0,
  };
  const f = await mount(true, page);
  await vi.waitFor(() => {
    expect(f.container.textContent).toContain("Mismatched tool text");
  });

  // Emit live with same nativeRecordId but different toolCallId
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "live-gen-2",
      seq: 1,
      gap: false,
      items: [
        {
          id: 102,
          nativeRecordId: "rec_mismatch",
          role: "tool",
          state: "complete",
          label: { kind: "literal", text: "bash" },
          text: "Live text",
          tool: {
            toolCallId: "call_live_BBB",
            name: "bash",
            lifecycle: "completed",
            observed: ["start", "end"],
            coverage: "partial",
            truncated: false,
          },
        },
      ],
    }),
  );

  const outer = f.container.querySelector<HTMLDetailsElement>("details");
  expect(outer).not.toBeNull();
  await act(() => outer?.querySelector("summary")?.click());

  const observation = f.container.querySelector<HTMLDetailsElement>(
    "[data-tool-observation]",
  );
  expect(observation).not.toBeNull();
  await act(() => observation?.querySelector("summary")?.click());

  // Shows live call ID
  expect(observation?.textContent).toContain("call_live_BBB");
  // Never grafts saved arguments or result from mismatched toolCallId
  expect(observation?.textContent).not.toContain("saved_secret_command");
  expect(observation?.textContent).not.toContain("saved_result");
});

it("does not graft saved arguments when nativeRecordId mismatches even if tool identity matches", async () => {
  const page: HistoryPage = {
    kind: "page",
    entries: [
      {
        id: "rec_saved_orig",
        parentId: null,
        role: "tool",
        text: "Original saved output",
        state: "complete",
        tool: {
          toolCallId: "call_same_id",
          name: "bash",
          lifecycle: "completed",
          observed: ["record"],
          coverage: "observed",
          truncated: false,
          arguments: {
            value: { cmd: "saved_only_cmd" },
            truncated: false,
          },
        },
      },
    ],
    source: "saved",
    coverage: "append-order",
    next: null,
    incompleteTail: false,
    omitted: 0,
  };
  const f = await mount(true, page);
  await vi.waitFor(() => {
    expect(f.container.textContent).toContain("Original saved output");
  });

  // Live item with different nativeRecordId
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "live-gen-3",
      seq: 1,
      gap: false,
      items: [
        {
          id: 103,
          nativeRecordId: "rec_different_foreign",
          role: "tool",
          state: "complete",
          label: { kind: "literal", text: "bash" },
          text: "Foreign live output",
          tool: {
            toolCallId: "call_same_id",
            name: "bash",
            lifecycle: "completed",
            observed: ["start", "end"],
            coverage: "partial",
            truncated: false,
          },
        },
      ],
    }),
  );

  // Expand the original saved record details
  const savedRow = f.container.querySelector(
    '[data-reading-row="rec_saved_orig"]',
  );
  expect(savedRow).not.toBeNull();
  const savedOuter = savedRow?.querySelector<HTMLDetailsElement>("details");
  await act(() => savedOuter?.querySelector("summary")?.click());
  const savedObservation = savedRow?.querySelector<HTMLDetailsElement>(
    "[data-tool-observation]",
  );
  await act(() => savedObservation?.querySelector("summary")?.click());
  expect(savedObservation?.textContent).toContain("saved_only_cmd");

  // Foreign live item did not graft anything from rec_saved_orig
  const liveRow = f.container.querySelector('[data-reading-row^="live:"]');
  expect(liveRow).not.toBeNull();
  const liveOuter = liveRow?.querySelector<HTMLDetailsElement>("details");
  await act(() => liveOuter?.querySelector("summary")?.click());
  const liveObservation = liveRow?.querySelector<HTMLDetailsElement>(
    "[data-tool-observation]",
  );
  await act(() => liveObservation?.querySelector("summary")?.click());
  expect(liveObservation?.textContent).not.toContain("saved_only_cmd");
});
