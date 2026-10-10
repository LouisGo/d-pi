import { useMemo, useState } from "react";
import { useStore } from "zustand";
import { emptySidebarPreferences } from "../../../modules/preferences/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, LoadingIndicator } from "../../../modules/ui/renderer/public";
import { SidebarChevronIcon } from "../components/icons/sidebar";
import type { AppModel } from "../wiring/model";
import { ChooseProjectButton } from "./choose-project-button";
import { NewThreadButton } from "./preference-toolbar";
import { SidebarCommandFeedback } from "./sidebar-command-feedback";
import { SidebarPreview } from "./sidebar-preview";
import { projectSidebar } from "./sidebar-projection";
import { SidebarSection } from "./sidebar-section";
import { SidebarThreadRow } from "./sidebar-thread-row";
import { ThreadCommandDialog } from "./thread-command-dialog";

const empty = emptySidebarPreferences();
export function ProjectThreads({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const [showCompleted, setShowCompleted] = useState(false);
  const commandPending = useStore(model.commands.stateStore, (s) => s.pending);
  const threads = useStore(model.threadListStore, (state) => state.threads);
  const projects = useStore(model.threadListStore, (state) => state.projects);
  const failed = useStore(model.threadListStore, (state) => state.failed);
  const pending = useStore(model.threadListStore, (state) => state.pending);
  const nativeIndex = useStore(
    model.threadListStore,
    (state) => state.nativeIndex,
  );
  const snapshot = useStore(
    model.sidebar.stateStore,
    (state) => state.snapshot,
  );
  const saving = useStore(model.sidebar.stateStore, (state) => state.pending);
  const saveFailed = useStore(
    model.sidebar.stateStore,
    (state) => state.failed,
  );
  const navigationDisabled = useStore(
    model.stateStore,
    (state) =>
      state.kind === "ready" &&
      (state.busy || state.threadTransition === "unknown"),
  );
  const value = snapshot?.value ?? empty;
  const projection = useMemo(
    () => projectSidebar(projects, threads, value),
    [projects, threads, value],
  );
  const disabled = saving || commandPending || !snapshot;
  return (
    <SidebarPreview model={model}>
      <nav
        aria-label={t("app.sidebar.projects")}
        className="thread-navigation"
        aria-busy={saving}
      >
        <NewThreadButton model={model} />
        <SidebarCommandFeedback model={model} />
        {failed && (
          <p role="alert" className="failure">
            {t("app.thread.listFailed")}
            <Button variant="ghost" onClick={() => void model.refreshThreads()}>
              {t("app.retry")}
            </Button>
          </p>
        )}
        {saveFailed && (
          <p role="alert" className="failure sidebar-feedback">
            {t("app.sidebar.saveFailed")}
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => void model.sidebar.refresh()}
            >
              {t("app.retry")}
            </Button>
          </p>
        )}
        <div className="sidebar-loading">
          <LoadingIndicator
            pending={(pending && !threads.length) || nativeIndex === "indexing"}
            label={t("app.loading")}
          />
        </div>
        {nativeIndex &&
          nativeIndex !== "ready" &&
          nativeIndex !== "indexing" && (
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
        {projection.pins.length > 0 && (
          <SidebarSection
            model={model}
            section="pins"
            entries={projection.pins}
            value={value}
            disabled={disabled}
            navigationDisabled={navigationDisabled}
          />
        )}
        <SidebarSection
          model={model}
          section="projects"
          entries={projection.projects}
          value={value}
          disabled={disabled}
          navigationDisabled={navigationDisabled}
          action={<ChooseProjectButton model={model} iconOnly />}
        />
        {!projects.length &&
          !threads.length &&
          !failed &&
          !pending &&
          nativeIndex !== "unavailable" &&
          nativeIndex !== "indexing" && (
            <p className="muted sidebar-feedback">
              {t("app.sidebar.noProject")}
            </p>
          )}
        {threads.some((thread) => thread.completed) && (
          <section className="sidebar-section">
            <Button
              variant="navigation"
              aria-expanded={showCompleted}
              onClick={() => setShowCompleted(!showCompleted)}
            >
              {t("app.sidebar.completed")}
              <span
                className="sidebar-section-chevron"
                data-collapsed={!showCompleted}
              >
                <SidebarChevronIcon />
              </span>
            </Button>
            {showCompleted &&
              threads
                .filter((thread) => thread.completed)
                .map((thread) => (
                  <SidebarThreadRow
                    key={thread.threadId}
                    model={model}
                    thread={thread}
                    pinned={false}
                    disabled={disabled}
                    navigationDisabled={navigationDisabled}
                  />
                ))}
          </section>
        )}
        <ThreadCommandDialog model={model} />
      </nav>
    </SidebarPreview>
  );
}
