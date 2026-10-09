import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { ConversationSnapshot } from "../../../modules/conversation/contracts/public";
import type { RuntimeView } from "../../../modules/execution/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { LoadingIndicator } from "../../../modules/ui/renderer/public";
import { runtimePhaseLabel } from "../components/runtime-phase";
import { StatusPreview } from "../components/ui/status-preview";
import type { AppModel } from "../wiring/model";
import type { ThreadModel } from "../wiring/thread-model";

// Optional capabilities use inert read-only stores; no native reads or commands.
const emptyRuntime = createStore<{ view: RuntimeView | null }>(() => ({
  view: null,
}));
const emptyReading = createStore<{ view: ConversationSnapshot | null }>(() => ({
  view: null,
}));
export function ConversationStatus({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const thread = useStore(model.stateStore, (state) =>
    state.kind === "ready" && state.threadSelection.kind === "thread"
      ? state.threadSelection.thread
      : null,
  );
  const transition = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.threadTransition : undefined,
  );
  if (transition)
    return transition === "pending" ? (
      <LoadingIndicator pending label={t("app.loading")} />
    ) : (
      <span>
        {t(
          transition === "unknown"
            ? "app.navigation.selectionUnknown"
            : "app.status.switching",
        )}
      </span>
    );
  return thread ? (
    <ThreadStatus key={thread.key} thread={thread} />
  ) : (
    <span>{t("app.status.noConversation")}</span>
  );
}
function ThreadStatus({ thread }: { thread: ThreadModel }) {
  const { t, formatMessage } = useI18n();
  const runtime = thread.runtime?.stateStore ?? emptyRuntime;
  const reading = thread.reading?.stateStore ?? emptyReading;
  const phase = useStore(runtime, (state) => state.view?.phase);
  const busy = useStore(runtime, (state) => state.view?.busy ?? false);
  const model = useStore(runtime, (state) => state.view?.model ?? null);
  const queued = useStore(runtime, (state) => state.view?.control?.queued);
  const background = useStore(
    runtime,
    (state) => state.view?.control?.background,
  );
  const message = useStore(runtime, (state) => state.view?.message);
  const count = useStore(
    reading,
    (state) =>
      state.view?.items.filter(
        (item) => item.role === "user" || item.role === "assistant",
      ).length,
  );
  const gap = useStore(reading, (state) => state.view?.gap ?? false);
  const label = phase
    ? runtimePhaseLabel({ phase, busy, model }, t)
    : t("app.sidebar.localDraft");
  const unavailable = t("app.status.unavailable");
  if (!phase || phase === "allowed" || phase === "starting") return null;
  return (
    <StatusPreview
      label={t("app.status.preview")}
      summary={
        <span>
          {label}
          {count !== undefined
            ? ` · ${t("app.status.messages", { count })}`
            : ""}
          {queued ? ` · ${t("app.status.queued", { count: queued })}` : ""}
        </span>
      }
    >
      <dl>
        <dt>{t("app.status.execution")}</dt>
        <dd>{label}</dd>
        <dt>{t("app.status.model")}</dt>
        <dd>{model ?? unavailable}</dd>
        <dt>{t("app.status.messagesLabel")}</dt>
        <dd>{count ?? unavailable}</dd>
        <dt>{t("app.status.queueLabel")}</dt>
        <dd>{queued ?? unavailable}</dd>
        <dt>{t("app.status.background")}</dt>
        <dd>{background ?? unavailable}</dd>
        <dt>{t("app.status.directory")}</dt>
        <dd data-selectable>{thread.context.directory}</dd>
      </dl>
      {message && <p>{formatMessage(message)}</p>}
      <p>{t(gap ? "app.status.messagesGap" : "app.status.messagesScope")}</p>
    </StatusPreview>
  );
}
