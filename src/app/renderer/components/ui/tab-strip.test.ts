// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { type TabItem, TabStrip } from "./tab-strip";

it("reveals an external selection inside the tab list without scrolling ancestors or stealing focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const reveal = vi
    .spyOn(HTMLElement.prototype, "scrollIntoView")
    .mockImplementation(() => {});
  const tabs: TabItem[] = [
    { id: "first", title: "First" },
    { id: "last", title: "Last" },
  ];
  const props = { id: "overflow", label: "Files", tabs, onSelect: vi.fn() };
  try {
    await act(() =>
      root.render(createElement(TabStrip, { ...props, selected: "first" })),
    );
    const outside = document.createElement("input");
    host.append(outside);
    outside.focus();
    const list = host.querySelector<HTMLElement>('[role="tablist"]');
    const last = host
      .querySelector<HTMLElement>("#overflow-tab-last")
      ?.closest<HTMLElement>(".tab-strip-item");
    if (!list || !last) throw Error("Missing overflow tabs");
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 200, 28),
    );
    vi.spyOn(last, "getBoundingClientRect").mockReturnValue(
      new DOMRect(250, 0, 100, 28),
    );
    host.scrollTop = 40;
    reveal.mockClear();
    await act(() =>
      root.render(createElement(TabStrip, { ...props, selected: "last" })),
    );
    expect(list.scrollLeft).toBe(150);
    expect(reveal).not.toHaveBeenCalled();
    expect(host.scrollTop).toBe(40);
    expect(document.activeElement).toBe(outside);
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("composes with independent content, skips disabled tabs and keeps close/add actions separate from selection", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const selected = vi.fn(),
    closed = vi.fn(),
    added = vi.fn();
  function Sample() {
    const [current, setCurrent] = useState<string | null>("first");
    const [tabs, setTabs] = useState<TabItem[]>([
      {
        id: "first",
        title: "File",
        icon: createElement("svg", { "data-test-icon": true }),
        panelId: "independent-content",
      },
      { id: "disabled", title: "Unavailable", disabled: true },
      { id: "last", title: "Terminal", closable: false },
    ]);
    return createElement(
      "div",
      null,
      createElement(TabStrip, {
        id: "sample",
        label: "Open tabs",
        tabs,
        selected: current,
        onSelect: (id) => {
          selected(id);
          setCurrent(id);
        },
        close: {
          label: (title) => `Close ${title}`,
          onClose: (id) => {
            closed(id);
            setTabs(tabs.filter((tab) => tab.id !== id));
            setCurrent("last");
          },
        },
        add: { label: "New tab", onAdd: added },
      }),
      createElement(
        "article",
        { id: "independent-content" },
        "Content is separately composed",
      ),
    );
  }
  try {
    await act(() => root.render(createElement(Sample)));
    expect(host.querySelector("[role=tabpanel]")).toBeNull();
    expect(
      host.querySelector("[role=tab]")?.getAttribute("aria-controls"),
    ).toBe("independent-content");
    await act(() =>
      host
        .querySelector("[role=tab]")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        ),
    );
    expect(selected).toHaveBeenLastCalledWith("last");
    expect(host.querySelector('[aria-label="Close Terminal"]')).toBeNull();
    const close = host.querySelector<HTMLButtonElement>(
      '[aria-label="Close File"]',
    );
    await act(() => close?.click());
    expect(closed).toHaveBeenCalledExactlyOnceWith("first");
    expect(selected).toHaveBeenCalledTimes(1);
    await act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="New tab"]')?.click(),
    );
    expect(added).toHaveBeenCalledTimes(1);
    expect(host.querySelector("article")?.textContent).toBe(
      "Content is separately composed",
    );
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
