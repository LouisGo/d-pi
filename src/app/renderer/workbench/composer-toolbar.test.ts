// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ComposerToolbar, type ComposerToolbarProps } from "./composer-toolbar";

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
function props(): ComposerToolbarProps {
  return {
    model: createElement("button", null, "Actual model"),
    access: createElement("button", null, "Actual permission"),
    primaryAction: createElement("button", null, "Send"),
    expanded: false,
    preference: "enter-send",
    disabled: false,
    onAttach: vi.fn(),
    onReference: vi.fn(),
    onToggleExpanded: vi.fn(),
    onManageAttachments: vi.fn(),
    onToggleSendKey: vi.fn(),
    labels: {
      attach: "Attach files",
      expand: "Expand input",
      collapse: "Collapse input",
      more: "More composer actions",
      reference: "Reference project files",
      manageAttachments: "Manage attachment cache",
      enterToSend: "Enter sends",
      enterSendShortcut: "Enter sends · Shift+Enter newline",
      enterNewlineShortcut: "Enter newline · Command+Enter sends",
    },
  };
}
function button(label: string) {
  const found = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!found) throw Error(`missing button: ${label}`);
  return found;
}

it("preserves real model/access/primary slots with a separated left group and compact right actions", async () => {
  await act(() => root.render(createElement(ComposerToolbar, props())));
  const left = container.querySelector(
    '[data-slot="composer-toolbar-context"]',
  );
  const right = container.querySelector(
    '[data-slot="composer-toolbar-actions"]',
  );
  expect(left?.textContent).toBe("Actual modelActual permission");
  expect(left?.querySelector('[role="separator"]')).not.toBeNull();
  expect(
    right?.querySelector('button[aria-label="Attach files"]'),
  ).not.toBeNull();
  expect(
    right?.querySelector('button[aria-label="Expand input"]'),
  ).not.toBeNull();
  expect(right?.textContent).toContain("Send");
  expect(container.querySelector("details")).toBeNull();
  expect(container.textContent).not.toContain("@");
});

it("keeps attach direct, disables it alone, and exposes controlled expand/collapse state", async () => {
  const value = props();
  await act(() => root.render(createElement(ComposerToolbar, value)));
  await act(() => button("Attach files").click());
  expect(value.onAttach).toHaveBeenCalledTimes(1);
  expect(button("Expand input").getAttribute("aria-expanded")).toBe("false");
  await act(() => button("Expand input").click());
  expect(value.onToggleExpanded).toHaveBeenCalledTimes(1);
  await act(() =>
    root.render(
      createElement(ComposerToolbar, {
        ...value,
        disabled: true,
        expanded: true,
        access: undefined,
      }),
    ),
  );
  expect(button("Attach files").disabled).toBe(true);
  await act(() => button("Attach files").click());
  expect(value.onAttach).toHaveBeenCalledTimes(1);
  expect(button("Collapse input").getAttribute("aria-expanded")).toBe("true");
  expect(button("Collapse input").disabled).toBe(false);
  expect(
    container.querySelector(
      '[data-slot="composer-toolbar-context"] [role="separator"]',
    ),
  ).toBeNull();
  await act(() =>
    root.render(createElement(ComposerToolbar, { ...value, access: false })),
  );
  expect(
    container.querySelector(
      '[data-slot="composer-toolbar-context"] [role="separator"]',
    ),
  ).toBeNull();
});

it("keeps reference/cache/shortcut actions in the menu and reflects the current preference", async () => {
  const value = props();
  await act(() => root.render(createElement(ComposerToolbar, value)));
  expect(container.textContent).not.toContain("Reference project files");
  await act(() => button("More composer actions").click());
  const entries = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ];
  expect(entries.map((item) => item.textContent)).toEqual([
    "Reference project files",
    "Manage attachment cache",
  ]);
  await act(() => entries[0]?.click());
  expect(value.onReference).toHaveBeenCalledTimes(1);
  await act(() => button("More composer actions").click());
  await act(() =>
    document.querySelectorAll<HTMLElement>('[role="menuitem"]')[1]?.click(),
  );
  expect(value.onManageAttachments).toHaveBeenCalledTimes(1);
  await act(() =>
    root.render(
      createElement(ComposerToolbar, { ...value, preference: "enter-newline" }),
    ),
  );
  await act(() => button("More composer actions").click());
  const preference = document.querySelector<HTMLElement>(
    '[role="menuitemcheckbox"]',
  );
  expect(preference?.getAttribute("aria-checked")).toBe("false");
  expect(preference?.textContent).toContain(value.labels.enterNewlineShortcut);
  await act(() => preference?.click());
  expect(value.onToggleSendKey).toHaveBeenCalledTimes(1);
});
it("describes expanded keyboard behavior while retaining the collapsed send-key preference", async () => {
  const value = props();
  await act(() =>
    root.render(createElement(ComposerToolbar, { ...value, expanded: true })),
  );
  await act(() => button("More composer actions").click());
  const option = document.querySelector('[role="menuitemcheckbox"]');
  expect(option?.getAttribute("aria-checked")).toBe("true");
  expect(option?.getAttribute("aria-description")).toBe(
    value.labels.enterNewlineShortcut,
  );
});
