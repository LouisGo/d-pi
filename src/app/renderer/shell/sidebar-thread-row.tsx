import { useNavigate } from "@tanstack/react-router";
import { memo, useState } from "react";
import { useStore } from "zustand";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { ThreadContext } from "../../../modules/threads/contracts/public";
import {
  Button,
  HoverCardTrigger,
  NavigationRow,
  NavigationRowLabel,
} from "../../../modules/ui/renderer/public";
import { ChatIcon } from "../components/icons/common";
import {
  SidebarCompleteIcon,
  SidebarPinIcon,
} from "../components/icons/sidebar";
import { IconButton } from "../components/ui/icon-button";
import type { AppModel } from "../wiring/model";
import { SidebarItemMenu } from "./sidebar-item-menu";
import { useSidebarPreview } from "./sidebar-preview";
import type { SidebarDragBindings } from "./sidebar-sortable";
export const SidebarThreadRow = memo(function SidebarThreadRow({
  model,
  thread,
  pinned,
  disabled,
  navigationDisabled,
  drag,
}: {
  model: AppModel;
  thread: ThreadContext;
  pinned: boolean;
  disabled: boolean;
  navigationDisabled: boolean;
  drag?: SidebarDragBindings;
}) {
  const { t } = useI18n(),
    navigate = useNavigate(),
    preview = useSidebarPreview();
  const label = thread.title || t("app.sidebar.untitled");
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = useStore(
    model.stateStore,
    (state) =>
      state.kind === "ready" &&
      state.threadSelection.kind === "thread" &&
      state.threadSelection.thread.context.threadId === thread.threadId,
  );
  const trigger = (
    <Button
      variant="navigation"
      size="sidebar"
      ref={drag?.setActivatorNodeRef}
      {...drag?.attributes}
      {...drag?.listeners}
      data-thread-navigation
      data-thread-id={thread.threadId}
      data-drag-activator
      aria-current={selected ? "page" : undefined}
      aria-label={label}
      pending={navigationDisabled}
      onClick={() => {
        if (!navigationDisabled && !drag?.dragging)
          void navigate({
            to: "/threads/$threadId",
            params: { threadId: thread.threadId },
            search: { view: "conversation" },
          });
      }}
    >
      {pinned && <ChatIcon size={14} />}
      <NavigationRowLabel>{label}</NavigationRowLabel>
    </Button>
  );
  return (
    <SidebarItemMenu
      model={model}
      item={{ kind: "thread", id: thread.threadId }}
      label={label}
      pinned={pinned}
      disabled={disabled || navigationDisabled}
      thread={thread}
      onOpenChange={(open) => {
        setMenuOpen(open);
        preview?.block(open);
      }}
      trigger={
        <NavigationRow
          current={selected}
          active={menuOpen}
          data-pinned-thread={pinned || undefined}
          actions={
            <>
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
                      item: { kind: "thread", id: thread.threadId },
                      value: !pinned,
                    },
                  })
                }
              >
                <SidebarPinIcon />
              </IconButton>
              <IconButton
                variant="success"
                appearance="plain"
                label={t(
                  thread.completed
                    ? "app.sidebar.reopen"
                    : "app.sidebar.complete",
                )}
                pending={disabled || navigationDisabled}
                onClick={() =>
                  void model.commands.execute({
                    kind: "mutate",
                    threadId: thread.threadId,
                    mutation: { kind: "complete", value: !thread.completed },
                  })
                }
              >
                <SidebarCompleteIcon />
              </IconButton>
            </>
          }
        >
          {preview ? (
            <HoverCardTrigger
              handle={preview.handle}
              payload={{ label, directory: thread.directory, thread }}
              render={trigger}
            />
          ) : (
            trigger
          )}
        </NavigationRow>
      }
    />
  );
});
