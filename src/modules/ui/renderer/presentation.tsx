import { clsx } from "clsx";
import { type ComponentPropsWithRef, type ReactNode, useId } from "react";

export type BadgeProps = ComponentPropsWithRef<"span"> & {
  tone?: "neutral" | "emphasis" | "danger";
};
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={clsx("ui-badge", className)}
      data-tone={tone}
      data-slot="badge"
    />
  );
}

export type ActionGroupProps = ComponentPropsWithRef<"div"> & {
  align?: "start" | "end";
};
export function ActionGroup({
  align = "start",
  className,
  ...props
}: ActionGroupProps) {
  return (
    <div
      {...props}
      className={clsx("ui-action-group", className)}
      data-align={align}
      data-slot="action-group"
    />
  );
}

export type InlineNoticeProps = {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  tone?: "neutral" | "danger";
  role?: "status" | "alert";
};
export function InlineNotice({
  title,
  children,
  actions,
  tone = "neutral",
  role,
}: InlineNoticeProps) {
  const id = useId();
  return (
    <div
      className="ui-inline-notice"
      data-slot="inline-notice"
      data-tone={tone}
      role={role}
      aria-labelledby={title ? id : undefined}
    >
      <div className="ui-inline-notice-content" data-selectable>
        {title && <strong id={id}>{title}</strong>}
        <div>{children}</div>
      </div>
      {actions && <ActionGroup>{actions}</ActionGroup>}
    </div>
  );
}

export type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  note?: string;
  size?: "page" | "compact";
};
export function EmptyState({
  title,
  description,
  action,
  note,
  size = "compact",
}: EmptyStateProps) {
  const Heading = size === "page" ? "h1" : "h2";
  return (
    <div className="ui-empty-state" data-slot="empty-state" data-size={size}>
      <Heading>{title}</Heading>
      {description && <p>{description}</p>}
      {action && <ActionGroup>{action}</ActionGroup>}
      {note && <p className="ui-empty-state-note">{note}</p>}
    </div>
  );
}

export function Kbd({ className, ...props }: ComponentPropsWithRef<"kbd">) {
  return (
    <kbd {...props} className={clsx("ui-kbd", className)} data-slot="kbd" />
  );
}
