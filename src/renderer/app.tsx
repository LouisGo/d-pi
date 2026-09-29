import { useState, useSyncExternalStore } from "react";
import { match } from "ts-pattern";
import {
  DarkThemeIcon,
  FolderIcon,
  LightThemeIcon,
} from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import type { FrozenSelection } from "../features/files/selection";
import { BUILD_INFO } from "../shared/build-info";
import { Composer } from "./composer";
import { Conversation, History, Submissions } from "./conversation";
import { FileWorkspace } from "./file-workspace";
import { useI18n } from "./i18n/i18n-provider";
import type { AppModel } from "./model";
import { RuntimePanel } from "./runtime-panel";
export function App({ model }: { model: AppModel }) {
  const { t, formatMessage, preference, setPreference, persistenceFailed } =
    useI18n();
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
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
    .with(
      { kind: "ready" },
      ({ draft, preferences, directoryAvailable, notice, busy }) => (
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
              {draft && model.controller ? (
                <>
                  <div className="draft-intro">
                    <h1>{t("app.draft.title")}</h1>
                    <p className="muted">{t("app.draft.description")}</p>
                  </div>
                  <div className="directory-info">
                    <FolderIcon />
                    <span>{draft.directory}</span>
                    <span className="muted">
                      {t("app.executionNeedsApproval")}
                    </span>
                  </div>
                  {!directoryAvailable && (
                    <p className="failure" role="alert">
                      {t("app.draft.directoryUnavailable")}
                    </p>
                  )}
                  {model.runtime && (
                    <RuntimePanel
                      model={model.runtime}
                      submission={model.submission}
                      // Post-default user answers become a new steering
                      // instruction (2026-09-28 decision), not a follow-up.
                      onFollowUp={
                        model.submission
                          ? (text: string) =>
                              model.submission!.sendText(text, "steer")
                          : undefined
                      }
                    />
                  )}
                  {model.runtime?.reading && (
                    <Conversation model={model.runtime.reading} />
                  )}
                  <Composer
                    draft={draft}
                    controller={model.controller}
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
                      key={draft.threadId}
                      threadId={draft.threadId}
                      files={model.files}
                      git={model.git}
                      onAttach={(selection) =>
                        setSelectionAttachment({
                          id: crypto.randomUUID(),
                          threadId: draft.threadId,
                          selection,
                        })
                      }
                    />
                  )}
                  {model.submission && <Submissions model={model.submission} />}
                  {model.history && (
                    <History bridge={model.history} threadId={draft.threadId} />
                  )}
                </>
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
      ),
    )
    .exhaustive();
}
