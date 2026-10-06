import { useNavigate } from "@tanstack/react-router";
import { memo, type ReactNode } from "react";
import { useStore } from "zustand";
import { FolderIcon } from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { AppModel } from "../wiring/model";
import { ThreadAttention } from "./attention";
import { ChooseProjectButton } from "./choose-project-button";

export function ProjectThreads({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const threads = useStore(model.threadListStore, (state) => state.threads);
  const failed = useStore(model.threadListStore, (state) => state.failed);
  return (
    <nav aria-label={t("app.sidebar.projects")} className="thread-navigation">
      <ChooseProjectButton model={model} />
      <div className="sidebar-label">{t("app.sidebar.projects")}</div>
      {failed && (
        <p role="alert" className="failure">
          {t("app.thread.listFailed")}
          <Button variant="ghost" onClick={() => void model.refreshThreads()}>
            {t("app.retry")}
          </Button>
        </p>
      )}
      {!threads.length && !failed && (
        <p className="muted">{t("app.sidebar.noProject")}</p>
      )}
      <ThreadButtons model={model}>
        {threads.map((thread, index) => (
          <ThreadButton
            key={thread.threadId}
            model={model}
            threadId={thread.threadId}
            directory={thread.directory}
            number={threads.length - index}
          />
        ))}
      </ThreadButtons>
    </nav>
  );
}

function ThreadButtons({
  model,
  children,
}: {
  model: AppModel;
  children: ReactNode;
}) {
  const busy = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition === "unknown",
  );
  return (
    <fieldset className="thread-buttons" disabled={busy}>
      {children}
    </fieldset>
  );
}

const ThreadButton = memo(function ThreadButton({
  model,
  threadId,
  directory,
  number,
}: {
  model: AppModel;
  threadId: Parameters<AppModel["selectThread"]>[0];
  directory: string;
  number: number;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const selected = useStore(
    model.stateStore,
    (state) =>
      state.kind === "ready" &&
      state.threadSelection.kind === "thread" &&
      state.threadSelection.thread.context.threadId === threadId,
  );
  return (
    <Button
      variant="navigation"
      data-thread-navigation
      aria-current={selected ? "page" : undefined}
      title={directory + " · " + threadId}
      onClick={() =>
        void navigate({
          to: "/threads/$threadId",
          params: { threadId },
          search: { view: "conversation" },
        })
      }
    >
      <FolderIcon />
      <span className="thread-name">
        {directory.split("/").filter(Boolean).at(-1)}
        <small>
          {t("app.thread.label", { number })} · {threadId.slice(0, 6)}
        </small>
        <ThreadAttention model={model} threadId={threadId} />
      </span>
    </Button>
  );
});
