// Project-owned composition of Base UI 1.8.0 public popover primitives.
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { clsx } from "clsx";
import type { ReactElement, ReactNode, RefObject } from "react";

export type PopoverProps = {
  trigger: ReactElement;
  children: ReactNode;
  label: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialFocus?: RefObject<HTMLElement | null>;
  /** Outer popup layout only; surface and interaction styles are owned here. */
  className?: string;
  variant?: "default" | "flush";
};

export function Popover({
  trigger,
  children,
  label,
  open,
  onOpenChange,
  initialFocus,
  className,
  variant = "default",
}: PopoverProps) {
  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => onOpenChange?.(next)}
    >
      <PopoverPrimitive.Trigger render={trigger} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          // A portaled popup must not enlarge the document's scrollable area.
          // Otherwise focus scrolling and collision sizing can feed each other.
          positionMethod="fixed"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionAvoidance={{
            side: "flip",
            align: "shift",
            fallbackAxisSide: "none",
          }}
          className="ui-popover-positioner"
        >
          <PopoverPrimitive.Popup
            aria-label={label}
            initialFocus={initialFocus}
            className={clsx("ui-popover-popup", className)}
            data-slot="popover"
            data-variant={variant}
          >
            {children}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
