// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HoverMenu } from "./hover-menu";

it("opens an accessible menu, invokes only enabled tools, and closes after selection", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const selected = vi.fn();
  try {
    await act(() =>
      root.render(
        createElement(HoverMenu, {
          label: "Developer tools",
          icon: createElement("span"),
          items: [
            { id: "components", label: "Components", onSelect: selected },
            {
              id: "unavailable",
              label: "Unavailable",
              disabled: true,
              onSelect: selected,
            },
          ],
        }),
      ),
    );
    const trigger = container.querySelector<HTMLButtonElement>("button");
    if (!trigger) throw Error("missing trigger");
    await act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const items = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];
    expect(items.map((item) => item.textContent)).toEqual([
      "Components",
      "Unavailable",
    ]);
    await act(() => items[1]?.click());
    expect(selected).not.toHaveBeenCalled();
    await act(() => items[0]?.click());
    expect(selected).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  } finally {
    await act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
