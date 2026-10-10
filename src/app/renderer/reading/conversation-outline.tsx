import {
  type CSSProperties,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  createHoverCardHandle,
  HoverCardPopup,
} from "../../../modules/ui/renderer/public";
import {
  ConversationTurnAnchor,
  type TurnPreviewPayload,
} from "./conversation-turn-anchor";
import type { ReadingAnchorController } from "./reading-anchor";
import { readingWindow, type WindowRow } from "./reading-window";
import {
  ConversationTurnPreview,
  WindowTurnPreview,
} from "./turn-preview-card";

interface Turn {
  id: string;
  preview: string;
  payload: TurnPreviewPayload;
  node: HTMLElement | null;
}
const selector = "[data-conversation-turn]";
function touchesTurns(record: MutationRecord): boolean {
  if (record.type === "attributes") return true;
  return [...record.addedNodes, ...record.removedNodes].some(
    (node) =>
      node instanceof HTMLElement &&
      (node.matches(selector) || !!node.querySelector(selector)),
  );
}

function computeTurnMarkWidth(
  index: number,
  activeIndex: number,
  focalIndex: number | null,
): number {
  if (focalIndex === null) {
    return index === activeIndex ? 12 : 7;
  }
  const dist = Math.abs(index - focalIndex);
  if (dist === 0) return 32;
  if (dist === 1) return 22;
  if (dist === 2) return 15;
  if (dist === 3) return 10;
  return 7;
}

function computeTurnMarkOpacity(
  index: number,
  activeIndex: number,
  focalIndex: number | null,
): number {
  if (focalIndex === null) {
    return index === activeIndex ? 0.95 : 0.28;
  }
  const dist = Math.abs(index - focalIndex);
  if (dist === 0) return 1.0;
  if (dist === 1) return 0.72;
  if (dist === 2) return 0.5;
  if (dist === 3) return 0.35;
  return index === activeIndex ? 0.75 : 0.25;
}

