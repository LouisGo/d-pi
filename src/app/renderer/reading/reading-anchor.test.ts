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

function anchorFixture() {
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
      unobserve() {}
      disconnect = disconnect;
    },
  );
  const pane = document.createElement("div");
  pane.innerHTML =
    '<section data-reading-source="a"><article data-reading-row="row"><pre data-reading-text></pre><input></article></section>';
  document.body.append(pane);
  let height = 1000;
  Object.defineProperties(pane, {
    clientHeight: { get: () => 200 },
    scrollHeight: { get: () => height },
  });
  pane.getBoundingClientRect = () => new DOMRect(0, 0, 400, 200);
  pane.getClientRects = () =>
    [pane.getBoundingClientRect()] as unknown as DOMRectList;
  const row = pane.querySelector<HTMLElement>("article");
  if (!row) throw Error("missing row");
  row.getBoundingClientRect = () =>
    new DOMRect(0, 200 - pane.scrollTop, 400, 600);
  const positions = new ReadingPositions();
  positions.remember("a", {
    rowId: "row",
    offsetWithinRow: 30,
    pixel: 230,
    atEnd: false,
  });
  const adapter = attachReadingAnchor({
    pane,
    positions,
    isVisible: () => !pane.hidden,
    pixel: () => 0,
    rememberPixel: () => {},
  });
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  };
  return {
    pane,
    adapter,
    positions,
    frames,
    flush,
    resize: () => resize?.(),
    setHeight: (value: number) => {
      height = value;
      resize?.();
    },
    grow: () => {
      height += 400;
      resize?.();
    },
    cleanup: () => {
      adapter.dispose();
      pane.remove();
    },
  };
}

it("outer wheel takes ownership before scroll dispatch so an old frame cannot reset the gesture", () => {
  const fixture = anchorFixture();
  try {
    fixture.flush();
    fixture.grow();
    expect(fixture.frames.size).toBe(1);
    fixture.pane.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -40, bubbles: true }),
    );
    expect(fixture.frames.size).toBe(0);
    fixture.flush();
    fixture.pane.scrollTop = 190;
    fixture.adapter.capture();
    fixture.grow();
    fixture.flush();
    expect(fixture.pane.scrollTop).toBe(190);
  } finally {
    fixture.cleanup();
  }
});

it("captures user navigation in a newly committed source before its restore frame", () => {
  const fixture = anchorFixture();
  try {
    fixture.flush();
    fixture.pane
      .querySelector("section")
      ?.setAttribute("data-reading-source", "b");
    fixture.grow();
    fixture.pane.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -30, bubbles: true }),
    );
    fixture.pane.scrollTop = 190;
    fixture.adapter.capture();
    fixture.grow();
    fixture.flush();
    expect(fixture.pane.scrollTop).toBe(190);
    expect(fixture.positions.get("b")?.pixel).toBe(190);
    expect(fixture.positions.get("a")?.pixel).toBe(230);
  } finally {
    fixture.cleanup();
  }
});

it("lets a nested raw region consume wheel without cancelling the outer restoration", () => {
  const fixture = anchorFixture();
  try {
    fixture.flush();
    fixture.grow();
    const raw = fixture.pane.querySelector<HTMLElement>("pre");
    if (!raw) throw Error("missing raw");
    raw.style.overflowY = "auto";
    Object.defineProperties(raw, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 500 },
    });
    raw.scrollTop = 40;
    raw.dispatchEvent(new WheelEvent("wheel", { deltaY: 30, bubbles: true }));
    expect(fixture.frames.size).toBe(1);
    fixture.flush();
    expect(fixture.pane.scrollTop).toBe(230);
  } finally {
    fixture.cleanup();
  }
});

it("keyboard and scrollbar gestures cancel queued positioning, but editing and IME keys do not", () => {
  const fixture = anchorFixture();
  try {
    fixture.flush();
    fixture.grow();
    const input = fixture.pane.querySelector("input");
    input?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    fixture.pane.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        isComposing: true,
        bubbles: true,
      }),
    );
    expect(fixture.frames.size).toBe(1);
    fixture.pane.dispatchEvent(
      new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }),
    );
    expect(fixture.frames.size).toBe(0);
    fixture.grow();
    fixture.pane.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    expect(fixture.frames.size).toBe(0);
  } finally {
    fixture.cleanup();
  }
});

it("explicit list bottom is immediate, cancels old restoration, preserves body page, and follows later output", () => {
  const fixture = anchorFixture();
  const listener = vi.fn();
  try {
    fixture.positions.rememberBody("body-a", { page: 2, scrollTop: 37 });
    fixture.flush();
    fixture.grow();
    const release = fixture.adapter.subscribe(listener);
    expect(fixture.adapter.getSnapshot()).toBe(false);
    fixture.adapter.toBottom();
    expect(fixture.pane.scrollTop).toBe(1200);
    expect(fixture.frames.size).toBe(0);
    expect(fixture.adapter.getSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(fixture.positions.body("body-a")).toEqual({
      page: 2,
      scrollTop: 37,
    });
    fixture.grow();
    fixture.flush();
    expect(fixture.pane.scrollTop).toBe(1600);
    fixture.pane.scrollTop = 500;
    fixture.adapter.capture();
    expect(fixture.adapter.getSnapshot()).toBe(false);
    release();
  } finally {
    fixture.cleanup();
  }
});

it("hidden and disposed panes stop pending DOM work and cannot accept a late positioning command", () => {
  const fixture = anchorFixture();
  try {
    fixture.flush();
    fixture.grow();
    fixture.pane.hidden = true;
    fixture.pane.scrollTop = 71;
    fixture.flush();
    fixture.adapter.toBottom();
    expect(fixture.pane.scrollTop).toBe(71);
    fixture.adapter.dispose();
    fixture.pane.hidden = false;
    fixture.grow();
    fixture.adapter.toBottom();
    fixture.flush();
    expect(fixture.pane.scrollTop).toBe(71);
    expect(fixture.positions.get("a")?.pixel).toBe(230);
  } finally {
    fixture.cleanup();
  }
});

it("commits an explicit pane location so a subsequent content restoration cannot undo it", () => {
  const fixture = anchorFixture();
  try {
    fixture.flush();
    fixture.grow();
    const located = fixture.adapter.position(() => {
      fixture.pane.scrollTop = 550;
      return true;
    });
    expect(located).toBe(true);
    fixture.grow();
    fixture.flush();
    expect(fixture.pane.scrollTop).toBe(550);
    expect(fixture.positions.get("a")?.pixel).toBe(550);
  } finally {
    fixture.cleanup();
  }
});

it("a retained anchor clamped to the current list end resumes follow for later output", () => {
  const fixture = anchorFixture();
  try {
    fixture.flush();
    fixture.setHeight(400);
    fixture.flush();
    expect(fixture.pane.scrollTop).toBe(200);
    expect(fixture.adapter.getSnapshot()).toBe(true);
    fixture.setHeight(1100);
    fixture.flush();
    expect(fixture.pane.scrollTop).toBe(900);
  } finally {
    fixture.cleanup();
  }
});
