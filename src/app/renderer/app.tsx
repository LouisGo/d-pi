import { type ComponentType, Fragment, useCallback, useState } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { FolderIcon } from "@/components/icons/common";
import { Button } from "@/components/ui/button";
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
import { RuntimePanel } from "./runtime-panel";
import { Composer } from "./workbench/composer";
import { FilePanel } from "./workbench/file-panel";

type AppProps = {
  model: AppModel;
  /** Renderer bootstrap supplies the lazily loaded editor adapter. */
  editor?:
    | ComponentType<{
        view: CodeView;
        onSelection: (value: FrozenSelection) => void;
      }>
    | undefined;
};

export function App({ model, editor }: AppProps) {
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
    .with("ready", () => <ReadyWorkbench model={model} editor={editor} />)
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

function ReadyWorkbench({ model, editor }: AppProps) {
  const { t } = useI18n();
  const threadSelection = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.threadSelection : null,
  );
  if (!threadSelection) return null;
  const thread =
    threadSelection.kind === "thread" ? threadSelection.thread : null;
  const draft = thread?.context;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          {/* i18n-ignore: product brand and release marker */}
          d-pi <span>S5</span>
        </div>
        <div className="sidebar-label">{t("app.sidebar.projects")}</div>
        {draft ? (
          <div className="project-item">
            <FolderIcon />
            <span>{draft.directory.split("/").filter(Boolean).at(-1)}</span>
          </div>
        ) : (
          <p className="muted">{t("app.sidebar.noProject")}</p>
        )}
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
        <div className="work-content">
          {threadSelection.kind === "thread" ? (
            <ThreadWorkbench
              key={threadSelection.thread.key}
              model={model}
              threadSelection={threadSelection}
              editor={editor}
            />
          ) : (
            <div className="empty-state">
              <h1>{t("app.empty.title")}</h1>
              <p className="muted">{t("app.empty.description")}</p>
              <ChooseProjectButton model={model} />
              <p className="empty-note">{t("app.empty.note")}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ThreadWorkbench({
  model,
  threadSelection,
  editor,
}: AppProps & {
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
    <Fragment>
      <div className="draft-intro">
        <h1>{t("app.draft.title")}</h1>
        <p className="muted">{t("app.draft.description")}</p>
      </div>
      <div className="directory-info">
        <FolderIcon />
        <span>{thread.context.directory}</span>
        <span className="muted">{t("app.executionNeedsApproval")}</span>
      </div>
      {!directoryAvailable && (
        <p className="failure" role="alert">
          {t("app.draft.directoryUnavailable")}
        </p>
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
      {thread.reading && <Conversation model={thread.reading} />}
      <Composer
        thread={thread}
        model={model}
        selectionAttachment={selectionAttachment}
        onAttachmentApplied={onAttachmentApplied}
      />
      {model.files && model.git && (
        <FilePanel
          resource={thread.context}
          files={model.files}
          git={model.git}
          editor={editor}
          onAttach={onAttach}
        />
      )}
      {submission && <Submissions model={submission} />}
      {model.history && (
        <History bridge={model.history} threadId={thread.context.threadId} />
      )}
    </Fragment>
  );
}
