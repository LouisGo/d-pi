// @vitest-environment happy-dom
import { act, createElement, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Popover } from "./popover";
import { Button, TextInput } from "./public";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function flushFocus() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
}

it("composes one named trigger, focuses search, closes with Escape and returns focus", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const clicked = vi.fn();
  const changed = vi.fn();
  function Sample() {
    const input = useRef<HTMLInputElement>(null);
    return createElement(Popover, {
      label: "Models",
      initialFocus: input,
      onOpenChange: changed,
      trigger: createElement(Button, {
        onClick: clicked,
        children: "Choose model",
      }),
      children: [
        createElement(Button, { key: "rail", children: "All providers" }),
        createElement(TextInput, {
          key: "search",
          ref: input,
          "aria-label": "Search models",
        }),
      ],
    });
  }
  try {
    await act(() => root.render(createElement(Sample)));
    const trigger = host.querySelector<HTMLButtonElement>("button");
    expect(host.querySelectorAll("button")).toHaveLength(1);
    expect(trigger?.textContent).toBe("Choose model");
    expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
    await act(() => {
      trigger?.focus();
      trigger?.click();
    });
    await flushFocus();
    expect(clicked).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
    const popup = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Models"]',
    );
    expect(popup).not.toBeNull();
    expect(host.contains(popup)).toBe(false);
    const search = popup?.querySelector<HTMLInputElement>("input");
    expect(document.activeElement).toBe(search);
    await act(() =>
      search?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    await flushFocus();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(
      document.querySelector('[role="dialog"][aria-label="Models"]'),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(changed.mock.calls).toEqual([[true], [false]]);
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

it("keeps controlled open state, accepts keyboard activation and outside dismissal", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();
  function Sample() {
    const [open, setOpen] = useState(false);
    return createElement(Popover, {
      label: "Provider menu",
      open,
      onOpenChange: (next) => {
        changed(next);
        setOpen(next);
      },
      trigger: createElement(Button, { children: "Providers" }),
      children: createElement(Button, { children: "Manage providers" }),
    });
  }
  try {
    await act(() => root.render(createElement(Sample)));
    const trigger = host.querySelector<HTMLButtonElement>("button");
    await act(() => trigger?.focus());
    await act(() =>
      trigger?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    // Native Enter activation produces a click in the browser. happy-dom does
    // not synthesize that default, so dispatch the native click as well.
    await act(() => trigger?.click());
    await flushFocus();
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Manage providers");
    await act(() => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
      document.body.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 }),
      );
      document.body.click();
    });
    await flushFocus();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(changed.mock.calls).toEqual([[true], [false]]);
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

it("honors the composed trigger disabled state", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();
  try {
    await act(() =>
      root.render(
        createElement(Popover, {
          label: "Models",
          trigger: createElement(Button, {
            disabled: true,
            children: "Choose model",
          }),
          children: createElement(TextInput, { "aria-label": "Search models" }),
          onOpenChange: changed,
        }),
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>("button");
    expect(trigger?.disabled).toBe(true);
    await act(() => trigger?.click());
    expect(changed).not.toHaveBeenCalled();
    expect(
      document.querySelector('[role="dialog"][aria-label="Models"]'),
    ).toBeNull();
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});
