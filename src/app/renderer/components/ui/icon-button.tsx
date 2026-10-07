import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";
import {
  Button,
  type ButtonProps,
} from "../../../../modules/ui/renderer/public";
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
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <Button {...props} size="icon" aria-label={label}>
              <span className="ui-icon-button-content">{children}</span>
              {indicator !== undefined && indicator !== null && (
                <span className="ui-icon-button-indicator">{indicator}</span>
              )}
            </Button>
          }
        />
        <Tooltip.Portal>
          <Tooltip.Positioner side="right" sideOffset={8}>
            <Tooltip.Popup className="ui-tooltip">{label}</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
