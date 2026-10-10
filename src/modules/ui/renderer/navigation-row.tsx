import { clsx } from "clsx";
import type { ComponentPropsWithRef, ReactNode } from "react";

export type NavigationRowProps = ComponentPropsWithRef<"div"> & {
  actions: ReactNode;
  /** Use the action footprint to fade overlapping text without reflow. */
  actionSlots?: 1 | 2;
  current?: boolean;
  active?: boolean;
};

/** A navigation button and its trailing actions share one stable visual row. */
export function NavigationRow({
  children,
  actions,
  actionSlots = 2,
  current = false,
  active = false,
  className,
  ...props
}: NavigationRowProps) {
  return (
    <div
      {...props}
      className={clsx("ui-navigation-row", className)}
      data-action-slots={actionSlots}
      data-current={current || undefined}
      data-active={active || undefined}
    >
      {children}
      <div className="ui-navigation-row-actions">{actions}</div>
    </div>
  );
}

export function NavigationRowLabel({
  className,
  ...props
}: ComponentPropsWithRef<"span">) {
  return (
    <span {...props} className={clsx("ui-navigation-row-label", className)} />
  );
}
