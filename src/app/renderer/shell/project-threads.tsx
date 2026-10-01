import { useNavigate } from "@tanstack/react-router";
import { useStore } from "zustand";
import { FolderIcon } from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { AppModel } from "../wiring/model";
import { ChooseProjectButton } from "./choose-project-button";

export function ProjectThreads({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const threads = useStore(model.threadListStore, (state) => state.threads);
  const failed = useStore(model.threadListStore, (state) => state.failed);
  const selected = useStore(model.stateStore, (state) =>
    state.kind === "ready" && state.threadSelection.kind === "thread"
      ? state.threadSelection.thread.context.threadId
      : null,
  );
  const busy = useStore(
    model.stateStore,
    (state) =>
      state.kind === "ready" &&
      (state.busy || state.threadTransition === "unknown"),
  );
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
      {threads.map((thread, index) => (
        <Button
          key={thread.threadId}
          variant={selected === thread.threadId ? "default" : "ghost"}
          disabled={busy}
          aria-current={selected === thread.threadId ? "page" : undefined}
          title={thread.directory + " · " + thread.threadId}
          onClick={() =>
            void navigate({
              to: "/threads/$threadId",
              params: { threadId: thread.threadId },
              search: { view: "conversation" },
            })
          }
        >
          <FolderIcon />
          <span className="thread-name">
            {thread.directory.split("/").filter(Boolean).at(-1)}
            <small>
              {t("app.thread.label", { number: threads.length - index })} ·{" "}
              {thread.threadId.slice(0, 6)}
            </small>
          </span>
        </Button>
      ))}
    </nav>
  );
}
