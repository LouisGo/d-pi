import { useId, useState } from "react";
import { useStore } from "zustand";
import type { SidebarPreferences } from "../../../modules/preferences/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, HoverCardTrigger } from "../../../modules/ui/renderer/public";
import { FolderIcon } from "../components/icons/common";
import {
  NewChatIcon,
  SidebarChevronIcon,
  SidebarPinIcon,
} from "../components/icons/sidebar";
import { IconButton } from "../components/ui/icon-button";
import type { AppModel } from "../wiring/model";
import { SidebarItemMenu } from "./sidebar-item-menu";
import { useSidebarPreview } from "./sidebar-preview";
import { projectName, type SidebarProject } from "./sidebar-projection";
import {
  type SidebarDragBindings,
  SidebarSortableList,
} from "./sidebar-sortable";
import { SidebarThreadRow } from "./sidebar-thread-row";
export function SidebarProjectGroup({
  model,
  group,
  value,
  pinned,
  disabled,
  navigationDisabled,
  drag,
}: {
  model: AppModel;
  group: SidebarProject;
  value: SidebarPreferences;
  pinned: boolean;
  disabled: boolean;
  navigationDisabled: boolean;
  drag: SidebarDragBindings;
}) {
  const { t } = useI18n(),
    contentId = useId(),
    preview = useSidebarPreview();
  const [menuOpen, setMenuOpen] = useState(false);
  const id = group.project.workingDirectoryId,
    label = projectName(group.project.directory);
  const collapsed = value.collapsedProjects.includes(id),
    expanded = value.expandedProjects.includes(id),
    visible = expanded ? group.threads : group.threads.slice(0, 5);
  const selected = useStore(
    model.stateStore,
    (state) =>
      state.kind === "ready" &&
      state.threadSelection.kind === "thread" &&
      state.threadSelection.thread.context.workingDirectoryId === id,
  );
  const trigger = (
    <Button
      variant="navigation"
      size="sidebar"
      ref={drag.setActivatorNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      data-drag-activator
      data-project-toggle
      aria-expanded={!collapsed}
      aria-controls={contentId}
      data-current={collapsed && selected}
      pending={disabled}
      onClick={() => {
        if (!drag.dragging)
          void model.commands.execute({
            kind: "sidebar",
            change: { kind: "collapse-project", id, value: !collapsed },
          });
      }}
    >
      <span className="sidebar-project-symbol">
        <FolderIcon size={14} />
        <span className="sidebar-project-chevron" data-collapsed={collapsed}>
          <SidebarChevronIcon />
        </span>
      </span>
      <span className="sidebar-title">{label}</span>
    </Button>
  );
  return (
    <section
      className="sidebar-project-group"
      data-project-group={group.project.directory}
      data-project-id={id}
    >
      <SidebarItemMenu
        model={model}
        item={{ kind: "project", id }}
        label={label}
        pinned={pinned}
        disabled={disabled}
        onOpenChange={(open) => {
          setMenuOpen(open);
          preview?.block(open);
        }}
        trigger={
          <div
            className="sidebar-row"
            data-selected={(collapsed && selected) || undefined}
            data-menu-open={menuOpen || undefined}
          >
            {preview ? (
              <HoverCardTrigger
                handle={preview.handle}
                payload={{
                  label,
                  directory: group.project.directory,
                  count: group.threads.length,
                }}
                render={trigger}
              />
            ) : (
              trigger
            )}
            <div className="sidebar-row-actions">
              <IconButton
                variant="ghost"
                appearance="plain"
                label={t(pinned ? "app.sidebar.unpin" : "app.sidebar.pin")}
                pending={disabled}
                onClick={() =>
                  void model.commands.execute({
                    kind: "sidebar",
                    change: {
                      kind: "pin",
                      item: { kind: "project", id },
                      value: !pinned,
                    },
                  })
                }
              >
                <SidebarPinIcon />
              </IconButton>
              <IconButton
                variant="ghost"
                appearance="plain"
                label={t("app.sidebar.newInProject", { name: label })}
                disabled={!group.sourceThreadId}
                pending={navigationDisabled}
                onClick={() =>
                  void model.commands.execute({
                    kind: "new",
                    ...(group.sourceThreadId
                      ? { threadId: group.sourceThreadId }
                      : {}),
                  })
                }
              >
                <NewChatIcon />
              </IconButton>
            </div>
          </div>
        }
      />
      <div
        id={contentId}
        className="sidebar-project-children"
        hidden={collapsed}
      >
        <>
          <SidebarSortableList
            entries={visible}
            itemKey={(thread) => thread.threadId}
            label={(thread) => thread.title || t("app.sidebar.untitled")}
            disabled={disabled}
            afterLast={expanded ? null : (group.threads[5]?.threadId ?? null)}
            onMove={(threadId, before) =>
              void model.commands.execute({
                kind: "sidebar",
                change: {
                  kind: "move-thread",
                  projectId: id,
                  id: threadId,
                  before,
                },
              })
            }
            render={(thread, drag) => (
              <SidebarThreadRow
                model={model}
                thread={thread}
                pinned={false}
                disabled={disabled}
                navigationDisabled={navigationDisabled}
                drag={drag}
              />
            )}
          />
          {!group.threads.length && (
            <p className="sidebar-empty-project">
              {t(
                group.sourceThreadId
                  ? "app.sidebar.allPinned"
                  : "app.sidebar.noThreads",
              )}
            </p>
          )}
          {group.threads.length > 5 && (
            <Button
              variant="navigation"
              size="sidebar"
              data-expand-project
              aria-expanded={expanded}
              pending={disabled}
              onClick={() =>
                void model.commands.execute({
                  kind: "sidebar",
                  change: { kind: "expand-project", id, value: !expanded },
                })
              }
            >
              {t(expanded ? "app.sidebar.showLess" : "app.sidebar.showMore")}
            </Button>
          )}
        </>
      </div>
    </section>
  );
}
