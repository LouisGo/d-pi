import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import { ConfigurationSettings } from "../../../modules/configuration/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { BUILD_INFO } from "../../../shared/build-info";
import type { AppModel } from "../wiring/model";
import { PreferenceToolbar } from "./preference-toolbar";
import { ProjectThreads } from "./project-threads";
import { ThreadNotice } from "./thread-notice";

type ApplicationLayoutProps = { model: AppModel; children?: ReactNode };

export function ApplicationLayout({ model, children }: ApplicationLayoutProps) {
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
      <ReadyWorkbench model={model}>{children}</ReadyWorkbench>
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

function ReadyWorkbench({ model, children }: ApplicationLayoutProps) {
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
