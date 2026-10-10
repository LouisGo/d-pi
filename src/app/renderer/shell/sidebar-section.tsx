import { type ReactNode } from "react";
import { match } from "ts-pattern";
import type {
  SidebarItem,
  SidebarPreferences,
} from "../../../modules/preferences/contracts/public";
import { sidebarItemKey } from "../../../modules/preferences/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { NavigationSection } from "../../../modules/ui/renderer/public";
import type { AppModel } from "../wiring/model";
import { SidebarProjectGroup } from "./sidebar-project-group";
import type { SidebarEntry } from "./sidebar-projection";
import type { SidebarDiscoveryState } from "./sidebar-skeleton";
import { SidebarSortableList } from "./sidebar-sortable";
import { SidebarThreadRow } from "./sidebar-thread-row";
export function SidebarSection({
  model,
  section,
  entries,
  value,
  disabled,
  navigationDisabled,
  action,
  discovery = "settled",
}: {
  model: AppModel;
  section: "pins" | "projects";
  entries: SidebarEntry[];
  value: SidebarPreferences;
  disabled: boolean;
  navigationDisabled: boolean;
  action?: ReactNode;
  discovery?: SidebarDiscoveryState;
}) {
  const { t } = useI18n();
  const collapsed = value.collapsedSections.includes(section);
  const items = new Map(
    entries.map((entry) => [sidebarItemKey(entry.item), entry.item]),
  );
  const move = (item: SidebarItem, before: SidebarItem | null) =>
    void model.commands.execute({
      kind: "sidebar",
      change:
        section === "pins"
          ? { kind: "move-pin", item, before }
          : { kind: "move-project", id: item.id, before: before?.id ?? null },
    });
  return (
    <NavigationSection
      data-sidebar-section={section}
      label={t(
        section === "pins" ? "app.sidebar.pinned" : "app.sidebar.projects",
      )}
      expanded={!collapsed}
      pending={disabled}
      actions={action}
      onExpandedChange={(expanded) =>
        void model.commands.execute({
          kind: "sidebar",
          change: {
            kind: "collapse-section",
            section,
            value: !expanded,
          },
        })
      }
    >
      <div className="sidebar-section-items">
        <SidebarSortableList
          entries={entries}
          itemKey={(entry) => sidebarItemKey(entry.item)}
          label={(entry) => entry.label || t("app.sidebar.untitled")}
          disabled={disabled}
          onMove={(key, before) => {
            const item = items.get(key);
            if (item)
              move(item, before === null ? null : (items.get(before) ?? null));
          }}
          render={(entry, drag) => {
            return match(entry)
              .with({ kind: "project" }, ({ group }) => (
                <SidebarProjectGroup
                  model={model}
                  group={group}
                  value={value}
                  pinned={section === "pins"}
                  disabled={disabled}
                  navigationDisabled={navigationDisabled}
                  drag={drag}
                  discovery={discovery}
                />
              ))
              .with({ kind: "thread" }, ({ thread }) => (
                <SidebarThreadRow
                  model={model}
                  thread={thread}
                  pinned
                  disabled={disabled}
                  navigationDisabled={navigationDisabled}
                  drag={drag}
                />
              ))
              .exhaustive();
          }}
        />
      </div>
    </NavigationSection>
  );
}
