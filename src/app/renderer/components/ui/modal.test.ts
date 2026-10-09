// @vitest-environment happy-dom
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HoverCard } from "../../../../modules/ui/renderer/public";
import { Modal } from "./modal";

it("closes a background preview when a shared Modal opens and refuses background focus until dismissal", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const returnFocus = createRef<HTMLButtonElement>();
  const change = vi.fn();
  const render = async (open: boolean) =>
    act(() =>
      root.render(
        createElement(
          "div",
          {},
          createElement(HoverCard, {
            label: "Preview",
            onOpenChange: change,
            trigger: createElement("button", { ref: returnFocus }, "Turn"),
            children: "Background turn",
          }),
          createElement(Modal, {
            open,
            onClose: () => {},
            title: "Image",
            closeLabel: "Close",
            returnFocus,
            children: "Image content",
          }),
        ),
      ),
    );
  try {
    await render(false);
    await act(() => returnFocus.current?.focus());
    await vi.waitFor(() => expect(change).toHaveBeenCalledWith(true));
    await render(true);
    await vi.waitFor(() => expect(change).toHaveBeenLastCalledWith(false));
    expect(
      document.querySelector(
        ".ui-dialog-portal[data-dpi-modal-open] [role=dialog]",
      ),
    ).not.toBeNull();
    change.mockClear();
    await act(() =>
      returnFocus.current?.dispatchEvent(
        new FocusEvent("focusin", { bubbles: true }),
      ),
    );
    expect(change).not.toHaveBeenCalledWith(true);
    await render(false);
    expect(document.querySelector("[data-dpi-modal-open]")).toBeNull();
  } finally {
    await act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
