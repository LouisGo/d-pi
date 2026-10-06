import { Tooltip } from "@base-ui/react/tooltip";
import { Button, type ButtonProps } from "./button";
// Project API: one native button, named action, root-themed portaled hint.
export function IconButton({
  label,
  ...props
}: Omit<ButtonProps, "size" | "aria-label" | "title"> & { label: string }) {
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={<Button {...props} size="icon" aria-label={label} />}
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
