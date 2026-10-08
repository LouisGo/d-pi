// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActionMenu, type ActionMenuEntry } from "./action-menu";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(items: readonly ActionMenuEntry[]) {
  await act(() =>
    root.render(
      createElement(ActionMenu, {
        label: "More actions",
        icon: createElement("span"),
        items,
      }),
    ),
  );
  const trigger = container.querySelector<HTMLButtonElement>("button");
  if (!trigger) throw Error("missing menu trigger");
  return trigger;
}
async function key(element: Element, value: string) {
  await act(() =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 30)));
}

it("does not open on hover and exposes a named menu trigger", async () => {
  const trigger = await render([
    { kind: "action", id: "reference", label: "Reference", onSelect: vi.fn() },
  ]);
  expect(trigger.getAttribute("aria-label")).toBe("More actions");
  expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
  await act(() =>
    trigger.dispatchEvent(
      new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }),
    ),
  );
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 160)));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("opens with ArrowDown, navigates items and returns focus on Escape", async () => {
  const trigger = await render([
    { kind: "action", id: "reference", label: "Reference", onSelect: vi.fn() },
    { kind: "action", id: "cache", label: "Manage cache", onSelect: vi.fn() },
  ]);
  await act(() => trigger.focus());
  await key(trigger, "ArrowDown");
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  const items = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ];
  expect(document.activeElement).toBe(items[0]);
  if (!items[0]) throw Error("missing menu item");
  await key(items[0], "ArrowDown");
  expect(document.activeElement).toBe(items[1]);
  if (!items[1]) throw Error("missing second menu item");
  await key(items[1], "Escape");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});

it("executes an enabled click once, ignores disabled actions and closes", async () => {
  const selected = vi.fn();
  const trigger = await render([
    { kind: "action", id: "reference", label: "Reference", onSelect: selected },
    {
      kind: "action",
      id: "disabled",
      label: "Unavailable",
      disabled: true,
      onSelect: selected,
    },
  ]);
  await act(() => trigger.click());
  const items = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ];
  await act(() => items[1]?.click());
  expect(selected).not.toHaveBeenCalled();
  await act(() => items[0]?.click());
  expect(selected).toHaveBeenCalledTimes(1);
  expect(selected).toHaveBeenCalledWith();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

it("exposes controlled preference state, descriptions and groups, and selects once by keyboard", async () => {
  const selected = vi.fn();
  const trigger = await render([
    { kind: "action", id: "reference", label: "Reference", onSelect: vi.fn() },
    { kind: "separator", id: "preference" },
    {
      kind: "checkbox",
      id: "send",
      label: "Enter sends",
      description: "Enter sends · Shift+Enter newline",
      checked: true,
      onSelect: selected,
    },
  ]);
  await act(() => trigger.click());
  expect(document.querySelector('[role="separator"]')).not.toBeNull();
  const option = document.querySelector<HTMLElement>(
    '[role="menuitemcheckbox"]',
  );
  if (!option) throw Error("missing preference item");
  expect(option.getAttribute("aria-checked")).toBe("true");
  expect(option.textContent).toContain("Enter sends · Shift+Enter newline");
  await act(() => option.focus());
  await key(option, "Enter");
  expect(selected).toHaveBeenCalledTimes(1);
  expect(selected).toHaveBeenCalledWith();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  await render([
    {
      kind: "checkbox",
      id: "send",
      label: "Enter sends",
      checked: false,
      onSelect: selected,
    },
  ]);
  await act(() => trigger.click());
  expect(
    document
      .querySelector('[role="menuitemcheckbox"]')
      ?.getAttribute("aria-checked"),
  ).toBe("false");
});
