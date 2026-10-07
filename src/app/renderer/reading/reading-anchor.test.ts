// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { ReadingPositions } from "../../../modules/conversation/core/public";
import { attachReadingAnchor } from "./reading-anchor";

afterEach(() => vi.unstubAllGlobals());
it("restores row-relative position across geometry changes and isolates a new source", () => {
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  let resize: (() => void) | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const frame = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  };
  const pane = document.createElement("div");
  pane.innerHTML =
    '<section data-reading-source="a"><article data-reading-row="row"></article></section>';
  document.body.append(pane);
  let height = 1000;
  let rowTop = 200;
  Object.defineProperties(pane, {
    clientHeight: { get: () => 200 },
    scrollHeight: { get: () => height },
  });
  pane.getBoundingClientRect = () => new DOMRect(0, 0, 400, 200);
  pane.getClientRects = () =>
    [pane.getBoundingClientRect()] as unknown as DOMRectList;
  const row = pane.querySelector<HTMLElement>("article")!;
  row.getBoundingClientRect = () =>
    new DOMRect(0, rowTop - pane.scrollTop, 400, 200);
  const positions = new ReadingPositions();
  const anchor = attachReadingAnchor({
    pane,
    positions,
    isVisible: () => !pane.hidden,
    pixel: () => 0,
    rememberPixel: () => {},
  });
  try {
    frame();
    pane.scrollTop = 230;
    anchor.capture();
    rowTop = 350;
    height = 1500;
    resize?.();
    frame();
    expect(pane.scrollTop).toBe(380);
    pane.hidden = true;
    pane.scrollTop = 0;
    anchor.capture();
    expect(positions.get("a")?.offsetWithinRow).toBe(30);
    pane.hidden = false;
    pane.querySelector("section")?.setAttribute("data-reading-source", "b");
    resize?.();
    frame();
    expect(pane.scrollTop).toBe(0);
    pane.querySelector("section")?.setAttribute("data-reading-source", "a");
    resize?.();
    frame();
    expect(pane.scrollTop).toBe(380);
  } finally {
    anchor.dispose();
    pane.remove();
  }
  expect(disconnect).toHaveBeenCalled();
  expect(frames.size).toBe(0);
});
