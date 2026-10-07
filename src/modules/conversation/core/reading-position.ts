import { match } from "ts-pattern";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { HistoryCursor } from "../contracts/public";

export type ReadingSource =
  | { kind: "live"; threadId: string; generation: string }
  | {
      kind: "native";
      threadId: string;
      sessionKey: string;
      source: string;
      pageOffset: number;
    }
  | { kind: "view"; threadId: string; view: "files" | "submissions" };

export function readingSourceKey(source: ReadingSource): string {
  return match(source)
    .with({ kind: "live" }, (s) =>
      JSON.stringify([s.kind, s.threadId, s.generation]),
    )
    .with({ kind: "native" }, (s) =>
      JSON.stringify([
        s.kind,
        s.threadId,
        s.sessionKey,
        s.source,
        s.pageOffset,
      ]),
    )
    .with({ kind: "view" }, (s) => JSON.stringify([s.kind, s.threadId, s.view]))
    .exhaustive();
}
export interface ReadingAnchor {
  readonly rowId: string | null;
  readonly offsetWithinRow: number;
  readonly pixel: number;
  readonly atEnd: boolean;
}
export interface ReadingBodyPosition {
  readonly page: number;
  readonly scrollTop: number;
}
export interface ReadingRow {
  readonly id: string;
  readonly top: number;
  readonly height: number;
}
interface Viewport {
  readonly scrollTop: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
}
const nonnegative = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

/** Geometry is supplied by a Renderer adapter; this model never reads the DOM. */
export function captureReadingAnchor(
  viewport: Viewport,
  row: ReadingRow | null,
): ReadingAnchor {
  const pixel = nonnegative(viewport.scrollTop);
  const onRow = row && Number.isFinite(row.top) && pixel >= row.top;
  return {
    rowId: onRow ? row.id : null,
    offsetWithinRow: onRow ? pixel - row.top : 0,
    pixel,
    atEnd:
      viewport.clientHeight > 0 &&
      viewport.scrollHeight - pixel - viewport.clientHeight <= 2,
  };
}
export function resolveReadingAnchor(
  anchor: ReadingAnchor,
  viewport: Pick<Viewport, "clientHeight" | "scrollHeight">,
  row: ReadingRow | null,
): number {
  const max = nonnegative(viewport.scrollHeight - viewport.clientHeight);
  if (anchor.atEnd) return max;
  const position =
    row && row.id === anchor.rowId && Number.isFinite(row.top)
      ? row.top +
        Math.min(
          nonnegative(anchor.offsetWithinRow),
          Math.max(0, nonnegative(row.height) - 1),
        )
      : anchor.pixel;
  return Math.min(max, nonnegative(position));
}
export interface HistoryPosition {
  readonly choice: string | null;
  readonly cursor: HistoryCursor | null;
  readonly readBound: boolean;
}
interface PositionsState {
  history: HistoryPosition;
  anchors: ReadonlyMap<string, ReadingAnchor>;
  bodies: ReadonlyMap<string, ReadingBodyPosition>;
}
const positionStore = () =>
  createStore<PositionsState>()(
    subscribeWithSelector(
      (): PositionsState => ({
        anchors: new Map(),
        bodies: new Map(),
        history: { choice: null, cursor: null, readBound: false },
      }),
    ),
  );
type PositionStore = ReturnType<typeof positionStore>;

function remember<Value>(
  current: ReadonlyMap<string, Value>,
  key: string,
  value: Value,
  limit: number,
) {
  const next = new Map(current);
  next.delete(key);
  next.set(key, value);
  if (next.size > limit) {
    const oldest = next.keys().next().value;
    if (oldest !== undefined) next.delete(oldest);
  }
  return next;
}
/** Thread-owned, bounded presentation coordinates. It retains no message bodies. */
export class ReadingPositions {
  private readonly store = positionStore();
  private disposed = false;
  readonly stateStore: Pick<
    PositionStore,
    "getState" | "getInitialState" | "subscribe"
  > = this.store;
  get(source: string): ReadingAnchor | undefined {
    return this.store.getState().anchors.get(source);
  }
  body(key: string): ReadingBodyPosition | undefined {
    return this.store.getState().bodies.get(key);
  }
  remember(source: string, anchor: ReadingAnchor): void {
    if (this.disposed || source.length > 4096) return;
    const safeAnchor = {
      ...anchor,
      rowId: anchor.rowId && anchor.rowId.length <= 4096 ? anchor.rowId : null,
    };
    this.store.setState((state) => ({
      anchors: remember(state.anchors, source, safeAnchor, 32),
    }));
  }
  rememberBody(key: string, body: ReadingBodyPosition): void {
    if (this.disposed || key.length > 4096) return;
    this.store.setState((state) => ({
      bodies: remember(
        state.bodies,
        key,
        {
          page: Math.floor(nonnegative(body.page)),
          scrollTop: nonnegative(body.scrollTop),
        },
        128,
      ),
    }));
  }
  rememberHistory(history: HistoryPosition): void {
    if (
      this.disposed ||
      (history.choice?.length ?? 0) > 4096 ||
      (history.cursor?.source.length ?? 0) > 4096
    )
      return;
    this.store.setState({
      history: {
        ...history,
        cursor: history.cursor ? { ...history.cursor } : null,
      },
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
  }
  clear(): void {
    this.store.setState({
      anchors: new Map(),
      bodies: new Map(),
      history: { choice: null, cursor: null, readBound: false },
    });
  }
}
