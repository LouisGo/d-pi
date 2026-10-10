// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { installControlFocusVisibility } from "./focus-visibility";

it("keeps mouse context-menu autofocus outline-free until keyboard navigation", () => {
  const row = document.createElement("button");
  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  menu.dataset.slot = "context-menu";
  menu.tabIndex = -1;
  document.body.append(row, menu);
  const dispose = installControlFocusVisibility(document);
  try {
    row.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 2 }),
    );
    row.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, button: 2 }),
    );
    // Context menus can focus their portal directly from body, without first focusing the row.
    menu.focus();
    expect(document.documentElement.dataset.pointerFocus).toBe("true");
    menu.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
  } finally {
    dispose();
    row.remove();
    menu.remove();
  }
});

it("recognizes a keyboard context menu after a pointer click as keyboard focus", () => {
  const row = document.createElement("button");
  const menu = document.createElement("div");
  menu.tabIndex = -1;
  menu.dataset.slot = "context-menu";
  document.body.append(row, menu);
  const dispose = installControlFocusVisibility(document);
  try {
    row.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    row.focus();
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }),
    );
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    menu.focus();
    expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
  } finally {
    dispose();
    row.remove();
    menu.remove();
  }
});

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

it.each(["input", "textarea", "contenteditable"])(
  "keeps pointer focus during editing keys in %s, but makes Tab and a distinct keyboard focus visible",
  (kind) => {
    const field = document.createElement(
      kind === "contenteditable" ? "div" : kind,
    );
    if (kind === "contenteditable") {
      field.contentEditable = "true";
      field.tabIndex = 0;
    }
    const child = document.createElement("span");
    if (kind === "contenteditable") field.append(child);
    const button = document.createElement("button");
    document.body.append(field, button);
    const dispose = installControlFocusVisibility(document);
    try {
      const target = kind === "contenteditable" ? child : field;
      target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      field.focus();
      for (const key of [
        " ",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "Home",
        "End",
        "Enter",
        "Escape",
      ]) {
        target.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true }),
        );
        expect(document.documentElement.dataset.pointerFocus, key).toBe("true");
      }
      button.focus();
      expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
      field.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      field.focus();
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
      expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
    } finally {
      dispose();
      field.remove();
      button.remove();
    }
  },
);

it("preserves the pointer origin when a native picker returns to the same focused editor without relatedTarget", () => {
  const trigger = document.createElement("button");
  const editor = document.createElement("div");
  editor.contentEditable = "true";
  editor.tabIndex = 0;
  const other = document.createElement("input");
  document.body.append(trigger, editor, other);
  const dispose = installControlFocusVisibility(document);
  try {
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    trigger.focus();
    // The picker caller sets the editor as its initiating return target.
    editor.focus();
    expect(document.documentElement.dataset.pointerFocus).toBe("true");
    editor.dispatchEvent(
      new FocusEvent("focusin", { bubbles: true, relatedTarget: null }),
    );
    expect(document.documentElement.dataset.pointerFocus).toBe("true");
    editor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    editor.dispatchEvent(
      new FocusEvent("focusin", { bubbles: true, relatedTarget: null }),
    );
    expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    trigger.focus();
    editor.focus();
    other.focus();
    expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
  } finally {
    dispose();
    trigger.remove();
    editor.remove();
    other.remove();
  }
});

it.each(["dialog", "menu", "listbox"])(
  "keeps pointer autofocus and the return from a %s outline-free after its close control unmounts",
  (role) => {
    const trigger = document.createElement("button");
    const popup = document.createElement("div");
    popup.setAttribute("role", role);
    popup.tabIndex = -1;
    const close = document.createElement("button");
    popup.append(close);
    document.body.append(trigger, popup);
    const dispose = installControlFocusVisibility(document);
    try {
      trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      trigger.focus();
      popup.focus();
      expect(document.documentElement.dataset.pointerFocus).toBe("true");
      close.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      close.focus();
      popup.remove();
      trigger.focus();
      expect(document.activeElement).toBe(trigger);
      expect(document.documentElement.dataset.pointerFocus).toBe("true");
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
      expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
    } finally {
      dispose();
      trigger.remove();
      popup.remove();
    }
  },
);

it("returns a hover-opened menu to its trigger rather than the previously focused unrelated field", () => {
  const field = document.createElement("input");
  const trigger = document.createElement("button");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-controls", "return-menu");
  const popup = document.createElement("div");
  popup.id = "return-menu";
  popup.setAttribute("role", "menu");
  popup.tabIndex = -1;
  const item = document.createElement("button");
  popup.append(item);
  document.body.append(field, trigger, popup);
  const dispose = installControlFocusVisibility(document);
  try {
    field.focus();
    trigger.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    popup.focus();
    item.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    item.focus();
    popup.remove();
    trigger.focus();
    expect(document.documentElement.dataset.pointerFocus).toBe("true");
    field.focus();
    expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
  } finally {
    dispose();
    field.remove();
    trigger.remove();
    popup.remove();
  }
});

it("allows visible keyboard focus when a clicked dialog is dismissed with Escape", () => {
  const trigger = document.createElement("button");
  const popup = document.createElement("div");
  popup.setAttribute("role", "dialog");
  popup.tabIndex = -1;
  document.body.append(trigger, popup);
  const dispose = installControlFocusVisibility(document);
  try {
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    trigger.focus();
    popup.focus();
    popup.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    popup.remove();
    trigger.focus();
    expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
  } finally {
    dispose();
    trigger.remove();
    popup.remove();
  }
});

it("preserves each return target when nested pointer dialogs close", () => {
  const trigger = document.createElement("button");
  const outer = document.createElement("div");
  outer.setAttribute("role", "dialog");
  outer.tabIndex = -1;
  const innerTrigger = document.createElement("button");
  const outerClose = document.createElement("button");
  outer.append(innerTrigger, outerClose);
  const inner = document.createElement("div");
  inner.setAttribute("role", "dialog");
  inner.tabIndex = -1;
  const innerClose = document.createElement("button");
  inner.append(innerClose);
  document.body.append(trigger, outer, inner);
  const dispose = installControlFocusVisibility(document);
  const click = (target: HTMLElement) => {
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    target.focus();
  };
  try {
    click(trigger);
    outer.focus();
    click(innerTrigger);
    inner.focus();
    click(innerClose);
    inner.remove();
    innerTrigger.focus();
    expect(document.documentElement.dataset.pointerFocus).toBe("true");
    click(outerClose);
    outer.remove();
    trigger.focus();
    expect(document.documentElement.dataset.pointerFocus).toBe("true");
  } finally {
    dispose();
    trigger.remove();
    outer.remove();
    inner.remove();
  }
});

it("keeps a pointer backdrop dismissal outline-free, without granting its return to a different field", () => {
  const trigger = document.createElement("button");
  const popup = document.createElement("div");
  popup.setAttribute("role", "dialog");
  popup.tabIndex = -1;
  const backdrop = document.createElement("div");
  const field = document.createElement("input");
  document.body.append(trigger, popup, backdrop, field);
  const dispose = installControlFocusVisibility(document);
  try {
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    trigger.focus();
    popup.focus();
    backdrop.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    popup.remove();
    trigger.focus();
    expect(document.documentElement.dataset.pointerFocus).toBe("true");
    document.body.append(popup);
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    popup.focus();
    field.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    field.focus();
    trigger.focus();
    expect(document.documentElement.dataset.pointerFocus).toBeUndefined();
  } finally {
    dispose();
    trigger.remove();
    popup.remove();
    backdrop.remove();
    field.remove();
  }
});
