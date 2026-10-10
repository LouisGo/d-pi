// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { HistoryBridge } from "../../../modules/conversation/contracts/public";
import {
  ConversationModel,
  ReadingPositions,
} from "../../../modules/conversation/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { Conversation } from "./conversation";
import { MessageMedia } from "./message-media";
import {
  attachReadingAnchor,
  type ReadingAnchorController,
} from "./reading-anchor";
import { ReadingWindow, readingWindow } from "./reading-window";

// happy-dom has no layout: supply the scroll-relative geometry the adapter reads.
function mockReadingGeometry(pane: HTMLElement, count: () => number) {
  Object.defineProperty(pane, "scrollHeight", { get: () => count() * 120 });
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      if (this === pane) return new DOMRect(0, 0, 600, 600);
      if (this.matches("[data-reading-window]") && pane.contains(this))
        return new DOMRect(0, -pane.scrollTop, 600, count() * 120);
      const id = this.dataset.readingRow;
      if (id !== undefined && pane.contains(this))
        return new DOMRect(0, Number(id) * 120 - pane.scrollTop, 600, 120);
      return new DOMRect();
    });
}

it("bounds mounted conversation bodies for thousands of available rows", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const model = new ConversationModel({
    connect: (_thread, listener) => {
      listener({
        kind: "snapshot",
        connectionGeneration: "host",
        seq: 0,
        gap: false,
        items: Array.from({ length: 3000 }, (_, id) => ({
          id,
          role: "user" as const,
          state: "complete" as const,
          text: `Question ${id}`,
          label: { kind: "literal" as const, text: "User" },
        })),
      });
      return () => {};
    },
  });
  model.connect("thread");
  const pane = document.createElement("div");
  pane.dataset.readingPane = "conversation";
  Object.defineProperty(pane, "clientHeight", { value: 600 });
  document.body.append(pane);
  const root = createRoot(pane);
  const geometry = mockReadingGeometry(pane, () => 3000);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(Conversation, { model }),
        }),
      ),
    );
    expect(pane.querySelectorAll("[data-reading-row]").length).toBeLessThan(80);
    expect(pane.querySelector('[data-reading-row="0"]')).not.toBeNull();
    expect(pane.querySelector('[data-reading-row="2999"]')).toBeNull();
    const first = pane.querySelector('[data-reading-row="0"]');
    const text = first?.querySelector("[data-reading-text]")?.firstChild;
    if (!text) throw Error("missing selectable question");
    const range = document.createRange();
    range.selectNodeContents(text);
    document.getSelection()?.addRange(range);
    await act(() => {
      expect(readingWindow(pane)?.mount("2999")).toBe(true);
    });
    expect(pane.querySelector('[data-reading-row="2999"]')).not.toBeNull();
    expect(pane.querySelector('[data-reading-row="0"]')).toBe(first);
    expect(document.getSelection()?.toString()).toBe("Question 0");
    expect(pane.querySelectorAll("[data-reading-row]").length).toBeLessThan(80);
    document.getSelection()?.removeAllRanges();
    await act(() => {
      readingWindow(pane)?.mount("1500");
    });
    expect(pane.querySelector('[data-reading-row="1500"]')).not.toBeNull();
    expect(pane.querySelector('[data-reading-row="0"]')).toBeNull();
    expect(readingWindow(pane)?.row("2999")?.top).toBeGreaterThan(100000);
  } finally {
    document.getSelection()?.removeAllRanges();
    await act(() => root.unmount());
    model.dispose();
    geometry.mockRestore();
    pane.remove();
    vi.unstubAllGlobals();
  }
});

