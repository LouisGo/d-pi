import type { ComponentProps, ReactNode } from "react";
import {
  Tooltip as SharedTooltip,
  TooltipProvider as SharedTooltipProvider,
} from "../../../../modules/ui/renderer/public";

/** App compatibility surface; popup behavior and timing are owned by shared UI. */
export function Tooltip(props: ComponentProps<typeof SharedTooltip>) {
  return <SharedTooltip {...props} />;
}
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <SharedTooltipProvider>{children}</SharedTooltipProvider>;
}
