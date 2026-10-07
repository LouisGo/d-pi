import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useStore } from "zustand";
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
  const navigate = useNavigate();
  const selected = useDeveloperWorkspace() !== undefined;
  return (
    <HoverMenu
      // i18n-ignore: developer tools use fixed Chinese by user request
      label="开发者工具"
      icon={<ToolsIcon />}
      selected={selected}
      items={[
        {
          id: "components",
          // i18n-ignore: developer tools use fixed Chinese by user request
          label: "组件看板",
          // i18n-ignore: developer tools use fixed Chinese by user request
          description: "浏览形态、状态与交互",
          onSelect: () => {
            void navigate({ to: "/dev/components" });
          },
        },
      ]}
    />
  );
}

export function useConversationNavigation(model: AppModel) {
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
    developerTitle: workspace?.title,
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
