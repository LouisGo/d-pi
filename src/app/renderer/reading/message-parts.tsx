import { type ReactNode, useState } from "react";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Badge,
  type BadgeProps,
  Disclosure,
  DisclosureTrigger,
} from "../../../modules/ui/renderer/public";
import { ToolsIcon } from "../components/icons/common";
import { ThinkingIcon } from "../components/icons/reading";
import { CopyButton } from "../components/ui/copy-button";
import { ReadingBody } from "./reading-body";

export function MessageHeader({
  title,
  status,
  actions,
}: {
  title: ReactNode;
  status?: { label: string; tone?: BadgeProps["tone"] };
  actions?: ReactNode;
}) {
  return (
    <div className="message-heading">
      <strong>{title}</strong>
      {status?.label && (
        <Badge tone={status.tone ?? "neutral"}>{status.label}</Badge>
      )}
      {actions && <div className="message-actions">{actions}</div>}
    </div>
  );
}

// Output visibility is presentation state, independent of tool execution.
export function ToolResultFrame({
  label,
  children,
  open,
  status,
  evidence,
}: {
  label: string;
  children: ReactNode;
  open?: boolean;
  status?: { label: string; tone?: BadgeProps["tone"] };
  evidence?: ReactNode;
}) {
  const [readerToggled, setReaderToggled] = useState(false);
  return (
    <Disclosure
      variant="framed"
      open={open}
      data-reading-default-open={open && !readerToggled ? "" : undefined}
    >
      <DisclosureTrigger onClick={() => setReaderToggled(true)}>
        <ToolsIcon size={16} className="tool-result-icon" />
        <span className="tool-result-label">{label}</span>
        {status?.label && (
          <Badge tone={status.tone ?? "neutral"}>{status.label}</Badge>
        )}
      </DisclosureTrigger>
      <div className="tool-result-content">
        {children}
        {evidence}
      </div>
    </Disclosure>
  );
}

export function MessageActions({
  text,
  label,
  timestamp,
}: {
  text: string;
  label: string;
  timestamp?: number | undefined;
}) {
  const { locale } = useI18n();
  if (!text && timestamp === undefined) return null;
  return (
    <div className="message-action-bar">
      {text && <CopyButton label={label} text={text} iconOnly />}
      {timestamp !== undefined && (
        <time
          dateTime={new Date(timestamp).toISOString()}
          title={new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "medium",
          }).format(timestamp)}
        >
          {new Intl.DateTimeFormat(locale, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(timestamp)}
        </time>
      )}
    </div>
  );
}

export function UserMessageBubble({
  text,
  children,
}: {
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="reading-body user-message-bubble" data-reading-text>
      {children ?? text}
    </div>
  );
}

export function MessageStatus({
  state,
  label,
}: {
  state: string;
  label: string;
}) {
  if (!label) return null;
  return (
    <div className="message-status" data-state={state} role="status">
      {state === "streaming" && (
        <span className="message-working-dot" aria-hidden="true" />
      )}
      <span>{label}</span>
    </div>
  );
}

export function ThinkingDisclosure({
  text,
  label,
  streaming = false,
}: {
  text: string;
  label: string;
  streaming?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="message-thinking">
      <Disclosure
        variant="inline"
        onToggle={(event) => {
          if (event.currentTarget.open) setRevealed(true);
        }}
      >
        <DisclosureTrigger>
          <ThinkingIcon />
          <span>{label}</span>
        </DisclosureTrigger>
        {revealed && (
          <div className="thinking-content">
            <ReadingBody text={text} streaming={streaming} />
          </div>
        )}
      </Disclosure>
    </div>
  );
}
