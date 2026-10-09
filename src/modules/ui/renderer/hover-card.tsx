// Project-owned composition of Base UI 1.8.0 preview-card primitives.
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import type { ReactElement, ReactNode } from "react";

export const createHoverCardHandle = PreviewCardPrimitive.createHandle;
export type HoverCardHandle<Payload = unknown> =
  PreviewCardPrimitive.Handle<Payload>;

export interface HoverCardTriggerProps<Payload = unknown> {
  handle?: HoverCardHandle<Payload>;
  payload?: Payload;
  delay?: number;
  closeDelay?: number;
  render: ReactElement;
}

/** Trigger associated with a single shared hover card popup via handle. */
export function HoverCardTrigger<Payload = unknown>({
  handle,
  payload,
  delay = 80,
  closeDelay = 120,
  render,
}: HoverCardTriggerProps<Payload>) {
  return (
    <PreviewCardPrimitive.Trigger
      handle={handle}
      payload={payload}
      delay={delay}
      closeDelay={closeDelay}
      render={render}
    />
  );
}

export interface HoverCardPopupProps<Payload = unknown> {
  handle: HoverCardHandle<Payload>;
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  children: ReactNode | ((payload: Payload | undefined) => ReactNode);
}

/** Single shared popup that glides smoothly between triggers sharing the same handle. */
export function HoverCardPopup<Payload = unknown>({
  handle,
  label,
  side = "right",
  sideOffset = 8,
  children,
}: HoverCardPopupProps<Payload>) {
  return (
    <PreviewCardPrimitive.Root handle={handle}>
      {({ payload }) => (
        <PreviewCardPrimitive.Portal>
          <PreviewCardPrimitive.Positioner
            side={side}
            align="center"
            sideOffset={sideOffset}
            collisionPadding={12}
            collisionAvoidance={{
              side: "flip",
              align: "shift",
              fallbackAxisSide: "none",
            }}
            className="ui-hover-card-positioner"
          >
            <PreviewCardPrimitive.Popup
              role="region"
              aria-label={label}
              className="ui-hover-card-popup"
              data-slot="hover-card"
            >
              {typeof children === "function" ? children(payload) : children}
            </PreviewCardPrimitive.Popup>
          </PreviewCardPrimitive.Positioner>
        </PreviewCardPrimitive.Portal>
      )}
    </PreviewCardPrimitive.Root>
  );
}

export interface HoverCardProps {
  trigger: ReactElement;
  children: ReactNode;
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  onOpenChange?: (open: boolean) => void;
}

/** Read-only details, with a pointer bridge from the trigger into the card. */
export function HoverCard({
  trigger,
  children,
  label,
  side = "right",
  sideOffset = 12,
  onOpenChange,
}: HoverCardProps) {
  return (
    <PreviewCardPrimitive.Root onOpenChange={(next) => onOpenChange?.(next)}>
      <PreviewCardPrimitive.Trigger
        render={trigger}
        delay={120}
        closeDelay={220}
      />
      <PreviewCardPrimitive.Portal>
        <PreviewCardPrimitive.Positioner
          side={side}
          align="center"
          sideOffset={sideOffset}
          collisionPadding={12}
          collisionAvoidance={{
            side: "flip",
            align: "shift",
            fallbackAxisSide: "none",
          }}
          className="ui-hover-card-positioner"
        >
          <PreviewCardPrimitive.Popup
            role="region"
            aria-label={label}
            className="ui-hover-card-popup"
            data-slot="hover-card"
          >
            {children}
          </PreviewCardPrimitive.Popup>
        </PreviewCardPrimitive.Positioner>
      </PreviewCardPrimitive.Portal>
    </PreviewCardPrimitive.Root>
  );
}
