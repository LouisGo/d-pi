// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { ConversationEvent } from "../../../modules/conversation/contracts/public";
import {
  ConversationModel,
  ReadingPositions,
  readingSourceKey,
} from "../../../modules/conversation/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ConversationVisibilityContext } from "../shell/layout/conversation-visibility";
import { Conversation } from "./conversation";
import { ReadingPane } from "./reading-pane";

vi.mock("./markdown", () => ({
  Markdown: ({ text }: { text: string }) => createElement("p", null, text),
}));

it("shows a reachable list-bottom action and a new-output prompt for same-entity appends with one continuous body", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const measure = vi
    .spyOn(HTMLElement.prototype, "getClientRects")
    .mockImplementation(function () {
      return [new DOMRect(0, 0, 400, 200)] as unknown as DOMRectList;
    });
  const positions = new ReadingPositions();
  const source = readingSourceKey({
    kind: "live",
    threadId: "thread",
    generation: "host",
  });
  positions.remember(source, {
    rowId: "1",
    pixel: 230,
    offsetWithinRow: 30,
    atEnd: false,
  });
  let deliver: (event: ConversationEvent) => void = () => {};
  const model = new ConversationModel({
    connect: (_thread, listener) => {
      deliver = listener;
      return () => {};
    },
  });
  model.connect("thread");
  const text = "a".repeat(20000);
  const item = {
    id: 1,
    text,
    role: "assistant" as const,
    state: "streaming" as const,
    label: { kind: "literal" as const, text: "OMP" },
  };
  deliver({
    kind: "snapshot",
    connectionGeneration: "host",
    seq: 0,
    gap: false,
    items: [item],
  });
  const onOpenHistory = vi.fn();
  const thread = {
    readingSources: positions,
    readingPositions: new Map(),
    reading: model,
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (active = true, visible = true) =>
    act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ConversationVisibilityContext.Provider, {
            value: { visible, reveal: () => {} },
            children: createElement(ReadingPane, {
              thread,
              view: "conversation",
              active,
              onOpenHistory,
              children: createElement(Conversation, { model, positions }),
            }),
          }),
        }),
      ),
    );
  try {
    await render();
    const pane = host.querySelector<HTMLElement>(".reading-pane");
    if (!pane) throw Error("missing pane");
    Object.defineProperties(pane, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 1000 },
    });
    await act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(0);
    });
    pane.scrollTop = 230;
    await act(() => pane.dispatchEvent(new Event("scroll")));
    const bottom = [...host.querySelectorAll("button")].find(
      (node) => node.textContent === "Back to list bottom",
    );
    expect(bottom).toBeDefined();
    expect(host.textContent).not.toContain("New output");
    await act(() =>
      deliver({
        kind: "update",
        connectionGeneration: "host",
        seq: 1,
        gap: false,
        droppedBefore: 0,
        item: { ...item, text: text + "more" },
      }),
    );
    expect(host.textContent).toContain("New output");
    expect(pane.scrollTop).toBe(230);
    await act(() => bottom?.click());
    expect(pane.scrollTop).toBe(800);
    expect(host.textContent).not.toContain("New output");
    expect(host.querySelector("[data-reading-segment]")).toBeNull();
    expect(host.querySelector("[data-reading-text]")?.textContent).toBe(
      text + "more",
    );
    await act(() =>
      deliver({
        kind: "snapshot",
        connectionGeneration: "host",
        seq: 1,
        gap: true,
        items: [{ ...item, text: text + "more" }],
      }),
    );
    const historyEntry = host.querySelector<HTMLButtonElement>(
      "[data-live-reading-controls] [data-open-native-history]",
    );
    expect(historyEntry).not.toBeNull();
    expect(pane.contains(historyEntry)).toBe(false);
    await act(() => historyEntry?.click());
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    pane.scrollTop = 230;
    await act(() => pane.dispatchEvent(new Event("scroll")));
    await act(() =>
      deliver({
        kind: "update",
        connectionGeneration: "host",
        seq: 2,
        gap: true,
        droppedBefore: 0,
        item: { ...item, text: text + "more again" },
      }),
    );
    expect(host.textContent).toContain("New output");
    await render(false);
    const measuredBeforeHiddenOutput = measure.mock.calls.length;
    await act(() =>
      deliver({
        kind: "update",
        connectionGeneration: "host",
        seq: 3,
        gap: true,
        droppedBefore: 0,
        item: { ...item, text: text + "hidden more" },
      }),
    );
    expect(measure).toHaveBeenCalledTimes(measuredBeforeHiddenOutput);
    expect(host.querySelector("[data-live-reading-controls]")).toBeNull();
    await render();
    expect(host.textContent).not.toContain("New output");
    expect(pane.scrollTop).toBe(230);
    await render(true, false);
    expect(host.querySelector("[data-live-reading-controls]")).toBeNull();
  } finally {
    await act(() => root.unmount());
    model.dispose();
    positions.dispose();
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
