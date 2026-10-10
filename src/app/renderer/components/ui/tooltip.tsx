import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
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
