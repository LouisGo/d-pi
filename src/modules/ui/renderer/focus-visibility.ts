/** Preserve browser accessibility heuristics, while suppressing pointer focus
 * outlines even on text inputs that always match :focus-visible. */
export function installControlFocusVisibility(document: Document) {
  const root = document.documentElement;
  let pointerTarget: Element | null = null;
  const clearPointerFocus = () => {
    pointerTarget = null;
    delete root.dataset.pointerFocus;
  };
  const pointerDown = (event: PointerEvent) => {
    pointerTarget = event.target instanceof Element ? event.target : null;
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
      root.dataset.pointerFocus = "true";
    }
  };
  const keyDown = (event: KeyboardEvent) => {
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
    if (
      !pointerTarget ||
      (!pointerTarget.contains(target) &&
        !target.contains(pointerTarget) &&
        !fromTrigger &&
        !fromControlledTrigger)
    ) {
      clearPointerFocus();
    }
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
