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
  ...props
}: Omit<ButtonProps, "size" | "aria-label" | "title"> & {
  label: string;
  indicator?: ReactNode;
}) {
  return (
    <Tooltip content={label} side="right">
      <Button {...props} size="icon" aria-label={label}>
        <span className="ui-icon-button-content">{children}</span>
        {indicator !== undefined && indicator !== null && (
          <span className="ui-icon-button-indicator">{indicator}</span>
        )}
      </Button>
    </Tooltip>
  );
}
