import { ContextMenu as Primitive } from "@base-ui/react/context-menu";
import type { ReactElement, ReactNode } from "react";
export interface ContextMenuEntry {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  tone?: "success";
  separatorBefore?: boolean;
  onSelect: () => void;
}
/** Base UI owns pointer anchoring, keyboard navigation, dismissal and focus return. */
export function ContextMenu({
  label,
  trigger,
  items,
  onOpenChange,
}: {
  label: string;
  trigger: ReactElement;
  items: readonly ContextMenuEntry[];
  onOpenChange?: ((open: boolean) => void) | undefined;
}) {
  return (
    <Primitive.Root onOpenChange={onOpenChange}>
      <Primitive.Trigger render={trigger} />
      <Primitive.Portal>
        <Primitive.Positioner className="ui-popup-positioner" sideOffset={4}>
          <Primitive.Popup
            className="ui-action-menu"
            aria-label={label}
            data-slot="context-menu"
          >
            {items.map((item) => (
              <div key={item.id}>
                {item.separatorBefore && (
                  <Primitive.Separator className="ui-action-menu-separator" />
                )}
                <Primitive.Item
                  className="ui-action-menu-item"
                  data-destructive={item.destructive || undefined}
                  data-tone={item.tone}
                  label={item.label}
                  disabled={item.disabled}
                  onClick={item.onSelect}
                >
                  <span className="ui-action-menu-indicator" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="ui-action-menu-content">{item.label}</span>
                </Primitive.Item>
              </div>
            ))}
          </Primitive.Popup>
        </Primitive.Positioner>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
