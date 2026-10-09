import { clsx } from "clsx";
import { useEffect, useState } from "react";

export interface LoadingIndicatorProps {
  pending: boolean;
  label: string;
  identity?: string;
  className?: string;
  placement?: "inline" | "center";
}

/** A new read gets its own delay; fast reads never paint a spinner. */
export function LoadingIndicator({
  pending,
  label,
  identity = "",
  className,
  placement = "inline",
}: LoadingIndicatorProps) {
  const [visible, setVisible] = useState<string | null>(null);
  useEffect(() => {
    setVisible(null);
    if (!pending) return;
    const timer = setTimeout(() => setVisible(identity), 200);
    return () => clearTimeout(timer);
  }, [pending, identity]);
  if (!pending || visible !== identity) return null;
  return (
    <span
      data-slot="loading-indicator"
      data-placement={placement}
      className={clsx("loading-indicator", className)}
      role="status"
      aria-label={label}
    >
      <span aria-hidden="true" />
    </span>
  );
}
