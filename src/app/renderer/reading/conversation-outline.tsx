import { useLayoutEffect, useMemo, useState } from "react";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  createHoverCardHandle,
  HoverCardPopup,
} from "../../../modules/ui/renderer/public";
import {
  ConversationTurnAnchor,
  extractAssistantReply,
  type TurnPreviewPayload,
} from "./conversation-turn-anchor";
import type { ReadingAnchorController } from "./reading-anchor";
import { TurnPreviewCard } from "./turn-preview-card";

interface Turn {
  id: string;
  preview: string;
  payload: TurnPreviewPayload;
  node: HTMLElement;
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
  anchor: Pick<ReadingAnchorController, "position">;
}) {
  const { t } = useI18n();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  useLayoutEffect(() => {
    const cache = new Map<string, TurnPreviewPayload>();
    let rows: readonly Turn[] = [];
    let frame: number | null = null;
    let disposed = false;
    const markActive = () => {
      frame = null;
      if (disposed) return;
      const top = pane.getBoundingClientRect().top + pane.clientTop + 24;
      let low = 0;
      let high = rows.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if ((rows[middle]?.node.getBoundingClientRect().top ?? Infinity) <= top)
          low = middle + 1;
        else high = middle;
      }
      const atEnd = pane.scrollHeight - pane.clientHeight - pane.scrollTop <= 2;
      setActive((atEnd ? rows.at(-1) : rows[Math.max(0, low - 1)])?.id ?? null);
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(markActive);
    };
    const rebuild = () => {
      const turnNodes = [...pane.querySelectorAll<HTMLElement>(selector)];
      rows = turnNodes.flatMap((node, index) => {
        const id = node.dataset.conversationTurn;
        if (!id) return [];
        const preview = node.dataset.turnPreview ?? "";
        const number = index + 1;
        const cached = cache.get(id);
        const payload: TurnPreviewPayload =
          !cached || cached.preview !== preview || !cached.reply
            ? {
                id,
                number,
                question:
                  (
                    node.querySelector(":scope > .user-message-bubble") ??
                    node.querySelector("[data-reading-text]")
                  )?.textContent?.trim() || preview,
                reply: extractAssistantReply(node),
                preview,
              }
            : cached.number !== number
              ? { ...cached, number }
              : cached;
        cache.set(id, payload);
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

  return (
    <nav
      className="conversation-outline"
      aria-label={t("ui.conversation.turns")}
      onPointerLeave={(event) => {
        setHoveredIndex(null);
        setFocusedIndex(null);
        const activeEl = document.activeElement;
        if (
          activeEl instanceof HTMLElement &&
          event.currentTarget.contains(activeEl)
        ) {
          activeEl.blur();
        }
      }}
    >
      {turns.map((turn, index) => (
        <ConversationTurnAnchor
          key={turn.id}
          turn={turn}
          number={index + 1}
          active={active === turn.id}
          tabIndex={active === turn.id || (!active && index === 0) ? 0 : -1}
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
            if (!turn.node.isConnected || !pane.contains(turn.node)) return;
            anchor.position(() => {
              // Round toward the row: capturing the preceding gap would let
              // its shorter row clamp the offset on the next streamed update.
              pane.scrollTop = Math.max(
                0,
                Math.ceil(
                  pane.scrollTop +
                    turn.node.getBoundingClientRect().top -
                    pane.getBoundingClientRect().top -
                    pane.clientTop,
                ),
              );
              return true;
            });
            setActive(turn.id);
          }}
          onKeyDown={(event) => {
            const buttons = [
              ...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                "[data-turn-target]",
              ) ?? []),
            ];
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : event.key === "ArrowDown" || event.key === "ArrowRight"
                    ? Math.min(index + 1, buttons.length - 1)
                    : event.key === "ArrowUp" || event.key === "ArrowLeft"
                      ? Math.max(0, index - 1)
                      : null;
            if (next === null) return;
            event.preventDefault();
            buttons[next]?.focus();
          }}
        />
      ))}
      <HoverCardPopup handle={hoverCardHandle} side="right" sideOffset={8}>
        {(payload) =>
          payload ? (
            <TurnPreviewCard
              number={payload.number}
              question={payload.question}
              reply={payload.reply}
            />
          ) : null
        }
      </HoverCardPopup>
    </nav>
  );
}
