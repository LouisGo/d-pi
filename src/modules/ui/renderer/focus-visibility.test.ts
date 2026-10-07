// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { installControlFocusVisibility } from "./focus-visibility";

it("recognizes first-hover menu autofocus without a pointer press, and restores keyboard focus", () => {
  const trigger = document.createElement("button");
  const icon = document.createElement("span");
  trigger.append(icon);
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-controls", "hover-menu");
  const popup = document.createElement("div");
  popup.id = "hover-menu";
  popup.setAttribute("role", "menu");
  popup.tabIndex = -1;
  document.body.append(trigger, popup);
  const dispose = installControlFocusVisibility(document);
  try {
    // Hover opens the portal before the trigger has ever received focus.
    icon.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    popup.focus();
    expect(document.documentElement.dataset.pointerFocus).toBe("true");
    popup.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
  } finally {
    dispose();
    trigger.remove();
    popup.remove();
  }
});

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

it("does not treat unrelated assistive focus as hover-menu autofocus", () => {
  const trigger = document.createElement("button");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-controls", "unmounted-menu");
  const input = document.createElement("input");
  document.body.append(trigger, input);
  const dispose = installControlFocusVisibility(document);
  try {
    trigger.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    input.focus();
    expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
  } finally {
    dispose();
    trigger.remove();
    input.remove();
  }
});
