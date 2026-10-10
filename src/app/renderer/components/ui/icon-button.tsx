import type { ReactNode } from "react";
import {
  Button,
  type ButtonProps,
} from "../../../../modules/ui/renderer/public";
import { Tooltip } from "./tooltip";
// Project API: one native button, named action, root-themed portaled hint.
export function IconButton({
  label,
  children,
  indicator,
  tooltipSide = "top",
  ...props
}: Omit<ButtonProps, "size" | "aria-label" | "title"> & {
  label: string;
  indicator?: ReactNode;
  tooltipSide?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip content={label} side={tooltipSide} sideOffset={2}>
      <Button {...props} size="icon" aria-label={label}>
        <span className="ui-icon-button-content">{children}</span>
        {indicator !== undefined && indicator !== null && (
          <span className="ui-icon-button-indicator">{indicator}</span>
        )}
      </Button>
    </Tooltip>
  );
}
