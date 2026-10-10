import { clsx } from "clsx";
import type { ComponentPropsWithRef } from "react";

export type SkeletonProps = ComponentPropsWithRef<"div"> & {
  shape?: "line" | "icon";
};

/** Decorative placeholder; the consumer owns the loading announcement and layout. */
export function Skeleton({
  shape = "line",
  className,
  ...props
}: SkeletonProps) {
  return (
    <div
      {...props}
      className={clsx("ui-skeleton", className)}
      data-slot="skeleton"
      data-shape={shape}
      aria-hidden="true"
    />
  );
}
