import { Outlet } from "@tanstack/react-router";
import { type ReactNode, useContext } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, LoadingIndicator } from "../../../modules/ui/renderer/public";
import { BUILD_INFO } from "../../../shared/build-info";
import type { AppModel } from "../wiring/model";
import { AttentionCenter, AttentionIndicator } from "./attention";
import { ConversationStatus } from "./conversation-status";
import { DeveloperTools, useConversationNavigation } from "./developer-tools";
import { Diagnostics } from "./diagnostics";
import { WorkbenchHostsContext } from "./layout/hosts-context";
import { WorkbenchFrame } from "./layout/workbench-frame";
import {
  PreferenceToolbar,
  ThreadNavigationControls,
} from "./preference-toolbar";
import { ProjectThreads } from "./project-threads";
import {
  SettingsNavigation,
  SettingsProvider,
  SettingsSurface,
} from "./settings/settings";
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
    <main className="startup">
      <div className="window-drag-strip" aria-hidden="true" />
      <LoadingIndicator pending placement="center" label={t("app.loading")} />
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
  const conversationNavigation = useConversationNavigation(model);
  return (
    <ShellFrame model={model}>
      <SettingsProvider>
        <WorkbenchFrame
          {...hosts}
          {...conversationNavigation}
          developerTools={<DeveloperTools />}
          conversationIndicator={<AttentionIndicator model={model} />}
          sidebar={<ProjectThreads model={model} />}
          status={<ConversationStatus model={model} />}
          version={
            <span
              title={`${BUILD_INFO.version} · ${BUILD_INFO.id} · ${BUILD_INFO.commit}`}
            >
              {BUILD_INFO.version}
            </span>
          }
          toolbar={
            <PreferenceToolbar
              model={model}
              title={conversationNavigation.developerTitle}
            />
          }
          navigationControls={<ThreadNavigationControls model={model} />}
          settingsNavigation={<SettingsNavigation />}
          settings={<SettingsSurface model={model} />}
        >
          {conversationNavigation.developerActive ? (
            (children ?? <Outlet />)
          ) : (
            <main className="workbench">
              <ThreadNotice model={model} />
              <AttentionCenter model={model} />
              <div className="work-content">{children ?? <Outlet />}</div>
            </main>
          )}
        </WorkbenchFrame>
      </SettingsProvider>
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
