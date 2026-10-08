import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { Button } from "../../../../modules/ui/renderer/public";

export type HoverMenuItem = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  onSelect: () => void;
};

// d-pi owns the trigger, themed portal and action contract.
export function HoverMenu({
  label,
  icon,
  items,
  selected = false,
}: {
  label: string;
  icon: ReactNode;
  items: readonly HoverMenuItem[];
  selected?: boolean;
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        openOnHover
        delay={120}
        closeDelay={220}
        render={
          <Button
            size="icon"
            variant="navigation"
            aria-label={label}
            aria-pressed={selected}
          >
            <span className="ui-icon-button-content">{icon}</span>
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner
          className="ui-popup-positioner"
          side="top"
          align="end"
          sideOffset={8}
        >
          <Menu.Popup className="ui-hover-menu" aria-label={label}>
            {items.map((item) => (
              <Menu.Item
                key={item.id}
                disabled={item.disabled}
                label={item.label}
                className="ui-hover-menu-item"
                onClick={item.onSelect}
              >
                <span>{item.label}</span>
                {item.description && (
                  <span className="ui-hover-menu-description">
                    {item.description}
                  </span>
                )}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
