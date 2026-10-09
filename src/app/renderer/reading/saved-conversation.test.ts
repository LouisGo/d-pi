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
