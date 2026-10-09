import {
  type CSSProperties,
  type FocusEventHandler,
  type KeyboardEventHandler,
  useState,
} from "react";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, HoverCard } from "../../../modules/ui/renderer/public";
import { TurnPreviewCard } from "./turn-preview-card";

interface ConversationTurnAnchorProps {
  turn: { id: string; preview: string; node: HTMLElement };
  number: number;
  active: boolean;
  tabIndex: number;
  markWidth: number;
  markOpacity: number;
  onNavigate: () => void;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  onPointerEnter?: () => void;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
}

function extractAssistantReply(node: HTMLElement): string {
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
  onNavigate,
  onKeyDown,
  onPointerEnter,
  onFocus,
  onBlur,
}: ConversationTurnAnchorProps) {
  const { t } = useI18n();
  const [question, setQuestion] = useState(turn.preview);
  const [reply, setReply] = useState("");

  return (
    <HoverCard
      label={t("ui.conversation.turnNumber", { number })}
      sideOffset={8}
      onOpenChange={(open) => {
        // Sample only the opened question and assistant reply; never rescan on streamed tokens.
        if (open) {
          const userBubble =
            turn.node.querySelector(":scope > .user-message-bubble") ??
            turn.node.querySelector("[data-reading-text]");
          const userText = (userBubble?.textContent ?? turn.preview).trim();
          setQuestion(userText || turn.preview);
          setReply(extractAssistantReply(turn.node));
        }
      }}
      trigger={
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
    >
      <TurnPreviewCard number={number} question={question} reply={reply} />
    </HoverCard>
  );
}
