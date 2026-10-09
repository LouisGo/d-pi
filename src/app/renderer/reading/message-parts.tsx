import type { ReactNode } from "react";
import {
  Badge,
  type BadgeProps,
  Disclosure,
  DisclosureTrigger,
} from "../../../modules/ui/renderer/public";
import { ToolsIcon } from "../components/icons/common";

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
}: {
  label: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <Disclosure variant="framed" open={open}>
      <DisclosureTrigger>
        <ToolsIcon size={16} className="tool-result-icon" />
        <span className="tool-result-label">{label}</span>
      </DisclosureTrigger>
      <div className="tool-result-content">{children}</div>
    </Disclosure>
  );
}
