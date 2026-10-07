// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { installControlFocusVisibility } from "./focus-visibility";

it("inherits pointer focus when a trigger automatically moves focus into a portal, but restores keyboard focus", () => {
  const trigger = document.createElement("button");
  const icon = document.createElement("span");
  trigger.append(icon);
  const search = document.createElement("input");
  document.body.append(trigger, search);
  const dispose = installControlFocusVisibility(document);
  try {
    icon.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    trigger.focus();
    search.focus();
    expect(document.documentElement.dataset.pointerFocus).toBe("true");
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
    expect(document.documentElement.dataset.pointerFocus).toBe("true");
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
  } finally {
    dispose();
    trigger.remove();
    search.remove();
  }
});

it("keeps unrelated assistive focus eligible for browser focus-visible after a pointer click", () => {
  const button = document.createElement("button");
  const input = document.createElement("input");
  document.body.append(button, input);
  const dispose = installControlFocusVisibility(document);
  try {
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    input.focus();
    expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
  } finally {
    dispose();
    button.remove();
    input.remove();
  }
});
