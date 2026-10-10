// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { IconButton } from "./icon-button";
import { TooltipProvider } from "./tooltip";

it.each([false, true])(
  "shows an icon hint above the control promptly, with a shared provider=%s",
  async (provided) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      const control = createElement(
        IconButton,
        { label: "Mark complete", variant: "success", appearance: "plain" },
        createElement("span", null, "icon"),
      );
      await act(() =>
        root.render(
          provided ? createElement(TooltipProvider, null, control) : control,
        ),
      );
      const button = container.querySelector("button");
      if (!button) throw Error("missing trigger");
      await act(() => {
        button.dispatchEvent(
          new PointerEvent("pointerover", {
            bubbles: true,
            pointerType: "mouse",
            clientX: 5,
            clientY: 5,
          }),
        );
        button.dispatchEvent(
          new MouseEvent("mouseenter", { clientX: 5, clientY: 5 }),
        );
        button.dispatchEvent(
          new MouseEvent("mousemove", {
            bubbles: true,
            clientX: 5,
            clientY: 5,
          }),
        );
      });
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 220)));
      const hint = document.querySelector('[role="tooltip"]');
      expect(hint?.textContent).toBe("Mark complete");
      expect(hint?.getAttribute("data-side")).toBe("top");
      await act(() => {
        button.dispatchEvent(
          new MouseEvent("mouseleave", { relatedTarget: document.body }),
        );
        button.dispatchEvent(
          new MouseEvent("mouseout", {
            bubbles: true,
            relatedTarget: document.body,
          }),
        );
      });
      expect(document.querySelector('[role="tooltip"][data-open]')).toBeNull();
      expect(button.hasAttribute("data-popup-open")).toBe(false);
    } finally {
      await act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);