/** View-only outline of the committed timeline. No transcript cache or live-token subscription. */
export function ConversationOutline({
  pane,
  anchor,
}: {
  pane: HTMLElement;
  anchor: Pick<ReadingAnchorController, "position"> &
    Partial<Pick<ReadingAnchorController, "toRow">>;
}) {
  const { t } = useI18n();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const nav = useRef<HTMLElement>(null);
  const [outlineTop, setOutlineTop] = useState(0);
  const [outlinePitch, setOutlinePitch] = useState(11);
  useLayoutEffect(() => {
    const element = nav.current;
    const button = element?.querySelector<HTMLElement>("[data-turn-target]");
    if (!element || !button) return;
    const height = button.getBoundingClientRect().height;
    const gap = Number.parseFloat(getComputedStyle(element).rowGap) || 0;
    if (height > 0) setOutlinePitch(height + gap);
  }, [turns]);
  useLayoutEffect(() => {
    let rows: readonly Turn[] = [];
    let frame: number | null = null;
    let disposed = false;
    let previousWindowRows: readonly WindowRow[] | undefined;
    const markActive = () => {
      frame = null;
      if (disposed) return;
      const top = pane.getBoundingClientRect().top + pane.clientTop + 24;
      let low = 0;
      let high = rows.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        const turn = rows[middle];
        const geometry = turn ? readingWindow(pane)?.row(turn.id) : null;
        const rowTop = geometry
          ? geometry.top -
            pane.scrollTop +
            pane.getBoundingClientRect().top +
            pane.clientTop
          : (turn?.node?.getBoundingClientRect().top ?? Infinity);
        if (rowTop <= top) low = middle + 1;
        else high = middle;
      }
      const atEnd = pane.scrollHeight - pane.clientHeight - pane.scrollTop <= 2;
      setActive((atEnd ? rows.at(-1) : rows[Math.max(0, low - 1)])?.id ?? null);
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(markActive);
    };
    const rebuild = () => {
      const window = readingWindow(pane);
      if (window) {
        if (previousWindowRows === window.rows) {
          schedule();
          return;
        }
        previousWindowRows = window.rows;
        rows = window.rows.flatMap((row) => {
          if (row.turn === undefined) return [];
          const node = null;
          const payload = {
            id: row.id,
            number: 0,
            node,
            preview: row.turn,
            read: row.preview,
          };
          return [{ id: row.id, preview: row.turn, payload, node }];
        });
        rows.forEach((turn, index) => {
          turn.payload.number = index + 1;
        });
        setTurns(rows);
        schedule();
        return;
      }
      const turnNodes = [...pane.querySelectorAll<HTMLElement>(selector)];
      rows = turnNodes.flatMap((node, index) => {
        const id = node.dataset.conversationTurn;
        if (!id) return [];
        const preview = node.dataset.turnPreview ?? "";
        const number = index + 1;
        const payload = { id, number, node, preview };
        return [{ id, preview, payload, node }];
      });
      setTurns(rows);
      schedule();
    };
    const observer = new MutationObserver((records) => {
      if (records.some(touchesTurns)) rebuild();
    });
    observer.observe(pane, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-conversation-turn", "data-turn-preview"],
    });
    pane.addEventListener("scroll", schedule, { passive: true });
    pane.addEventListener("reading-window-change", rebuild);
    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    resize?.observe(pane);
    rebuild();
    return () => {
      disposed = true;
      observer.disconnect();
      resize?.disconnect();
      pane.removeEventListener("reading-window-change", rebuild);
      pane.removeEventListener("scroll", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [pane]);
  const hoverCardHandle = useMemo(
    () => createHoverCardHandle<TurnPreviewPayload>(),
    [],
  );
  if (turns.length < 2) return null;
  const focalIndex = hoveredIndex ?? focusedIndex;
  const activeIndex = turns.findIndex((turn) => turn.id === active);
  const outlineStart = Math.min(
    Math.max(0, turns.length - 80),
    Math.max(0, Math.floor(outlineTop / outlinePitch) - 5),
  );
  const outlineEnd = Math.min(turns.length, outlineStart + 80);

  return (
    <nav
      ref={nav}
      onScroll={(event) => setOutlineTop(event.currentTarget.scrollTop)}
      className="conversation-outline"
      aria-label={t("ui.conversation.turns")}
      onPointerLeave={() => setHoveredIndex(null)}
    >
      {outlineStart > 0 && (
        <div
          aria-hidden="true"
          className="reading-window-spacer"
          style={
            {
              "--reading-spacer-height": `${outlineStart * outlinePitch - 1}px`,
            } as CSSProperties
          }
        />
      )}
      {turns.slice(outlineStart, outlineEnd).map((turn, localIndex) => {
        const index = outlineStart + localIndex;
        return (
          <ConversationTurnAnchor
            key={turn.id}
            turn={turn}
            number={index + 1}
            active={active === turn.id}
            tabIndex={
              active === turn.id ||
              ((activeIndex < outlineStart || activeIndex >= outlineEnd) &&
                index === outlineStart) ||
              (!active && index === 0)
                ? 0
                : -1
            }
            markWidth={computeTurnMarkWidth(index, activeIndex, focalIndex)}
            markOpacity={computeTurnMarkOpacity(index, activeIndex, focalIndex)}
            handle={hoverCardHandle}
            payload={turn.payload}
            onPointerEnter={() => setHoveredIndex(index)}
            onFocus={(event) => {
              if (event.currentTarget.matches(":focus-visible")) {
                setFocusedIndex(index);
              }
            }}
            onBlur={() =>
              setFocusedIndex((prev) => (prev === index ? null : prev))
            }
            onNavigate={() => {
              if (readingWindow(pane) && anchor.toRow) {
                if (anchor.toRow(turn.id)) setActive(turn.id);
                return;
              }
              const node = turn.node;
              if (!node?.isConnected || !pane.contains(node)) return;
              anchor.position(() => {
                // Round toward the row: capturing the preceding gap would let
                // its shorter row clamp the offset on the next streamed update.
                pane.scrollTop = Math.max(
                  0,
                  Math.ceil(
                    pane.scrollTop +
                      node.getBoundingClientRect().top -
                      pane.getBoundingClientRect().top -
                      pane.clientTop,
                  ),
                );
                return true;
              });
              setActive(turn.id);
            }}
            onKeyDown={(event) => {
              const element = event.currentTarget.parentElement;
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? turns.length - 1
                    : event.key === "ArrowDown" || event.key === "ArrowRight"
                      ? Math.min(index + 1, turns.length - 1)
                      : event.key === "ArrowUp" || event.key === "ArrowLeft"
                        ? Math.max(0, index - 1)
                        : null;
              if (next === null) return;
              event.preventDefault();
              if (next < outlineStart || next >= outlineEnd) {
                flushSync(() => setOutlineTop(next * outlinePitch));
                if (nav.current) nav.current.scrollTop = next * outlinePitch;
              }
              const target = turns[next];
              if (target)
                element
                  ?.querySelector<HTMLButtonElement>(
                    `[data-turn-target="${CSS.escape(target.id)}"]`,
                  )
                  ?.focus();
            }}
          />
        );
      })}
      {outlineEnd < turns.length && (
        <div
          aria-hidden="true"
          className="reading-window-spacer"
          style={
            {
              "--reading-spacer-height": `${(turns.length - outlineEnd) * outlinePitch - 1}px`,
            } as CSSProperties
          }
        />
      )}
      <HoverCardPopup handle={hoverCardHandle} side="right" sideOffset={8}>
        {(payload) =>
          payload?.read ? (
            <WindowTurnPreview
              key={payload.id}
              number={payload.number}
              pane={pane}
              read={payload.read}
            />
          ) : payload?.node ? (
            <ConversationTurnPreview
              key={payload.id}
              number={payload.number}
              node={payload.node}
              preview={payload.preview}
            />
          ) : null
        }
      </HoverCardPopup>
    </nav>
  );
}
