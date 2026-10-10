import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useId,
} from "react";

const TooltipProviderContext = createContext(false);
/** Shared timing and immediate handoff between adjacent hints. Standalone controls use the same fallback. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  const provided = useContext(TooltipProviderContext);
  if (provided) return children;
  return (
    <TooltipProviderContext value>
      <TooltipPrimitive.Provider delay={120} closeDelay={0}>
        {children}
      </TooltipPrimitive.Provider>
    </TooltipProviderContext>
  );
}

export function Tooltip({
  children,
  content,
  side = "bottom",
  sideOffset = 4,
}: {
  children: ReactElement;
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
}) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root disableHoverablePopup>
        <TooltipPrimitive.Trigger render={children} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner
            className="ui-popup-positioner"
            data-slot="tooltip-positioner"
            side={side}
            sideOffset={sideOffset}
          >
            <TooltipPrimitive.Popup className="ui-tooltip" role="tooltip">
              {content}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipProvider>
  );
}

/** An existing atomic editor DOM node can anchor the same project Tooltip popup. */
export function AnchoredTooltip({
  anchor,
  content,
}: {
  anchor: HTMLElement | null;
  content: ReactNode;
}) {
  const id = useId();
  useEffect(() => {
    if (!anchor) return;
    const descriptions = (anchor.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean);
    anchor.setAttribute("aria-describedby", [...descriptions, id].join(" "));
    return () => {
      const remaining = (anchor.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter((value) => value && value !== id);
      if (remaining.length)
        anchor.setAttribute("aria-describedby", remaining.join(" "));
      else anchor.removeAttribute("aria-describedby");
    };
  }, [anchor, id]);
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root open={!!anchor} disableHoverablePopup>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner
            anchor={anchor}
            className="ui-popup-positioner"
            data-slot="tooltip-positioner"
            side="top"
            sideOffset={4}
          >
            <TooltipPrimitive.Popup
              id={id}
              className="ui-tooltip"
              role="tooltip"
            >
              {content}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipProvider>
  );
}
