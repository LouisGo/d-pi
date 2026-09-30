import { type ComponentType, Fragment, useState } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import {
  DarkThemeIcon,
  FolderIcon,
  LightThemeIcon,
} from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import type { FrozenSelection } from "../../modules/files/core/public";
import type { CodeView } from "../../modules/files/renderer/public";
import { useI18n } from "../../modules/preferences/renderer/public";
import { BUILD_INFO } from "../../shared/build-info";
import { Conversation, History, Submissions } from "./conversation";
import type { AppModel } from "./model";
import { RuntimePanel } from "./runtime-panel";
import { Composer } from "./workbench/composer";
import { FileWorkspace } from "./workbench/file-workspace";
export function App({
  model,
  editor,
}: {
  model: AppModel;
  /** Renderer bootstrap supplies the lazily loaded editor adapter. */
  editor?:
    | ComponentType<{
        view: CodeView;
        onSelection: (value: FrozenSelection) => void;
      }>
    | undefined;
}) {
  const { t, formatMessage, preference, setPreference, persistenceFailed } =
    useI18n();
  const state = useStore(model.stateStore);
  const [selectionAttachment, setSelectionAttachment] = useState<{
    id: string;
    threadId: string;
    selection: Extract<FrozenSelection, { kind: "selection" }>;
  } | null>(null);
  return match(state)
    .with({ kind: "loading" }, () => (
      <main className="startup" role="status">
        {t("app.loading")}
      </main>
    ))
    .with({ kind: "failed" }, ({ error }) => (
      <main className="startup failure">
        <h1>{t("app.failure.title")}</h1>
        <p>{formatMessage(error.message)}</p>
        <p className="trace">{t("app.trace", { traceId: error.traceId })}</p>
        <p className="trace">{t("app.build", { buildId: BUILD_INFO.id })}</p>
        <Button onClick={() => void model.start()}>{t("app.retry")}</Button>
      </main>
    ))
    .with({ kind: "disposed" }, () => null)
    .with({ kind: "ready" }, ({ workspace, preferences, notice, busy }) => {
      const thread = workspace.kind === "thread" ? workspace.thread : null;
      const draft = thread?.context;
      const submission = thread?.submission;
      return (
        <div className="app-shell">
          <aside className="sidebar">
            <div className="brand">
              {/* i18n-ignore: product brand and release marker */}
              d-pi <span>S4</span>
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
          <main className="workspace">
            <header className="toolbar">
              <span className="muted">
                {draft ? t("app.toolbar.newThread") : t("app.toolbar.start")}
              </span>
              <div className="flex gap-2">
                <select
                  aria-label={t("app.toolbar.language")}
                  value={preference}
                  disabled={busy}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (
                      value === "system" ||
                      value === "zh-CN" ||
                      value === "en-US"
                    )
                      void setPreference(value);
                  }}
                >
                  <option value="system">
                    {t("app.toolbar.systemLanguage")}
                  </option>
                  <option value="zh-CN">{t("app.toolbar.chinese")}</option>
                  <option value="en-US">{t("app.toolbar.english")}</option>
                </select>
                {persistenceFailed && (
                  <span role="alert" className="failure">
                    {t("app.language.saveFailed")}
                  </span>
                )}
                <Button
                  variant="ghost"
                  disabled={busy}
                  aria-label={
                    preferences.theme === "light"
                      ? t("app.toolbar.darkTheme")
                      : t("app.toolbar.lightTheme")
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void model.preference("theme")}
                >
                  {preferences.theme === "light" ? (
                    <DarkThemeIcon />
                  ) : (
                    <LightThemeIcon />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void model.preference("density")}
                >
                  {preferences.density === "normal"
                    ? t("app.toolbar.compactDensity")
                    : t("app.toolbar.normalDensity")}
                </Button>
              </div>
            </header>
            {notice && (
              <div role="alert" className="notice failure">
                {formatMessage(notice.message)}
                <span className="trace"> {notice.traceId}</span>
              </div>
            )}
            <div className="work-content">
              {thread ? (
                <Fragment key={thread.key}>
                  <div className="draft-intro">
                    <h1>{t("app.draft.title")}</h1>
                    <p className="muted">{t("app.draft.description")}</p>
                  </div>
                  <div className="directory-info">
                    <FolderIcon />
                    <span>{thread.context.directory}</span>
                    <span className="muted">
                      {t("app.executionNeedsApproval")}
                    </span>
                  </div>
                  {workspace.kind === "thread" &&
                    !workspace.directoryAvailable && (
                      <p className="failure" role="alert">
                        {t("app.draft.directoryUnavailable")}
                      </p>
                    )}
                  {thread.runtime && (
                    <RuntimePanel
                      model={thread.runtime}
                      submission={thread.submission}
                      // Post-default user answers become a new steering
                      // instruction (2026-09-28 decision), not a follow-up.
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
                    onAttachmentApplied={(id) =>
                      setSelectionAttachment((current) =>
                        current?.id === id ? null : current,
                      )
                    }
                  />
                  {model.files && model.git && (
                    <FileWorkspace
                      resource={thread.context}
                      files={model.files}
                      git={model.git}
                      editor={editor}
                      onAttach={(selection) =>
                        setSelectionAttachment({
                          id: crypto.randomUUID(),
                          threadId: thread.context.threadId,
                          selection,
                        })
                      }
                    />
                  )}
                  {thread.submission && (
                    <Submissions model={thread.submission} />
                  )}
                  {model.history && (
                    <History
                      bridge={model.history}
                      threadId={thread.context.threadId}
                    />
                  )}
                </Fragment>
              ) : (
                <div className="empty-state">
                  <h1>{t("app.empty.title")}</h1>
                  <p className="muted">{t("app.empty.description")}</p>
                  <Button disabled={busy} onClick={() => void model.choose()}>
                    <FolderIcon />
                    {t("app.empty.choose")}
                  </Button>
                  <p className="empty-note">{t("app.empty.note")}</p>
                </div>
              )}
            </div>
          </main>
        </div>
      );
    })
    .exhaustive();
}