it("keeps focused and expanded rows mounted through offscreen jumps and appends", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const pane = document.createElement("div");
  pane.dataset.readingPane = "conversation";
  Object.defineProperty(pane, "clientHeight", { value: 600 });
  document.body.append(pane);
  const root = createRoot(pane);
  let count = 2000;
  const geometry = mockReadingGeometry(pane, () => count);
  const render = () =>
    root.render(
      createElement(ReadingWindow, {
        source: "test",
        rows: Array.from({ length: count }, (_, index) => ({
          id: String(index),
        })),
        renderRow: (row): ReactNode =>
          createElement(
            "article",
            { "data-reading-row": row.id },
            createElement("button", null, "Focus"),
            createElement(
              "details",
              null,
              createElement("summary", null, "Details"),
              "Expanded native output",
            ),
          ),
      }),
    );
  try {
    await act(render);
    const first = pane.querySelector<HTMLElement>('[data-reading-row="0"]');
    first?.querySelector("button")?.focus();
    await act(() => {
      readingWindow(pane)?.mount("1500");
    });
    expect(pane.querySelector('[data-reading-row="0"]')).toBe(first);
    const details = first?.querySelector("details");
    if (!details) throw Error("missing disclosure");
    details.open = true;
    first?.querySelector("button")?.blur();
    count++;
    await act(render);
    expect(pane.querySelector('[data-reading-row="0"]')).toBe(first);
    expect(details.open).toBe(true);
    expect(pane.querySelectorAll("[data-reading-row]").length).toBeLessThan(80);
    details.open = false;
    await act(() => {
      readingWindow(pane)?.mount("1999");
    });
    expect(pane.querySelector('[data-reading-row="0"]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    geometry.mockRestore();
    pane.remove();
    vi.unstubAllGlobals();
  }
});

it.each(["pane", "ancestor", "no-layout"])(
  "retains visible long-row measurements and restores within-body position after a hidden %s update",
  async (hiddenBy) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const flushFrames = async () => {
      await act(() => {
        const pending = [...frames.values()];
        frames.clear();
        for (const callback of pending) callback(0);
      });
    };
    const host = document.createElement("div");
    const pane = document.createElement("div");
    pane.dataset.readingPane = "conversation";
    host.append(pane);
    document.body.append(host);
    Object.defineProperty(pane, "clientHeight", { value: 600 });
    Object.defineProperty(pane, "scrollHeight", { get: () => 240880 });
    let noLayout = false;
    const hidden = () => pane.hidden || host.hidden || noLayout;
    const geometry = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (hidden()) return new DOMRect();
        if (this === pane) return new DOMRect(0, 40, 600, 600);
        if (this.matches("[data-reading-window]"))
          return new DOMRect(0, 40 - pane.scrollTop, 600, 240880);
        const id = this.dataset.readingRow;
        if (id !== undefined) {
          const index = Number(id);
          return new DOMRect(
            0,
            40 + (index === 0 ? 0 : 1000 + (index - 1) * 120) - pane.scrollTop,
            600,
            index === 0 ? 1000 : 120,
          );
        }
        return new DOMRect();
      });
    const rects = vi
      .spyOn(HTMLElement.prototype, "getClientRects")
      .mockImplementation(function (this: HTMLElement) {
        const values = hidden() ? [] : [this.getBoundingClientRect()];
        return Object.assign(values, {
          item: (index: number) => values[index] ?? null,
        });
      });
    const positions = new ReadingPositions();
    const root = createRoot(pane);
    let count = 2000;
    const render = () =>
      root.render(
        createElement(
          "div",
          { "data-reading-source": "test" },
          createElement(ReadingWindow, {
            source: "test",
            positions,
            rows: Array.from({ length: count }, (_, index) => ({
              id: String(index),
            })),
            renderRow: (row) =>
              createElement(
                "article",
                {
                  "data-reading-row": row.id,
                  style: { marginTop: 20, marginBottom: 20 },
                },
                `Question ${row.id}`,
              ),
          }),
        ),
      );
    let anchor: ReadingAnchorController | undefined;
    try {
      await act(render);
      expect(readingWindow(pane)?.row("0")?.height).toBe(1000);
      positions.remember("test", {
        rowId: "0",
        offsetWithinRow: 900,
        pixel: 900,
        atEnd: false,
      });
      pane.scrollTop = 900;
      if (hiddenBy === "pane") pane.hidden = true;
      if (hiddenBy === "ancestor") host.hidden = true;
      if (hiddenBy === "no-layout") noLayout = true;
      pane.dispatchEvent(new Event("scroll"));
      await flushFrames();
      count++;
      await act(render);
      // Cached coordinates, not the zero layout rectangle, remain available.
      expect(readingWindow(pane)?.row("0")?.height).toBe(1040);
      await act(() => {
        readingWindow(pane)?.mount("1500");
      });
      expect(pane.querySelector('[data-reading-row="0"]')).toBeNull();
      pane.hidden = false;
      host.hidden = false;
      noLayout = false;
      anchor = attachReadingAnchor({
        pane,
        positions,
        isVisible: () => true,
        pixel: () => pane.scrollTop,
        rememberPixel: () => {},
      });
      await flushFrames();
      expect(pane.scrollTop).toBe(900);
      pane.dispatchEvent(new Event("scroll"));
      await flushFrames();
      expect(pane.querySelector('[data-reading-row="0"]')).not.toBeNull();
      expect(readingWindow(pane)?.row("0")?.height).toBe(1000);
    } finally {
      anchor?.dispose();
      await act(() => root.unmount());
      positions.dispose();
      geometry.mockRestore();
      rects.mockRestore();
      host.remove();
      vi.unstubAllGlobals();
    }
  },
);

