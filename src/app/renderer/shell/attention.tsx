import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { ThreadContext } from "../../../modules/threads/contracts/public";
import {
  Button,
  SettingRow,
  SettingsGroup,
  Switch,
} from "../../../modules/ui/renderer/public";
import type { AttentionEntry } from "../../contracts/attention";
import type { AppModel } from "../wiring/model";

import { ConversationVisibilityContext } from "./layout/conversation-visibility";

function kindKey(kind: AttentionEntry["kind"]) {
  return match(kind)
    .with("needs-answer", () => "attention.needsAnswer" as const)
    .with("failed", () => "attention.failed" as const)
    .with("completed", () => "attention.completed" as const)
    .with("interrupted", () => "attention.interrupted" as const)
    .exhaustive();
}
export function ThreadAttention({
  model,
  threadId,
}: {
  model: AppModel;
  threadId: ThreadContext["threadId"];
}) {
  return model.attention?.available ? (
    <ThreadAttentionEntry model={model} threadId={threadId} />
  ) : null;
}
function ThreadAttentionEntry({
  model,
  threadId,
}: {
  model: AppModel;
  threadId: ThreadContext["threadId"];
}) {
  const { t } = useI18n();
  const entry = useStore(model.attention.stateStore, (state) =>
    state.byThread.get(threadId),
  );
  if (!entry) return null;
  return (
    <small
      data-attention-thread={threadId}
      data-attention-kind={entry.kind}
      data-attention-unread={entry.unread}
    >
      {t(kindKey(entry.kind))}
      {entry.unread ? ` · ${t("attention.unread")}` : ""}
    </small>
  );
}
export function AttentionCenter({ model }: { model: AppModel }) {
  return model.attention?.available ? <AttentionContent model={model} /> : null;
}
function AttentionContent({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const { visible: conversationVisible, reveal } = useContext(
    ConversationVisibilityContext,
  );
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const snapshot = useStore(
    model.attention.stateStore,
    (state) => state.snapshot,
  );
  const failed = useStore(model.attention.stateStore, (state) => state.failed);
  const current = useStore(model.stateStore, (state) =>
    state.kind === "ready" &&
    state.threadTransition === undefined &&
    state.threadSelection.kind === "thread"
      ? state.threadSelection.thread.context.threadId
      : null,
  );
  const currentEntry = useStore(model.attention.stateStore, (state) =>
    current ? state.byThread.get(current) : undefined,
  );
  const [pending, setPending] = useState<{
    threadId: ThreadContext["threadId"];
    eventId: string;
  } | null>(null);
  const [stale, setStale] = useState(false);
  const opening = useRef(false);
  const handledOpen = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const open = useCallback(
    async (intent: {
      threadId: ThreadContext["threadId"];
      eventId: string;
    }) => {
      if (opening.current) {
        setPending(intent);
        return;
      }
      opening.current = true;
      try {
        const currentEntry = model.attention.stateStore
          .getState()
          .byThread.get(intent.threadId);
        await navigate({
          to: "/threads/$threadId",
          params: { threadId: intent.threadId },
          search: {
            view:
              currentEntry?.kind === "failed" ? "submissions" : "conversation",
          },
        });
        if (!mounted.current) return;
        const state = model.getSnapshot();
        if (
          state.kind !== "ready" ||
          state.threadTransition === "unknown" ||
          state.threadSelection.kind !== "thread" ||
          state.threadSelection.thread.context.threadId !== intent.threadId ||
          router.state.location.pathname !== `/threads/${intent.threadId}`
        ) {
          setPending(intent);
          return;
        }
        setPending((previous) =>
          previous?.eventId === intent.eventId ? null : previous,
        );
        const entry = model.attention.stateStore
          .getState()
          .byThread.get(intent.threadId);
        const view = entry?.kind === "failed" ? "submissions" : "conversation";
        if (router.state.location.search.view !== view) {
          await navigate({
            to: "/threads/$threadId",
            params: { threadId: intent.threadId },
            search: { view },
            replace: true,
          });
          if (!mounted.current) return;
        }
        reveal();
        setStale(!entry || entry.eventId !== intent.eventId);
        // A historical notification is only a navigation intent. Locate the current
        // interaction/result, never answer the event carried by a stale click.
        if (entry) model.attention.locate(entry);
      } finally {
        opening.current = false;
      }
    },
    [model, navigate, router, reveal],
  );
  useEffect(() => {
    const request = snapshot?.openRequest;
    if (!request || handledOpen.current === request.id) return;
    handledOpen.current = request.id;
    void open(request).finally(() => void model.attention.opened(request.id));
  }, [snapshot?.openRequest, model, open]);
  useEffect(() => {
    const foreground = () =>
      document.visibilityState !== "hidden" && document.hasFocus();
    const synchronize = () => {
      const visible =
        conversationVisible &&
        foreground() &&
        pathname === `/threads/${current}`
          ? current
          : null;
      void model.attention.visible(visible, true);
      if (
        currentEntry?.unread &&
        conversationVisible &&
        foreground() &&
        pathname === `/threads/${current}`
      )
        void model.attention.seen(currentEntry);
    };
    const blur = () => {
      void model.attention.visible(null, true);
    };
    synchronize();
    window.addEventListener("focus", synchronize);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", synchronize);
    return () => {
      window.removeEventListener("focus", synchronize);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", synchronize);
    };
  }, [current, currentEntry, model, pathname, conversationVisible]);
  if (!model.attention.available) return null;
  const entries =
    snapshot?.entries.filter(
      (entry) =>
        entry.unread &&
        (entry.kind !== "completed" || snapshot.preferences.completion),
    ) ?? [];
  if (
    !entries.length &&
    !failed &&
    !snapshot?.coverageGap &&
    !pending &&
    !stale
  )
    return null;
  return (
    <section
      aria-label={t("attention.title")}
      data-attention-center
      className="notice attention-center"
    >
      {failed && (
        <p role="alert" className="failure">
          {t("attention.readFailed")}{" "}
          <Button
            variant="ghost"
            onClick={() => void model.attention.refresh()}
          >
            {t("app.retry")}
          </Button>
        </p>
      )}
      {snapshot?.coverageGap && (
        <p className="muted">{t("attention.coverageGap")}</p>
      )}
      {entries.map((entry) => (
        <div
          key={entry.eventId}
          data-attention-entry={entry.eventId}
          className="flex items-center gap-2"
        >
          <span>
            {t(kindKey(entry.kind))} · {entry.threadId.slice(0, 6)}
          </span>
          <Button
            variant="ghost"
            data-attention-open={entry.threadId}
            onClick={() => void open(entry)}
          >
            {t("attention.open")}
          </Button>
        </div>
      ))}
      {pending && (
        <p role="status">
          {t("attention.navigationBlocked")}{" "}
          <Button
            variant="ghost"
            data-attention-retry
            onClick={() => void open(pending)}
          >
            {t("attention.retryOpen")}
          </Button>
        </p>
      )}
      {stale && <p role="status">{t("attention.stale")}</p>}
    </section>
  );
}
export function AttentionPreferences({ model }: { model: AppModel }) {
  return model.attention?.available ? (
    <AttentionPreferenceContent model={model} />
  ) : null;
}
function AttentionPreferenceContent({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const snapshot = useStore(
    model.attention.stateStore,
    (state) => state.snapshot,
  );
  const saving = useStore(model.attention.stateStore, (state) => state.saving);
  const failed = useStore(model.attention.stateStore, (state) => state.failed);
  if (!model.attention.available) return null;
  return (
    <div data-attention-preferences className="settings-notice">
      <SettingsGroup title={t("attention.preferences")}>
        <SettingRow
          label={t("attention.enableSystem")}
          description={t("settings.systemNotificationDescription")}
        >
          <Switch
            data-attention-system
            aria-label={t("attention.enableSystem")}
            checked={snapshot?.preferences.system ?? false}
            disabled={!snapshot || saving}
            onCheckedChange={(checked) => {
              if (snapshot)
                void model.attention.preferences({
                  ...snapshot.preferences,
                  system: checked,
                });
            }}
          />
        </SettingRow>
        <SettingRow
          label={t("attention.enableCompletion")}
          description={t("settings.completionDescription")}
        >
          <Switch
            data-attention-completion
            aria-label={t("attention.enableCompletion")}
            checked={snapshot?.preferences.completion ?? false}
            disabled={!snapshot || saving}
            onCheckedChange={(checked) => {
              if (snapshot)
                void model.attention.preferences({
                  ...snapshot.preferences,
                  completion: checked,
                });
            }}
          />
        </SettingRow>
      </SettingsGroup>
      <p className="muted">{t("attention.systemHint")}</p>
      {saving && <p role="status">{t("settings.saving")}</p>}
      {failed && (
        <p role="alert" className="failure">
          {t("attention.readFailed")}
        </p>
      )}
      {snapshot && (
        <p role="status">
          {match(snapshot.system)
            .with("disabled", () => t("attention.systemDisabled"))
            .with("available", () => t("attention.systemAvailable"))
            .with("unavailable", () => t("attention.systemUnavailable"))
            .with("failed", () => t("attention.systemFailed"))
            .exhaustive()}
        </p>
      )}
    </div>
  );
}

export function AttentionIndicator({ model }: { model: AppModel }) {
  return model.attention?.available ? <UnreadIndicator model={model} /> : null;
}
function UnreadIndicator({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const unread = useStore(
    model.attention.stateStore,
    (state) =>
      state.snapshot?.entries.some(
        (entry) =>
          entry.unread &&
          (entry.kind !== "completed" ||
            state.snapshot?.preferences.completion),
      ) ?? false,
  );
  return (
    <span role="status" aria-live="polite">
      <span
        className="activity-indicator"
        hidden={!unread}
        aria-hidden="true"
      />
      <span className="sr-only">{unread ? t("attention.unread") : ""}</span>
    </span>
  );
}
