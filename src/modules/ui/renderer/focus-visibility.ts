/** Preserve browser accessibility heuristics, while suppressing pointer focus
 * outlines even on text inputs that always match :focus-visible. */
export function installControlFocusVisibility(document: Document) {
  const root = document.documentElement;
  let pointerTarget: Element | null = null;
  let pointerFocusTarget: Element | null = null;
  let editingTarget: Element | null = null;
  const clearPointerFocus = () => {
    pointerTarget = null;
    pointerFocusTarget = null;
    editingTarget = null;
    delete root.dataset.pointerFocus;
  };
  const pointerDown = (event: PointerEvent) => {
    pointerTarget = event.target instanceof Element ? event.target : null;
    pointerFocusTarget = null;
    editingTarget = null;
    root.dataset.pointerFocus = "true";
  };
  const pointerOver = (event: PointerEvent) => {
    // Hover menus can autofocus their portal before any pointer press or
    // trigger focus. Record that source before the delayed open runs.
    const trigger =
      event.target instanceof Element
        ? event.target.closest('[aria-haspopup="menu"]')
        : null;
    if (trigger) {
      pointerTarget = trigger;
      pointerFocusTarget = null;
      editingTarget = null;
      root.dataset.pointerFocus = "true";
    }
  };
  const keyDown = (event: KeyboardEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const field = target?.closest(
      'input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]',
    );
    const textField =
      field &&
      (!(field instanceof HTMLInputElement) ||
        [
          "text",
          "search",
          "email",
          "url",
          "tel",
          "password",
          "number",
        ].includes(field.type));
    // Caret movement, spaces, Enter and IME edit the same clicked field. They
    // do not turn its existing pointer focus into keyboard navigation focus.
    // A subsequent distinct focus move still gets the accessibility outline.
    if (textField && event.key !== "Tab") {
      editingTarget = field;
      return;
    }
    // Typing into a clicked input does not change how its focus was obtained.
    // Navigation and keyboard activation can move focus into a portal as well.
    if (
      [
        "Tab",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "PageUp",
        "PageDown",
        "Enter",
        " ",
        "Escape",
      ].includes(event.key)
    ) {
      clearPointerFocus();
    }
  };
  const focusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (editingTarget && !editingTarget.contains(target)) {
      clearPointerFocus();
      return;
    }
    // A distinct focus move without a related pointer press can come from
    // assistive technology or programmatic keyboard navigation. Let the
    // browser's :focus-visible decision apply to that destination.
    const fromTrigger =
      event.relatedTarget instanceof Element &&
      !!pointerTarget &&
      (pointerTarget.contains(event.relatedTarget) ||
        event.relatedTarget.contains(pointerTarget));
    const controlledPopup = pointerTarget?.closest("[aria-controls]");
    const fromControlledTrigger = controlledPopup
      ?.getAttribute("aria-controls")
      ?.split(/\s+/)
      .some((id) => document.getElementById(id)?.contains(target));
    // Native dialogs/window activation can restore the current DOM focus
    // without a relatedTarget. Keep its established pointer origin; this
    // does not grant that origin to a different destination or survive Tab.
    const returningToPointerFocus =
      event.relatedTarget === null && target === pointerFocusTarget;
    if (
      !pointerTarget ||
      (!pointerTarget.contains(target) &&
        !target.contains(pointerTarget) &&
        !fromTrigger &&
        !fromControlledTrigger &&
        !returningToPointerFocus)
    ) {
      clearPointerFocus();
    } else pointerFocusTarget = target;
  };
  document.addEventListener("pointerdown", pointerDown, true);
  document.addEventListener("pointerover", pointerOver, true);
  document.addEventListener("keydown", keyDown, true);
  document.addEventListener("focusin", focusIn, true);
  return () => {
    document.removeEventListener("pointerdown", pointerDown, true);
    document.removeEventListener("pointerover", pointerOver, true);
    document.removeEventListener("keydown", keyDown, true);
    document.removeEventListener("focusin", focusIn, true);
    clearPointerFocus();
  };
}
