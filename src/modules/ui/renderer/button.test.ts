// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Button } from "./button";

it("keeps a pending control mounted and focusable while blocking pointer and keyboard activation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const selected = vi.fn();
  const render = (pending: boolean, disabled = false) =>
    act(() =>
      root.render(
        createElement(
          Button,
          { pending, disabled, onClick: selected },
          "Action",
        ),
      ),
    );
  try {
    await render(false);
    const button = container.querySelector("button");
    if (!button) throw Error("missing control");
    button.focus();
    await render(true);
    expect(container.querySelector("button")).toBe(button);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(button);
    await act(() => {
      button.click();
      button.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(selected).not.toHaveBeenCalled();
    await render(false);
    await act(() => button.click());
    expect(selected).toHaveBeenCalledTimes(1);
    await render(false, true);
    expect(button.disabled).toBe(true);
    await act(() => button.click());
    expect(selected).toHaveBeenCalledTimes(1);
  } finally {
    await act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
