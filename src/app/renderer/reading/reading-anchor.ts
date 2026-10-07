import {
  captureReadingAnchor,
  type ReadingPositions,
  type ReadingRow,
  resolveReadingAnchor,
} from "../../../modules/conversation/core/public";

/** One visible pane owns its DOM observers; Thread positions outlive this adapter. */
export function attachReadingAnchor({
  pane,
  positions,
  isVisible,
  pixel,
  rememberPixel,
}: {
  pane: HTMLElement;
  positions: ReadingPositions;
  isVisible: () => boolean;
  pixel: () => number;
  rememberPixel: (top: number) => void;
}) {
  let disposed = false;
  let frame: number | null = null;
  let restoring = false;
  let expectedTop: number | null = null;
  let currentSource: string | null = null;
  const visible = () =>
    !disposed &&
    isVisible() &&
    !pane.hidden &&
    pane.getClientRects().length > 0;
  const source = () =>
    pane.querySelector<HTMLElement>("[data-reading-source]")?.dataset
      .readingSource ?? null;
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
  const capture = () => {
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
    if (source() !== currentSource) return;
    rememberPixel(top);
    if (currentSource)
      positions.remember(
        currentSource,
        captureReadingAnchor(viewport(), currentRow()),
      );
  };
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
    dispose() {
      if (disposed) return;
      if (!restoring && expectedTop === null) capture();
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      resize?.disconnect();
      mutation.disconnect();
    },
  };
}
