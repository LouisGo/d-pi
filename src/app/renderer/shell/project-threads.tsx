import { useNavigate } from "@tanstack/react-router";
import { memo, type ReactNode } from "react";
import { useStore } from "zustand";
import { FolderIcon } from "@/components/icons/common";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { ThreadContext } from "../../../modules/threads/contracts/public";
import { Button } from "../../../modules/ui/renderer/public";
import type { AppModel } from "../wiring/model";
import { ThreadAttention } from "./attention";
import { ChooseProjectButton } from "./choose-project-button";
import { NewThreadButton } from "./preference-toolbar";

export function ProjectThreads({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const threads = useStore(model.threadListStore, (state) => state.threads);
  const failed = useStore(model.threadListStore, (state) => state.failed);
  const pending = useStore(model.threadListStore, (state) => state.pending);
  const nativeIndex = useStore(
    model.threadListStore,
    (state) => state.nativeIndex,
  );
  const groups = new Map<string, ThreadContext[]>();
  for (const thread of threads) {
    const group = groups.get(thread.directory);
    if (group) group.push(thread);
    else groups.set(thread.directory, [thread]);
  }
  return (
    <nav aria-label={t("app.sidebar.projects")} className="thread-navigation">
      <NewThreadButton model={model} />
      <div className="sidebar-label">
        <span>{t("app.sidebar.projects")}</span>
        <ChooseProjectButton model={model} iconOnly />
      </div>
      {failed && (
        <p role="alert" className="failure">
          {t("app.thread.listFailed")}
          <Button variant="ghost" onClick={() => void model.refreshThreads()}>
            {t("app.retry")}
          </Button>
        </p>
      )}
      {pending && !threads.length && (
        <p role="status" className="muted">
          {t("ui.history.discovering")}
        </p>
      )}
      {nativeIndex && nativeIndex !== "ready" && (
        <p role="status" className="muted">
          {t(
            nativeIndex === "partial"
              ? "app.thread.indexPartial"
              : "app.thread.indexUnavailable",
          )}{" "}
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => void model.refreshThreads()}
          >
            {t("app.retry")}
          </Button>
        </p>
      )}
      {!threads.length &&
        !failed &&
        !pending &&
        nativeIndex !== "unavailable" && (
          <p className="muted">{t("app.sidebar.noProject")}</p>
        )}
      <ThreadButtons model={model}>
        {[...groups].map(([directory, group]) => (
          <section
            key={directory}
            className="flex flex-col gap-1"
            data-project-group={directory}
          >
            <div className="sidebar-label" title={directory}>
              <FolderIcon />
              <span>
                {directory.split("/").filter(Boolean).at(-1) ?? directory}
              </span>
            </div>
            {group.map((thread) => (
              <ThreadButton
                key={thread.threadId}
                model={model}
                threadId={thread.threadId}
                directory={thread.directory}
                title={thread.title}
                number={threads.length - threads.indexOf(thread)}
              />
            ))}
          </section>
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
  title,
}: {
  model: AppModel;
  threadId: Parameters<AppModel["selectThread"]>[0];
  directory: string;
  number: number;
  title?: string | undefined;
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
        {title || t("app.thread.label", { number })}
        <small>
          {t("app.thread.label", { number })} · {threadId.slice(0, 6)}
        </small>
        <ThreadAttention model={model} threadId={threadId} />
      </span>
    </Button>
  );
});
