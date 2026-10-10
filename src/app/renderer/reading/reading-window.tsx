import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { flushSync } from "react-dom";
import type {
  ReadingPositions,
  ReadingRow,
} from "../../../modules/conversation/core/public";

export interface WindowRow {
  id: string;
  turn?: string | undefined;
  preview?: (() => { question: string; reply: string }) | undefined;
  pinned?: (() => boolean) | undefined;
}
export interface ReadingWindowController {
  rows: readonly WindowRow[];
  row: (id: string) => ReadingRow | null;
  currentRow: () => ReadingRow | null;
  mount: (id: string) => boolean;
}
const windows = new WeakMap<HTMLElement, ReadingWindowController>();
export const readingWindow = (pane: HTMLElement) => windows.get(pane);
// Coordinates only; lifetime follows the existing Thread-owned position resource.
const measurements = new WeakMap<
  ReadingPositions,
  Map<string, Map<string, number>>
>();
function heightCache(positions: ReadingPositions | undefined, source: string) {
  if (!positions) return new Map<string, number>();
  let sources = measurements.get(positions);
  if (!sources) measurements.set(positions, (sources = new Map()));
  let cache = sources.get(source);
  if (!cache) {
    if (sources.size >= 32) {
      const oldest = sources.keys().next().value;
      if (oldest !== undefined) sources.delete(oldest);
    }
    sources.set(source, (cache = new Map()));
  }
  return cache;
}

