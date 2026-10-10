import { type ReactNode, useId } from "react";
import { match } from "ts-pattern";
import type {
  SidebarItem,
  SidebarPreferences,
} from "../../../modules/preferences/contracts/public";
import { sidebarItemKey } from "../../../modules/preferences/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import { SidebarChevronIcon } from "../components/icons/sidebar";
import type { AppModel } from "../wiring/model";
import { SidebarProjectGroup } from "./sidebar-project-group";
import type { SidebarEntry } from "./sidebar-projection";
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
}: {
  model: AppModel;
  section: "pins" | "projects";
  entries: SidebarEntry[];
  value: SidebarPreferences;
  disabled: boolean;
  navigationDisabled: boolean;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  const contentId = useId();
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
    <section className="sidebar-section" data-sidebar-section={section}>
      <div className="sidebar-section-heading">
        <Button
          variant="navigation"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          pending={disabled}
          onClick={() =>
            void model.commands.execute({
              kind: "sidebar",
              change: {
                kind: "collapse-section",
                section,
                value: !collapsed,
              },
            })
          }
        >
          {t(
            section === "pins" ? "app.sidebar.pinned" : "app.sidebar.projects",
          )}
          <span className="sidebar-section-chevron" data-collapsed={collapsed}>
            <SidebarChevronIcon />
          </span>
        </Button>
        {action}
      </div>
      <div id={contentId} hidden={collapsed}>
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
    </section>
  );
}
