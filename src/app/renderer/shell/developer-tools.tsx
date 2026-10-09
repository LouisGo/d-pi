import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useStore } from "zustand";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { ToolsIcon } from "../components/icons/common";
import { HoverMenu } from "../components/ui/hover-menu";
import type { AppModel } from "../wiring/model";

function useDeveloperWorkspace() {
  return useRouterState({
    select: (state) =>
      state.matches.find((match) => match.staticData.workspace === "developer")
        ?.staticData,
  });
}

export function DeveloperTools() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const selected = useDeveloperWorkspace() !== undefined;
  return (
    <HoverMenu
      label={t("dev.entry")}
      icon={<ToolsIcon />}
      selected={selected}
      items={[
        {
          id: "components",

          label: t("dev.dashboard"),

          description: t("dev.dashboardDescription"),
          onSelect: () => {
            void navigate({ to: "/dev/components" });
          },
        },
      ]}
    />
  );
}

export function useConversationNavigation(model: AppModel) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const workspace = useDeveloperWorkspace();
  const developerActive = workspace !== undefined;
  const threadId = useStore(model.stateStore, (state) =>
    state.kind === "ready" && state.threadSelection.kind === "thread"
      ? state.threadSelection.thread.context.threadId
      : null,
  );
  return {
    developerActive,
    developerTitle: workspace?.titleMessage
      ? t(workspace.titleMessage)
      : undefined,
    onConversation: () => {
      if (!developerActive) return;
      if (threadId)
        void navigate({
          to: "/threads/$threadId",
          params: { threadId },
          search: { view: "conversation" },
        });
      else void navigate({ to: "/" });
    },
  };
}
