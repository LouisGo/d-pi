// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ConversationModel } from "../../../modules/conversation/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { Conversation } from "./conversation";
import { ReadingWindow, readingWindow } from "./reading-window";

it("bounds mounted conversation bodies for thousands of available rows", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const model = new ConversationModel({ connect: (_thread, listener) => {
    listener({ kind: "snapshot", connectionGeneration: "host", seq: 0, gap: false,
      items: Array.from({ length: 3000 }, (_, id) => ({ id, role: "user" as const,
        state: "complete" as const, text: `Question ${id}`, label: { kind: "literal" as const, text: "User" } })) });
    return () => {};
  } });
  model.connect("thread");
  const pane = document.createElement("div");
  pane.dataset.readingPane = "conversation";
  Object.defineProperty(pane, "clientHeight", { value: 600 });
  document.body.append(pane);
  const root = createRoot(pane);
  try {
    await act(() => root.render(createElement(I18nProvider, {
      initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
      children: createElement(Conversation, { model }),
    })));
    expect(pane.querySelectorAll("[data-reading-row]").length).toBeLessThan(80);
    expect(pane.querySelector('[data-reading-row="0"]')).not.toBeNull();
    expect(pane.querySelector('[data-reading-row="2999"]')).toBeNull();
    const first = pane.querySelector('[data-reading-row="0"]');
    const text = first?.querySelector("[data-reading-text]")?.firstChild;
    if (!text) throw Error("missing selectable question");
    const range = document.createRange();
    range.selectNodeContents(text);
    document.getSelection()?.addRange(range);
    await act(() => { expect(readingWindow(pane)?.mount("2999")).toBe(true); });
    expect(pane.querySelector('[data-reading-row="2999"]')).not.toBeNull();
    expect(pane.querySelector('[data-reading-row="0"]')).toBe(first);
    expect(document.getSelection()?.toString()).toBe("Question 0");
    expect(pane.querySelectorAll("[data-reading-row]").length).toBeLessThan(80);
    document.getSelection()?.removeAllRanges();
    await act(() => { readingWindow(pane)?.mount("1500"); });
    expect(pane.querySelector('[data-reading-row="1500"]')).not.toBeNull();
    expect(pane.querySelector('[data-reading-row="0"]')).toBeNull();
    expect(readingWindow(pane)?.row("2999")?.top).toBeGreaterThan(100000);
  } finally {
    document.getSelection()?.removeAllRanges();
    await act(() => root.unmount());
    model.dispose();
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
  const render = () => root.render(createElement(ReadingWindow, {
    source: "test",
    rows: Array.from({ length: count }, (_, index) => ({ id: String(index) })),
    renderRow: (row): ReactNode => createElement("article", { "data-reading-row": row.id },
      createElement("button", null, "Focus"),
      createElement("details", null, createElement("summary", null, "Details"), "Expanded native output")),
  }));
  try {
    await act(render);
    const first = pane.querySelector<HTMLElement>('[data-reading-row="0"]');
    first?.querySelector("button")?.focus();
    await act(() => { readingWindow(pane)?.mount("1500"); });
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
    await act(() => { readingWindow(pane)?.mount("1999"); });
    expect(pane.querySelector('[data-reading-row="0"]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    pane.remove();
    vi.unstubAllGlobals();
  }
});
