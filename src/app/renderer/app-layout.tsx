import { Outlet, useNavigate } from "@tanstack/react-router";
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { FolderIcon } from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import { ConfigurationSettings } from "../../modules/configuration/renderer/public";
import type { FrozenSelection } from "../../modules/files/core/public";
import type { CodeView } from "../../modules/files/renderer/public";
import { useI18n } from "../../modules/preferences/renderer/public";
import { BUILD_INFO } from "../../shared/build-info";
import {
  ChooseProjectButton,
  PreferenceToolbar,
  ThreadNotice,
} from "./appearance-controls";
import { Conversation, History, Submissions } from "./conversation";
import type { AppModel, ThreadSelectionState } from "./model";
import { ModelControls } from "./model-controls";
import type { ReadingView } from "./routing/search";
import { RuntimePanel } from "./runtime-panel";
import { Composer } from "./workbench/composer";
import { FilePanel } from "./workbench/file-panel";

export type WorkbenchProps = {
  children?: ReactNode;
  model: AppModel;
  /** Renderer bootstrap supplies the lazily loaded editor adapter. */
  editor?:
    | ComponentType<{
        view: CodeView;
        onSelection: (value: FrozenSelection) => void;
      }>
    | undefined;
};

export function ApplicationLayout({ model, editor, children }: WorkbenchProps) {
  const { t } = useI18n();
  const phase = useStore(model.stateStore, (state) => state.kind);
  return match(phase)
    .with("loading", () => (
      <main className="startup" role="status">
        {t("app.loading")}
      </main>
    ))
    .with("failed", () => <StartupFailure model={model} />)
    .with("disposed", () => null)
    .with("ready", () => (
      <ReadyWorkbench model={model} editor={editor}>
        {children}
      </ReadyWorkbench>
    ))
    .exhaustive();
}

function StartupFailure({ model }: { model: AppModel }) {
  const { t, formatMessage } = useI18n();
  const error = useStore(model.stateStore, (state) =>
    state.kind === "failed" ? state.error : null,
  );
  if (!error) return null;
  return (
    <main className="startup failure">
      <h1>{t("app.failure.title")}</h1>
      <p>{formatMessage(error.message)}</p>
      <p className="trace">{t("app.trace", { traceId: error.traceId })}</p>
      <p className="trace">{t("app.build", { buildId: BUILD_INFO.id })}</p>
      <Button onClick={() => void model.start()}>{t("app.retry")}</Button>
    </main>
  );
}

function ReadyWorkbench({ model, children }: WorkbenchProps) {
  const { t } = useI18n();
  const threadSelection = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.threadSelection : null,
  );
  const transition = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.threadTransition : undefined,
  );
  if (!threadSelection) return null;
  const thread =
    threadSelection.kind === "thread" ? threadSelection.thread : null;
  return (
    <div
      className="app-shell"
      inert={transition === "pending"}
      aria-busy={transition === "pending"}
    >
      <aside className="sidebar">
        <div className="brand">
          {/* i18n-ignore: product brand and release marker */}
          d-pi <span>M2</span>
        </div>
        <ProjectThreads model={model} />
        <div className="sidebar-bottom">
          <span className="muted">{t("app.sidebar.localDraft")}</span>
          <span className="muted">{t("app.executionNeedsApproval")}</span>
          <span className="trace muted" title={BUILD_INFO.commit}>
            {BUILD_INFO.version} · {BUILD_INFO.id}
          </span>
        </div>
      </aside>
      <main className="workbench">
        <PreferenceToolbar model={model} hasThread={thread !== null} />
        <ThreadNotice model={model} />
        {model.configuration && transition !== "unknown" && (
          <ConfigurationSettings
            bridge={model.configuration}
            scope={
              thread
                ? {
                    kind: "thread",
                    threadId: thread.context.threadId,
                    workingDirectoryId: thread.context.workingDirectoryId,
                  }
                : { kind: "application" }
            }
          />
        )}
        <div className="work-content">{children ?? <Outlet />}</div>
      </main>
    </div>
  );
}

