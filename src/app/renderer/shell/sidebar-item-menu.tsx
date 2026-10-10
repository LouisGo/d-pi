import type { ReactElement } from "react";
import type { SidebarItem } from "../../../modules/preferences/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { ThreadContext } from "../../../modules/threads/contracts/public";
import {
  SidebarCompleteIcon,
  SidebarDeleteIcon,
  SidebarForkIcon,
  SidebarPinIcon,
  SidebarRenameIcon,
} from "../components/icons/sidebar";
import {
  ContextMenu,
  type ContextMenuEntry,
} from "../components/ui/context-menu";
import type { AppModel } from "../wiring/model";
export function SidebarItemMenu({
  model,
  item,
  label,
  pinned,
  disabled,
  thread,
  trigger,
  onOpenChange,
}: {
  model: AppModel;
  item: SidebarItem;
  label: string;
  pinned: boolean;
  disabled: boolean;
  thread?: ThreadContext;
  trigger: ReactElement;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const pin = () =>
    void model.commands.execute({
      kind: "sidebar",
      change: { kind: "pin", item, value: !pinned },
    });
  const items: ContextMenuEntry[] = [
    {
      id: "pin",
      label: t(pinned ? "app.sidebar.unpin" : "app.sidebar.pin"),
      icon: <SidebarPinIcon />,
      disabled,
      onSelect: pin,
    },
  ];
  if (thread) {
    items.unshift({
      id: "rename",
      label: t("app.sidebar.rename"),
      icon: <SidebarRenameIcon />,
      disabled,
      onSelect: () =>
        void model.commands.execute({ kind: "request-rename", thread }),
    });
    items.push({
      id: "fork",
      label: t("app.sidebar.fork"),
      icon: <SidebarForkIcon />,
      disabled,
      onSelect: () =>
        void model.commands.execute({
          kind: "mutate",
          threadId: thread.threadId,
          mutation: { kind: "fork" },
        }),
    });
    items.push({
      id: "complete",
      tone: "success",
      label: t(
        thread.completed ? "app.sidebar.reopen" : "app.sidebar.complete",
      ),
      icon: <SidebarCompleteIcon />,
      disabled,
      separatorBefore: true,
      onSelect: () =>
        void model.commands.execute({
          kind: "mutate",
          threadId: thread.threadId,
          mutation: { kind: "complete", value: !thread.completed },
        }),
    });
    items.push({
      id: "delete",
      label: t("app.sidebar.delete"),
      icon: <SidebarDeleteIcon />,
      disabled,
      destructive: true,
      onSelect: () =>
        void model.commands.execute({ kind: "request-delete", thread }),
    });
  }
  return (
    <ContextMenu
      label={t("app.sidebar.actions", { name: label })}
      trigger={trigger}
      items={items}
      onOpenChange={onOpenChange}
    />
  );
}
