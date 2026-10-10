import { useMemo, useState } from "react";
import { useStore } from "zustand";
import { emptySidebarPreferences } from "../../../modules/preferences/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, NavigationSection } from "../../../modules/ui/renderer/public";
import type { AppModel } from "../wiring/model";
import { ChooseProjectButton } from "./choose-project-button";
import { NewThreadButton } from "./preference-toolbar";
import { SidebarCommandFeedback } from "./sidebar-command-feedback";
import { SidebarPreview } from "./sidebar-preview";
import { projectSidebar } from "./sidebar-projection";
import { SidebarSection } from "./sidebar-section";
import {
  type SidebarDiscoveryState,
  SidebarSkeleton,
} from "./sidebar-skeleton";
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
  const initialized = useStore(
    model.threadListStore,
    (state) => state.initialized,
  );
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
  const initialDiscovery = Boolean(pending) && !initialized;
  const skeleton = initialDiscovery && !projects.length && !threads.length;
  const discovery: SidebarDiscoveryState = initialDiscovery
    ? "loading"
    : (!initialized && failed) ||
        nativeIndex === "partial" ||
        nativeIndex === "unavailable"
      ? "unavailable"
      : "settled";
  return (
    <SidebarPreview model={model}>
      <nav
        aria-label={t("app.sidebar.projects")}
        className="thread-navigation"
        aria-busy={saving || Boolean(pending)}
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
        {initialDiscovery && (
          <span className="sr-only" role="status">
            {t("app.sidebar.loading")}
          </span>
        )}
        <div className="sidebar-sections">
          {skeleton && (
            <SidebarSkeleton
              collapsed={value.collapsedSections.includes("projects")}
            />
          )}
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
              discovery={discovery}
            />
          )}
          {!skeleton && (
            <SidebarSection
              model={model}
              section="projects"
              entries={projection.projects}
              value={value}
              disabled={disabled}
              navigationDisabled={navigationDisabled}
              discovery={discovery}
              action={<ChooseProjectButton model={model} iconOnly />}
            />
          )}
          {!projects.length &&
            !threads.length &&
            !failed &&
            (initialized || !pending) &&
            nativeIndex !== "unavailable" &&
            nativeIndex !== "partial" && (
              <p className="muted sidebar-feedback">
                {t("app.sidebar.noProject")}
              </p>
            )}
          {threads.some((thread) => thread.completed) && (
            <NavigationSection
              data-sidebar-section="completed"
              label={t("app.sidebar.completed")}
              expanded={showCompleted}
              deferMount
              onExpandedChange={setShowCompleted}
            >
              {threads
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
            </NavigationSection>
          )}
        </div>
        <ThreadCommandDialog model={model} />
      </nav>
    </SidebarPreview>
  );
}
