// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LoadingIndicator } from "./loading-indicator";

it("does not flash on a fast read, delays slow reads, and cancels on completion or identity change", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (pending: boolean, identity = "A") =>
    act(() =>
      root.render(
        createElement(LoadingIndicator, {
          pending,
          identity,
          label: "Loading",
        }),
      ),
    );
  try {
    await render(true);
    await act(() => vi.advanceTimersByTime(100));
    await render(false);
    await act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('[role="status"]')).toBeNull();
    await render(true);
    await act(() => vi.advanceTimersByTime(200));
    expect(
      container.querySelector('[role="status"]')?.getAttribute("aria-label"),
    ).toBe("Loading");
    expect(container.textContent).toBe("");
    await render(true, "B");
    expect(container.querySelector('[role="status"]')).toBeNull();
    await act(() => vi.advanceTimersByTime(200));
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await render(false, "B");
    expect(container.querySelector('[role="status"]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
