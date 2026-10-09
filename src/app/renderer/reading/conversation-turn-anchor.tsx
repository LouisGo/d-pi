import type {
  CSSProperties,
  FocusEventHandler,
  KeyboardEventHandler,
} from "react";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Button,
  type HoverCardHandle,
  HoverCardTrigger,
} from "../../../modules/ui/renderer/public";

export interface TurnPreviewPayload {
  id: string;
  number: number;
  question: string;
  reply: string;
  preview: string;
}

interface ConversationTurnAnchorProps {
  turn: { id: string; preview: string; node: HTMLElement };
  number: number;
  active: boolean;
  tabIndex: number;
  markWidth: number;
  markOpacity: number;
  handle: HoverCardHandle<TurnPreviewPayload>;
  payload: TurnPreviewPayload;
  onNavigate: () => void;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  onPointerEnter?: () => void;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
}

export function extractAssistantReply(node: HTMLElement): string {
  let sibling = node.nextElementSibling;
  while (
    sibling instanceof HTMLElement &&
    !sibling.matches("[data-conversation-turn]")
  ) {
    if (sibling.getAttribute("data-message-role") === "assistant") {
      const readingBody = sibling.querySelector(
        "[data-reading-text], .reading-body",
      );
      const text = (
        readingBody?.textContent ??
        sibling.textContent ??
        ""
      ).trim();
      if (text) return text;
    }
    sibling = sibling.nextElementSibling;
  }
  return "";
}

export function ConversationTurnAnchor({
  turn,
  number,
  active,
  tabIndex,
  markWidth,
  markOpacity,
  handle,
  payload,
  onNavigate,
  onKeyDown,
  onPointerEnter,
  onFocus,
  onBlur,
}: ConversationTurnAnchorProps) {
  const { t } = useI18n();

  return (
    <HoverCardTrigger
      handle={handle}
      payload={payload}
      delay={50}
      closeDelay={120}
      render={
        <Button
          size="turn"
          variant="ghost"
          data-turn-target={turn.id}
          aria-label={t("ui.conversation.jumpToTurn", {
            number,
            preview: turn.preview,
          })}
          aria-current={active ? "step" : undefined}
          tabIndex={tabIndex}
          onClick={(event) => {
            onNavigate();
            event.currentTarget.blur();
          }}
          onKeyDown={onKeyDown}
          onPointerEnter={onPointerEnter}
          onFocus={onFocus}
          onBlur={onBlur}
          style={
            {
              "--turn-width": `${markWidth}px`,
              "--turn-opacity": markOpacity,
            } as CSSProperties
          }
        >
          <span className="turn-mark" aria-hidden="true" />
        </Button>
      }
    />
  );
}
