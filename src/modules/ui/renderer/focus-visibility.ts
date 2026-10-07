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
    if (
      !pointerTarget ||
      (!pointerTarget.contains(target) && !target.contains(pointerTarget))
    ) {
      clearPointerFocus();
    }
  };
  document.addEventListener("pointerdown", pointerDown, true);
  document.addEventListener("keydown", keyDown, true);
  document.addEventListener("focusin", focusIn, true);
  return () => {
    document.removeEventListener("pointerdown", pointerDown, true);
    document.removeEventListener("keydown", keyDown, true);
    document.removeEventListener("focusin", focusIn, true);
    clearPointerFocus();
  };
}
