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
  const phase = useStore(model.stateStore, (state) => state.kind);
  return match(phase)
    .with("loading", () => <StartupLoading />)
    .with("failed", () => <StartupFailure model={model} />)
    .with("disposed", () => null)
    .with("ready", () => (
      <ReadyWorkbench model={model}>{children}</ReadyWorkbench>
    ))
    .exhaustive();
}

function StartupLoading() {
  const { t } = useI18n();
  return (
    <main className="startup" role="status">
      {t("app.loading")}
    </main>
  );
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
  return (
    <ShellFrame model={model}>
      <aside className="sidebar">
        <div className="brand">
          {/* i18n-ignore: product brand and release marker */}
          d-pi <span>M2</span>
        </div>
        <ProjectThreads model={model} />
        <SidebarFooter />
      </aside>
      <main className="workbench">
        <PreferenceToolbar model={model} />
        <ThreadNotice model={model} />
        <ThreadConfiguration model={model} />
        <div className="work-content">{children ?? <Outlet />}</div>
      </main>
    </ShellFrame>
  );
}

function ShellFrame({ model, children }: ApplicationLayoutProps) {
  const transition = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.threadTransition : undefined,
  );
  return (
    <div
      className="app-shell"
      inert={transition === "pending"}
      aria-busy={transition === "pending"}
    >
      {children}
    </div>
  );
}

function SidebarFooter() {
  const { t } = useI18n();
  return (
    <div className="sidebar-bottom">
      <span className="muted">{t("app.sidebar.localDraft")}</span>
      <span className="muted">{t("app.executionNeedsApproval")}</span>
      <span className="trace muted" title={BUILD_INFO.commit}>
        {BUILD_INFO.version} · {BUILD_INFO.id}
      </span>
    </div>
  );
}

function ThreadConfiguration({ model }: { model: AppModel }) {
  const threadSelection = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.threadSelection : null,
  );
  const unknown = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition === "unknown",
  );
  const thread =
    threadSelection?.kind === "thread" ? threadSelection.thread : null;
  return (
    <>
      {model.configuration && !unknown && (
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
    </>
  );
}
