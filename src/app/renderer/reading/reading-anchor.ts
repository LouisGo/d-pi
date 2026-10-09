import {
  captureReadingAnchor,
  type ReadingPositions,
  type ReadingRow,
  resolveReadingAnchor,
} from "../../../modules/conversation/core/public";

export interface ReadingAnchorController {
  capture: (explicit?: boolean) => void;
  getSnapshot: () => boolean;
  subscribe: (listener: () => void) => () => void;
  position: (action: () => boolean) => boolean;
  toBottom: () => void;
  dispose: () => void;
}

/** One visible pane owns its DOM observers; Thread positions outlive this adapter. */
export function attachReadingAnchor({
  pane,
  positions,
  isVisible,
  pixel,
  rememberPixel,
  onTakeover,
}: {
  pane: HTMLElement;
  positions: ReadingPositions;
  isVisible: () => boolean;
  pixel: () => number;
  rememberPixel: (top: number) => void;
  onTakeover?: (() => void) | undefined;
}): ReadingAnchorController {
  let disposed = false;
  let frame: number | null = null;
  let restoring = false;
  let expectedTop: number | null = null;
  let currentSource: string | null = null;
  let atEnd = false;
  const listeners = new Set<() => void>();
  const publishAtEnd = (next: boolean) => {
    if (atEnd === next) return;
    atEnd = next;
    for (const listener of listeners) listener();
  };
  const visible = () =>
    !disposed &&
    isVisible() &&
    !pane.hidden &&
    pane.getClientRects().length > 0;
  const source = () => {
    const key = pane.querySelector<HTMLElement>("[data-reading-source]")
      ?.dataset.readingSource;
    return key && key.length <= 4096 ? key : null;
  };
  const geometry = (row: HTMLElement): ReadingRow | null => {
    const id = row.dataset.readingRow;
    if (!id) return null;
    const rect = row.getBoundingClientRect();
    return {
      id,
      top:
        rect.top -
        pane.getBoundingClientRect().top -
        pane.clientTop +
        pane.scrollTop,
      height: rect.height,
    };
  };
  const viewport = () => ({
    scrollTop: pane.scrollTop,
    clientHeight: pane.clientHeight,
    scrollHeight: pane.scrollHeight,
  });
  const currentRow = () => {
    // Ordered rows: only O(log n) layout reads, with no per-token geometry scan.
    const rows = pane.querySelectorAll<HTMLElement>("[data-reading-row]");
    let low = 0;
    let high = rows.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const row = rows[middle];
      const measured = row ? geometry(row) : null;
      if (measured && measured.top <= pane.scrollTop) low = middle + 1;
      else high = middle;
    }
    const row = rows[low - 1];
    return row ? geometry(row) : null;
  };
  const capture = (notifyTakeover = true) => {
    if (!visible()) return;
    const top = pane.scrollTop;
    if ((restoring || expectedTop !== null) && top === expectedTop) {
      expectedTop = null;
      return;
    }
    // A real user scroll takes ownership from a pending restoration.
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    restoring = false;
    if (notifyTakeover) onTakeover?.();
    if (source() !== currentSource) return;
    rememberPixel(top);
    const anchor = captureReadingAnchor(viewport(), currentRow());
    if (currentSource) positions.remember(currentSource, anchor);
    publishAtEnd(anchor.atEnd);
  };
  const takeOwnership = () => {
    if (!visible()) return;
    // Explicit outer input belongs to the committed DOM source even when its
    // first restore frame has not run. Ordinary late scroll events still do not
    // adopt a changed source in capture().
    currentSource = source();
    expectedTop = null;
    restoring = false;
    capture();
  };
  const consumedWithin = (target: EventTarget | null, direction: number) => {
    let element = target instanceof HTMLElement ? target : null;
    while (element && element !== pane) {
      const style = getComputedStyle(element);
      if (
        /auto|scroll|overlay/.test(style.overflowY) &&
        element.scrollHeight > element.clientHeight
      ) {
        const max = element.scrollHeight - element.clientHeight;
        if (
          (direction < 0 && element.scrollTop > 0) ||
          (direction > 0 && element.scrollTop < max) ||
          /contain|none/.test(
            style.overscrollBehaviorY || style.overscrollBehavior,
          )
        )
          return true;
      }
      element = element.parentElement;
    }
    return false;
  };
  const wheel = (event: WheelEvent) => {
    if (event.deltaY !== 0 && !consumedWithin(event.target, event.deltaY))
      takeOwnership();
  };
  const keydown = (event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (
      event.isComposing ||
      event.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      target?.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable=false])",
      ) ||
      (event.key === " " && target?.closest("button, a, summary"))
    )
      return;
    const direction =
      /^(ArrowUp|PageUp|Home)$/.test(event.key) ||
      (event.key === " " && event.shiftKey)
        ? -1
        : /^(ArrowDown|PageDown|End| )$/.test(event.key)
          ? 1
          : 0;
    if (direction && !consumedWithin(event.target, direction)) takeOwnership();
  };
  const pointerdown = (event: PointerEvent) => {
    // Native scrollbar dragging targets the pane; text selection targets its content.
    if (event.target === pane) takeOwnership();
  };
  pane.addEventListener("wheel", wheel, { passive: true });
  pane.addEventListener("keydown", keydown);
  pane.addEventListener("pointerdown", pointerdown);
  const apply = () => {
    if (!visible()) return;
    currentSource = source();
    const anchor = currentSource ? positions.get(currentSource) : undefined;
    let top = currentSource ? 0 : pixel();
    if (anchor) {
      const row = anchor.rowId
        ? pane.querySelector<HTMLElement>(
            `[data-reading-row="${CSS.escape(anchor.rowId)}"]`,
          )
        : null;
      top = resolveReadingAnchor(
        anchor,
        viewport(),
        row ? geometry(row) : null,
      );
    }
    pane.scrollTop = top;
    expectedTop = pane.scrollTop;
    const reachedEnd = captureReadingAnchor(viewport(), null).atEnd;
    if (currentSource && anchor && anchor.atEnd !== reachedEnd)
      positions.remember(
        currentSource,
        captureReadingAnchor(viewport(), currentRow()),
      );
    publishAtEnd(reachedEnd);
  };
  const refresh = () => {
    if (!visible() || frame !== null) return;
    restoring = true;
    expectedTop = pane.scrollTop;
    frame = requestAnimationFrame(() => {
      frame = null;
      apply();
      restoring = false;
      if (visible() && currentSource && !positions.get(currentSource))
        positions.remember(
          currentSource,
          captureReadingAnchor(viewport(), currentRow()),
        );
    });
  };
  restoring = true;
  apply();
  refresh();
  const resize =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refresh);
  resize?.observe(pane);
  let content = pane.firstElementChild;
  if (content) resize?.observe(content);
  const mutation = new MutationObserver(() => {
    if (pane.firstElementChild !== content) {
      if (content) resize?.unobserve(content);
      content = pane.firstElementChild;
      if (content) resize?.observe(content);
    }
    refresh();
  });
  mutation.observe(pane, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-reading-source", "data-reading-row", "open"],
  });
  return {
    capture,
    getSnapshot: () => atEnd,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    position(action: () => boolean): boolean {
      if (!visible()) return false;
      takeOwnership();
      const positioned = action();
      expectedTop = null;
      capture(false);
      expectedTop = pane.scrollTop;
      return positioned;
    },
    toBottom() {
      if (!visible()) return;
      takeOwnership();
      currentSource = source();
      pane.scrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight);
      const anchor = captureReadingAnchor(viewport(), currentRow());
      rememberPixel(pane.scrollTop);
      if (currentSource) positions.remember(currentSource, anchor);
      expectedTop = pane.scrollTop;
      publishAtEnd(anchor.atEnd);
    },
    dispose() {
      if (disposed) return;
      if (!restoring && expectedTop === null) capture(false);
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      resize?.disconnect();
      mutation.disconnect();
      listeners.clear();
      pane.removeEventListener("wheel", wheel);
      pane.removeEventListener("keydown", keydown);
      pane.removeEventListener("pointerdown", pointerdown);
    },
  };
}
