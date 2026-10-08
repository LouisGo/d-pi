import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { Button } from "../../../../modules/ui/renderer/public";

// A compact status action with a themed, keyboard accessible detail surface.
export function StatusPreview({
  label,
  summary,
  children,
}: {
  label: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button size="status" variant="ghost" aria-label={label}>
            {summary}
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popup-positioner"
          side="top"
          align="start"
          sideOffset={8}
        >
          <Popover.Popup className="ui-status-preview" aria-label={label}>
            <Popover.Title>{label}</Popover.Title>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