function ProjectThreads({ model }: { model: AppModel }) {
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

export function ThreadWorkbench({
  model,
  threadSelection,
  editor,
  readingView,
  onReadingViewChange,
}: WorkbenchProps & {
  readingView: ReadingView;
  onReadingViewChange: (view: ReadingView) => void;
  threadSelection: Extract<ThreadSelectionState, { kind: "thread" }>;
}) {
  const { t } = useI18n();
  const { thread, directoryAvailable } = threadSelection;
  const { submission } = thread;
  const [selectionAttachment, setSelectionAttachment] = useState<{
    id: string;
    threadId: string;
    selection: Extract<FrozenSelection, { kind: "selection" }>;
  } | null>(null);
  const onAttachmentApplied = useCallback((id: string) => {
    setSelectionAttachment((current) => (current?.id === id ? null : current));
  }, []);
  const onAttach = useCallback(
    (selection: Extract<FrozenSelection, { kind: "selection" }>) => {
      setSelectionAttachment({
        id: crypto.randomUUID(),
        threadId: thread.context.threadId,
        selection,
      });
    },
    [thread],
  );
  return (
    <section className="thread-workspace">
      <div className="thread-setup">
        <div className="directory-info" title={thread.context.directory}>
          <FolderIcon />
          <h1>{thread.context.directory.split("/").filter(Boolean).at(-1)}</h1>
          <span className="muted">{thread.context.directory}</span>
        </div>
        {!directoryAvailable && (
          <p className="failure" role="alert">
            {t("app.draft.directoryUnavailable")}
          </p>
        )}
        {model.configuration && (
          <ModelControls thread={thread} bridge={model.configuration} />
        )}
        {thread.runtime && (
          <RuntimePanel
            model={thread.runtime}
            submission={thread.submission}
            // Post-default user answers become a new steering instruction
            // (2026-09-28 decision), not a follow-up.
            onFollowUp={
              submission
                ? (text: string) => submission.sendText(text, "steer")
                : undefined
            }
          />
        )}
      </div>
      <nav
        className="reading-navigation"
        aria-label={t("app.reading.navigation")}
      >
        <Button
          variant="ghost"
          aria-pressed={readingView === "conversation"}
          onClick={() => onReadingViewChange("conversation")}
        >
          {t("ui.conversation.heading")}
        </Button>
        <Button
          variant="ghost"
          aria-pressed={readingView === "files"}
          onClick={() => onReadingViewChange("files")}
        >
          {t("ui.files.section")}
        </Button>
        <Button
          variant="ghost"
          aria-pressed={readingView === "submissions"}
          onClick={() => onReadingViewChange("submissions")}
        >
          {t("app.reading.submissions")}
        </Button>
        <Button
          variant="ghost"
          aria-pressed={readingView === "history"}
          onClick={() => onReadingViewChange("history")}
        >
          {t("app.reading.history")}
        </Button>
      </nav>
      <div className="thread-reading">
        <div className="reading-pane" hidden={readingView !== "conversation"}>
          {thread.reading && (
            <Conversation
              model={thread.reading}
              onHistory={() => onReadingViewChange("history")}
            />
          )}
        </div>
        <div className="reading-pane" hidden={readingView !== "files"}>
          {model.files && model.git && (
            <FilePanel
              resource={thread.context}
              files={model.files}
              git={model.git}
              editor={editor}
              onAttach={onAttach}
            />
          )}
        </div>
        <div className="reading-pane" hidden={readingView !== "submissions"}>
          {submission && <Submissions model={submission} />}
        </div>
        <div className="reading-pane" hidden={readingView !== "history"}>
          {model.history && (
            <History
              bridge={model.history}
              active={readingView === "history"}
              threadId={thread.context.threadId}
            />
          )}
        </div>
      </div>
      <Composer
        thread={thread}
        model={model}
        selectionAttachment={selectionAttachment}
        onAttachmentApplied={onAttachmentApplied}
      />
    </section>
  );
}

export function EmptyWorkbench({ model }: { model: AppModel }) {
  const { t } = useI18n();
  return (
    <div className="empty-state">
      <h1>{t("app.empty.title")}</h1>
      <p className="muted">{t("app.empty.description")}</p>
      <ChooseProjectButton model={model} />
      <p className="empty-note">{t("app.empty.note")}</p>
    </div>
  );
}
