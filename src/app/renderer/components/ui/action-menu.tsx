import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { match } from "ts-pattern";
import { Button } from "../../../../modules/ui/renderer/public";
import { MenuCheckIcon } from "../icons/composer";
import { Tooltip } from "./tooltip";

type Action = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  onSelect: () => void;
};
export type ActionMenuEntry =
  | (Action & { kind: "action" })
  | (Action & { kind: "checkbox"; checked: boolean })
  | { kind: "separator"; id: string };

// The app owns this action contract; Base UI owns menu navigation and focus.
export function ActionMenu({
  label,
  icon,
  items,
}: {
  label: string;
  icon: ReactNode;
  items: readonly ActionMenuEntry[];
}) {
  return (
    <Menu.Root modal={false}>
      <Tooltip content={label} side="top">
        <Menu.Trigger
          render={
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={label}
            >
              <span className="ui-icon-button-content">{icon}</span>
            </Button>
          }
        />
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner
          className="ui-popup-positioner"
          side="top"
          align="end"
          sideOffset={8}
        >
          <Menu.Popup
            data-slot="action-menu"
            className="ui-action-menu"
            aria-label={label}
          >
            {items.map((item) =>
              match(item)
                .with({ kind: "separator" }, (entry) => (
                  <Menu.Separator
                    key={entry.id}
                    className="ui-action-menu-separator"
                  />
                ))
                .with({ kind: "action" }, (entry) => (
                  <Menu.Item
                    key={entry.id}
                    label={entry.label}
                    aria-label={entry.label}
                    aria-description={entry.description}
                    disabled={entry.disabled}
                    className="ui-action-menu-item"
                    onClick={() => entry.onSelect()}
                  >
                    <span
                      className="ui-action-menu-indicator"
                      aria-hidden="true"
                    />
                    <ActionText item={entry} />
                  </Menu.Item>
                ))
                .with({ kind: "checkbox" }, (entry) => (
                  <Menu.CheckboxItem
                    key={entry.id}
                    label={entry.label}
                    aria-label={entry.label}
                    aria-description={entry.description}
                    disabled={entry.disabled}
                    checked={entry.checked}
                    closeOnClick
                    className="ui-action-menu-item"
                    onCheckedChange={() => entry.onSelect()}
                  >
                    <span
                      className="ui-action-menu-indicator"
                      aria-hidden="true"
                    >
                      <Menu.CheckboxItemIndicator>
                        <MenuCheckIcon />
                      </Menu.CheckboxItemIndicator>
                    </span>
                    <ActionText item={entry} />
                  </Menu.CheckboxItem>
                ))
                .exhaustive(),
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ActionText({ item }: { item: Action }) {
  return (
    <span className="ui-action-menu-content">
      <span>{item.label}</span>
      {item.description && (
        <span className="ui-action-menu-description">{item.description}</span>
      )}
    </span>
  );
}