it("keeps a real portaled media preview and its owner mounted until close and focus departure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const pane = document.createElement("div");
  pane.dataset.readingPane = "conversation";
  Object.defineProperty(pane, "clientHeight", { value: 600 });
  document.body.append(pane);
  const root = createRoot(pane);
  let count = 2000;
  const geometry = mockReadingGeometry(pane, () => count);
  const bridge: HistoryBridge = {
    read: async () => ({ kind: "unavailable", reason: "missing" }),
    projectRead: async () => ({ kind: "unavailable", reason: "missing" }),
    projectList: async () => ({
      kind: "catalog",
      sessions: [],
      partial: false,
    }),
  };
  const render = () =>
    root.render(
      createElement(I18nProvider, {
        initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
        children: createElement(ReadingWindow, {
          source: "media",
          rows: Array.from({ length: count }, (_, index) => ({
            id: String(index),
          })),
          renderRow: (row) =>
            createElement(
              "article",
              { "data-reading-row": row.id },
              row.id === "0"
                ? createElement(MessageMedia, {
                    entry: {
                      id: "0",
                      parentId: null,
                      role: "user",
                      text: "Attachment contents",
                      files: [
                        {
                          name: "notes.txt",
                          byteLength: 19,
                          start: 0,
                          end: 19,
                        },
                      ],
                    },
                    bridge,
                    threadId: "thread",
                  })
                : createElement("button", null, "Other row"),
            ),
        }),
      }),
    );
  try {
    await act(render);
    const owner = pane.querySelector('[data-reading-row="0"]');
    const opener = owner?.querySelector<HTMLButtonElement>("button");
    if (!opener) throw Error("missing attachment trigger");
    await act(() => {
      opener.focus();
      opener.click();
    });
    // Wait for Base UI's real portal autofocus, outside the owning article.
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    const popup = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!popup) throw Error("missing real attachment dialog");
    expect(popup.textContent).toContain("Attachment contents");
    expect(popup.contains(document.activeElement)).toBe(true);
    const focused = document.activeElement;
    await act(() => {
      readingWindow(pane)?.mount("1500");
    });
    count++;
    await act(render);
    expect(pane.querySelector('[data-reading-row="0"]')).toBe(owner);
    expect(document.querySelector('[role="dialog"]')).toBe(popup);
    expect(document.activeElement).toBe(focused);
    expect(pane.querySelectorAll("[data-reading-row]").length).toBeLessThan(80);
    const close = popup.querySelector<HTMLButtonElement>(
      'button[aria-label="Close preview"]',
    );
    if (!close) throw Error("missing preview close action");
    await act(() => close.click());
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(document.querySelector("[data-dpi-modal-open]")).toBeNull();
    expect(document.activeElement).toBe(opener);
    const other = pane.querySelector<HTMLButtonElement>(
      '[data-reading-row="1500"] button',
    );
    if (!other) throw Error("missing destination focus");
    await act(() => other.focus());
    count++;
    await act(render);
    expect(pane.querySelector('[data-reading-row="0"]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    geometry.mockRestore();
    pane.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
