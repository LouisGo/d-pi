import { Outlet } from "@tanstack/react-router";
import { type ReactNode, useContext } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import { ConfigurationSettings } from "../../../modules/configuration/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { BUILD_INFO } from "../../../shared/build-info";
import type { AppModel } from "../wiring/model";
import {
  AttentionCenter,
  AttentionIndicator,
  AttentionPreferences,
} from "./attention";
import { Diagnostics } from "./diagnostics";
import { WorkbenchHostsContext } from "./layout/hosts-context";
import { WorkbenchFrame } from "./layout/workbench-frame";
import {
  PreferenceToolbar,
  ThreadNavigationControls,
} from "./preference-toolbar";
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
      <div className="window-drag-strip" aria-hidden="true" />
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
      <div className="window-drag-strip" aria-hidden="true" />
      <h1>{t("app.failure.title")}</h1>
      <p>{formatMessage(error.message)}</p>
      <p className="trace">{t("app.trace", { traceId: error.traceId })}</p>
      <p className="trace">{t("app.build", { buildId: BUILD_INFO.id })}</p>
      <Diagnostics />
      <Diagnostics traceId={error.traceId} />
      <Button onClick={() => void model.start()}>{t("app.retry")}</Button>
    </main>
  );
}

function ReadyWorkbench({ model, children }: ApplicationLayoutProps) {
  const hosts = useContext(WorkbenchHostsContext);
  return (
    <ShellFrame model={model}>
      <WorkbenchFrame
        {...hosts}
        conversationIndicator={<AttentionIndicator model={model} />}
        sidebar={
          <>
            <ProjectThreads model={model} />
            <SidebarFooter model={model} />
          </>
        }
        toolbar={<PreferenceToolbar model={model} />}
        navigationControls={<ThreadNavigationControls model={model} />}
        settingsNavigation={<SettingsNavigation />}
        settings={<SettingsSurface model={model} />}
      >
        <main className="workbench">
          <ThreadNotice model={model} />
          <AttentionCenter model={model} />
          <div className="work-content">{children ?? <Outlet />}</div>
        </main>
      </WorkbenchFrame>
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

function SidebarFooter({ model }: { model: AppModel }) {
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

function SettingsNavigation() {
  const { t } = useI18n();
  return (
    <nav className="settings-navigation" aria-label={t("app.layout.settings")}>
      {(["configuration", "attention", "diagnostics"] as const).map(
        (section) => (
          <Button
            key={section}
            variant="navigation"
            onClick={() =>
              document
                .getElementById(`settings-${section}`)
                ?.scrollIntoView({ block: "start" })
            }
          >
            {t(`app.layout.${section}`)}
          </Button>
        ),
      )}
    </nav>
  );
}
function SettingsSurface({ model }: { model: AppModel }) {
  const { t } = useI18n();
  return (
    <>
      <section id="settings-configuration" className="settings-section">
        <h2>{t("app.layout.configuration")}</h2>
        <ThreadConfiguration model={model} />
      </section>
      <section id="settings-attention" className="settings-section">
        <h2>{t("app.layout.attention")}</h2>
        <AttentionPreferences model={model} />
      </section>
      <section id="settings-diagnostics" className="settings-section">
        <h2>{t("app.layout.diagnostics")}</h2>
        <Diagnostics />
      </section>
    </>
  );
}