function hasReadingLayout(pane: HTMLElement) {
  if (pane.closest("[hidden]")) return false;
  const rect = pane.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Contiguous normal-flow bodies, with measured spacers only for unmounted rows. */
export function ReadingWindow({
  rows,
  source,
  positions,
  renderRow,
}: {
  rows: readonly WindowRow[];
  source: string;
  positions?: ReadingPositions | undefined;
  renderRow: (row: WindowRow, index: number) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const state = useMemo(
    () => ({
      heights: heightCache(positions, source),
      tree: [0],
      sizes: [] as number[],
      indices: new Map<string, number>(),
      nodes: new Map<string, HTMLElement>(),
      pane: null as HTMLElement | null,
      top: positions?.get(source)?.pixel ?? 0,
      height: 600,
      origin: 0,
      target: null as string | null,
      pointer: null as string | null,
      gap: 0,
    }),
    [positions, source],
  );
  state.indices = useMemo(
    () => new Map(rows.map((row, index) => [row.id, index])),
    [rows],
  );
  const geometryIndex = useMemo(() => {
    const sizes = rows.map(
      (row) => (state.heights.get(row.id) ?? 120) + state.gap,
    );
    const tree = [0, ...sizes];
    for (let index = 1; index < tree.length; index++) {
      const parent = index + (index & -index);
      if (parent < tree.length)
        tree[parent] = (tree[parent] ?? 0) + (tree[index] ?? 0);
    }
    return { sizes, tree };
  }, [rows, state, state.gap]);
  state.tree = geometryIndex.tree;
  state.sizes = geometryIndex.sizes;
  // Fenwick coordinates: streamed height updates and offscreen lookup are O(log n).
  const offset = (index: number) => {
    let top = 0;
    for (let cursor = index; cursor > 0; cursor -= cursor & -cursor)
      top += state.tree[cursor] ?? 0;
    return top;
  };
  const pinCandidates = useMemo(
    () => rows.flatMap((row, index) => (row.pinned ? [{ row, index }] : [])),
    [rows],
  );
  const indexAt = (top: number) => {
    let index = 0;
    let remaining = Math.max(0, top);
    for (
      let bit = 2 ** Math.floor(Math.log2(Math.max(1, rows.length)));
      bit > 0;
      bit >>>= 1
    ) {
      const next = index + bit;
      if (next <= rows.length && (state.tree[next] ?? Infinity) <= remaining) {
        remaining -= state.tree[next] ?? 0;
        index = next;
      }
    }
    return Math.min(Math.max(0, rows.length - 1), index);
  };
  const rowGeometry = (id: string): ReadingRow | null => {
    const index = state.indices.get(id);
    if (index === undefined) return null;
    const node = state.nodes.get(id);
    const pane = state.pane;
    if (node && pane && hasReadingLayout(pane)) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          id,
          top:
            rect.top -
            pane.getBoundingClientRect().top -
            pane.clientTop +
            pane.scrollTop,
          height: rect.height,
        };
      }
    }
    return {
      id,
      top: state.origin + offset(index),
      height: state.heights.get(id) ?? 120,
    };
  };
  const controller: ReadingWindowController = {
    rows,
    row: rowGeometry,
    currentRow: () => {
      const id = rows[indexAt((state.pane?.scrollTop ?? 0) - state.origin)]?.id;
      return id ? rowGeometry(id) : null;
    },
    mount: (id) => {
      const geometry = rowGeometry(id);
      if (!geometry || !state.pane) return false;
      state.target = id;
      state.top = geometry.top;
      state.pane.scrollTop = geometry.top;
      flushSync(redraw);
      return true;
    },
  };
  useLayoutEffect(() => {
    const element = root.current;
    const pane = element?.closest<HTMLElement>("[data-reading-pane]");
    if (!element || !pane) return;
    state.pane = pane;
    let frame: number | null = null;
    const update = () => {
      frame = null;
      if (!hasReadingLayout(pane)) return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      state.origin =
        rect.top -
        pane.getBoundingClientRect().top -
        pane.clientTop +
        pane.scrollTop;
      state.top = pane.scrollTop;
      state.height = pane.clientHeight || 600;
      redraw();
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };
    const pointerdown = (event: PointerEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-reading-row]")
          : null;
      state.pointer =
        target && element.contains(target)
          ? (target.dataset.readingRow ?? null)
          : null;
    };
    const pointerup = () => {
      state.pointer = null;
      schedule();
    };
    element.addEventListener("pointerdown", pointerdown);
    document.addEventListener("pointerup", pointerup);
    document.addEventListener("pointercancel", pointerup);
    pane.addEventListener("scroll", schedule, { passive: true });
    pane.addEventListener("focusin", schedule);
    pane.addEventListener("focusout", schedule);
    element.addEventListener("toggle", schedule, true);
    document.addEventListener("selectionchange", schedule);
    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    resize?.observe(pane);
    update();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      resize?.disconnect();
      pane.removeEventListener("scroll", schedule);
      pane.removeEventListener("focusin", schedule);
      pane.removeEventListener("focusout", schedule);
      element.removeEventListener("toggle", schedule, true);
      document.removeEventListener("selectionchange", schedule);
      element.removeEventListener("pointerdown", pointerdown);
      document.removeEventListener("pointerup", pointerup);
      document.removeEventListener("pointercancel", pointerup);
      windows.delete(pane);
      state.pane = null;
    };
  }, [state]);
  useLayoutEffect(() => {
    const element = root.current;
    const pane = state.pane;
    if (!element || !pane) return;
    if (hasReadingLayout(pane)) {
      const gap = Number.parseFloat(getComputedStyle(element).rowGap) || 0;
      if (gap !== state.gap) {
        state.gap = gap;
        redraw();
      }
    }
    windows.set(pane, controller);
    state.nodes = new Map(
      [...element.querySelectorAll<HTMLElement>("[data-reading-row]")].map(
        (node) => [node.dataset.readingRow ?? "", node],
      ),
    );
    const measure = () => {
      if (!hasReadingLayout(pane)) return;
      let changed = false;
      for (const [id, node] of state.nodes) {
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        // Include normal-flow margins (not just the content box).
        const style = getComputedStyle(node);
        const height =
          rect.height +
          (Number.parseFloat(style.marginTop) || 0) +
          (Number.parseFloat(style.marginBottom) || 0);
        if (
          height > 0 &&
          Math.abs(height - (state.heights.get(id) ?? 120)) > 0.5
        ) {
          state.heights.set(id, height);
          const index = state.indices.get(id);
          if (index !== undefined) {
            const size = height + state.gap;
            const delta = size - (state.sizes[index] ?? 0);
            state.sizes[index] = size;
            for (
              let cursor = index + 1;
              cursor < state.tree.length;
              cursor += cursor & -cursor
            )
              state.tree[cursor] = (state.tree[cursor] ?? 0) + delta;
          }
          changed = true;
        }
      }
      if (changed) redraw();
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    for (const node of state.nodes.values()) observer?.observe(node);
    pane.dispatchEvent(new Event("reading-window-change"));
    return () => observer?.disconnect();
  });
  const start = indexAt(Math.max(0, state.top - state.origin - state.height));
  const end = Math.min(
    rows.length,
    indexAt(state.top - state.origin + state.height * 2) + 2,
  );
  const mounted = new Set<number>();
  for (let i = start; i < end; i++) mounted.add(i);
  // Inspect only mounted interaction nodes before deciding what may unmount.
  // This also covers append commits before the browser's selectionchange event.
  const selection = document.getSelection();
  const ranges =
    selection && !selection.isCollapsed
      ? Array.from({ length: selection.rangeCount }, (_, index) =>
          selection.getRangeAt(index),
        )
      : [];
  for (const [id, node] of state.nodes) {
    if (
      ranges.some((range) => range.intersectsNode(node)) ||
      (document.activeElement && node.contains(document.activeElement)) ||
      node.querySelector(
        "details[open], [aria-expanded=true], [data-state=streaming], [data-reading-view-open]",
      )
    ) {
      const index = state.indices.get(id);
      if (index !== undefined) mounted.add(index);
    }
  }
  if (state.target) {
    const index = state.indices.get(state.target);
    if (index !== undefined) mounted.add(index);
    state.target = null;
  }
  if (state.pointer) {
    const index = state.indices.get(state.pointer);
    if (index !== undefined) mounted.add(index);
  }
  for (const { row, index } of pinCandidates)
    if (row.pinned?.()) mounted.add(index);
  const content: ReactNode[] = [];
  let previous = 0;
  for (const index of [...mounted].sort((a, b) => a - b)) {
    if (index > previous)
      content.push(
        <div
          key={`gap:${previous}`}
          aria-hidden="true"
          data-reading-spacer=""
          className="reading-window-spacer"
          style={
            {
              "--reading-spacer-height": `${Math.max(0, offset(index) - offset(previous) - state.gap)}px`,
            } as CSSProperties
          }
        />,
      );
    const row = rows[index];
    if (row)
      content.push(<Fragment key={row.id}>{renderRow(row, index)}</Fragment>);
    previous = index + 1;
  }
  if (previous < rows.length)
    content.push(
      <div
        key="gap:end"
        aria-hidden="true"
        data-reading-spacer=""
        className="reading-window-spacer"
        style={
          {
            "--reading-spacer-height": `${Math.max(0, offset(rows.length) - offset(previous) - state.gap)}px`,
          } as CSSProperties
        }
      />,
    );
  return (
    <div ref={root} className="conversation-window" data-reading-window="">
      {content}
    </div>
  );
}
