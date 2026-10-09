import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  ConversationItem,
  HistoryBridge,
  HistoryEntry,
} from "../../../modules/conversation/contracts/public";
import {
  type ConversationModel,
  type ReadingPositions,
  savedConversationQuery,
} from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Button,
  Disclosure,
  DisclosureTrigger,
  LoadingIndicator,
} from "../../../modules/ui/renderer/public";
import { ConversationItemView } from "./conversation";
import { historyToolEvidenceMessage } from "./history";
import { MessageMedia } from "./message-media";

/** One saved timeline survives execution startup and the bounded live window. */
export function SavedConversation({
  model,
  bridge,
  threadId,
  active,
  positions,
  onOpenHistory,
  initializing = false,
}: {
  model: ConversationModel;
  bridge: HistoryBridge;
  threadId: string;
  active: boolean;
  positions?: ReadingPositions | undefined;
  onOpenHistory?: (() => void) | undefined;
  initializing?: boolean;
}) {
  const { t } = useI18n();
  // Only membership/identity changes repaint the timeline; deltas belong to rows.
  const identities = useStore(
    model.stateStore,
    useShallow((state) =>
      state.itemIds.map((id) => state.itemsById.get(id)?.nativeRecordId ?? id),
    ),
  );
  const live = model.stateStore.getState();
  const saved = useInfiniteQuery({
    ...savedConversationQuery(bridge, threadId),
    enabled: active,
  });
  // A native end identity / resumed generation is a read-only invalidation,
  // never a prompt retry. Debounce coalesces user/end pairs and background bursts.
  const generation = useStore(
    model.stateStore,
    (state) => state.view?.connectionGeneration,
  );
  const gap = useStore(model.stateStore, (state) => state.view?.gap ?? false);
  const { refetch } = saved;
  const lastLive = useRef({ generation, identities });
  useEffect(() => {
    if (!active || !generation) return;
    const previous = lastLive.current;
    lastLive.current = { generation, identities };
    const unbound = saved.data?.pages.some(
      (page) => page.kind === "unavailable" && page.reason === "unbound",
    );
    if (
      previous.generation === generation &&
      previous.identities === identities &&
      !unbound
    )
      return;
    const timer = setTimeout(() => {
      void refetch();
    }, 150);
    return () => clearTimeout(timer);
  }, [active, generation, identities, refetch]);
  const source = JSON.stringify(["conversation", threadId]);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetching, fetchNextPage } = saved;
  useEffect(() => {
    const node = sentinel.current;
    if (active && gap && hasNextPage && !isFetching) {
      void fetchNextPage();
      return;
    }
    if (
      !active ||
      !node ||
      !hasNextPage ||
      isFetching ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { root: node.closest("[data-reading-pane]"), rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, gap, hasNextPage, isFetching, fetchNextPage]);
  const pages = saved.data?.pages ?? [];
  const unavailable = pages.find((page) => page.kind === "unavailable");
  const entries = pages.flatMap((page) =>
    page.kind === "page" ? page.entries : [],
  );
  const nativeIds = new Set(entries.map((entry) => entry.id));
  // Presentation identity is view state, separate from native persistence identity.
  // A newly confirmed native ID adopts its already mounted live row.
  const rowKeys = useMemo(
    () => ({
      records: new Map<string, string>(),
      live: new Map<string, string>(),
    }),
    [threadId],
  );
  for (const id of live.itemIds) {
    const item = live.itemsById.get(id);
    const liveKey = JSON.stringify([generation, id]);
    const key =
      rowKeys.live.get(liveKey) ??
      (item?.nativeRecordId
        ? rowKeys.records.get(item.nativeRecordId)
        : undefined) ??
      `live:${liveKey}`;
    rowKeys.live.set(liveKey, key);
    if (item?.nativeRecordId && !rowKeys.records.has(item.nativeRecordId))
      rowKeys.records.set(item.nativeRecordId, key);
  }
  for (const entry of entries)
    if (!rowKeys.records.has(entry.id)) rowKeys.records.set(entry.id, entry.id);
  const liveByNativeId = new Map(
    live.itemIds.flatMap((id) => {
      const item = live.itemsById.get(id);
      return item?.nativeRecordId ? [[item.nativeRecordId, id] as const] : [];
    }),
  );
  const appended = live.itemIds.filter((id) => {
    const item = live.itemsById.get(id);
    return (
      item &&
      !item.restored &&
      (!item.nativeRecordId || !nativeIds.has(item.nativeRecordId))
    );
  });
  const rows = [
    ...entries.map((entry) => ({
      key: rowKeys.records.get(entry.id) ?? entry.id,
      entry,
      liveId: liveByNativeId.get(entry.id),
    })),
    ...appended.map((liveId) => ({
      key:
        rowKeys.live.get(JSON.stringify([generation, liveId])) ??
        `live:${liveId}`,
      entry: undefined,
      liveId,
    })),
  ];
  const incomplete = pages.some(
    (page) => page.kind === "page" && page.incompleteTail,
  );
  const omitted = pages.reduce(
    (count, page) => count + (page.kind === "page" ? page.omitted : 0),
    0,
  );
  return (
    <section
      className="conversation"
      data-reading-source={source}
      aria-label={t("ui.conversation.sectionLabel")}
      aria-busy={!rows.length && (initializing || saved.isFetching)}
    >
      <LoadingIndicator
        pending={!rows.length && (initializing || saved.isFetching)}
        identity={threadId}
        label={t("app.loading")}
        placement="center"
      />
      {saved.isError && (
        <p role="alert">
          {t("ui.history.readFailed")}{" "}
          <Button variant="ghost" onClick={() => void saved.refetch()}>
            {t("app.retry")}
          </Button>
        </p>
      )}
      {unavailable?.kind === "unavailable" &&
        unavailable.reason !== "unbound" && (
          <p role="status">
            {t("ui.history.unavailable", {
              reason: t(`ui.history.reason.${unavailable.reason}`),
            })}
          </p>
        )}
      {incomplete && <p role="status">{t("ui.history.incompleteTail")}</p>}
      {omitted > 0 && (
        <p className="muted">{t("ui.history.omitted", { count: omitted })}</p>
      )}
      {(incomplete ||
        saved.isError ||
        (unavailable && unavailable.reason !== "unbound")) && (
        <Button
          variant="ghost"
          disabled={saved.isFetching}
          onClick={() => void saved.refetch()}
        >
          {t("config.refresh")}
        </Button>
      )}
      {rows.map((row) => (
        <TimelineRow
          key={row.key}
          rowId={row.key}
          entry={row.entry}
          liveId={row.liveId}
          model={model}
          positions={positions}
          source={source}
          bridge={bridge}
          threadId={threadId}
        />
      ))}
      {!saved.isFetching &&
        !initializing &&
        !saved.isError &&
        !entries.length &&
        !appended.length &&
        !hasNextPage &&
        (!unavailable || unavailable.reason === "unbound") && (
          <p className="muted">{t("ui.conversation.empty")}</p>
        )}
      {gap && <p role="status">{t("ui.conversation.gap")}</p>}
      {onOpenHistory && live.view?.gap && (
        <Button variant="ghost" onClick={onOpenHistory}>
          {t("ui.conversation.openHistory")}
        </Button>
      )}
      <div ref={sentinel} />
    </section>
  );
}
function TimelineRow({
  rowId,
  entry,
  liveId,
  model,
  positions,
  source,
  bridge,
  threadId,
}: {
  rowId: string;
  entry?: HistoryEntry | undefined;
  liveId?: number | undefined;
  model: ConversationModel;
  positions?: ReadingPositions | undefined;
  source: string;
  bridge: HistoryBridge;
  threadId: string;
}) {
  const { t } = useI18n();
  const live = useStore(model.stateStore, (state) =>
    liveId === undefined ? undefined : state.itemsById.get(liveId),
  );
  const item: ConversationItem | undefined = live
    ? entry
      ? {
          ...live,
          text: entry.text,
          timestamp: entry.timestamp ?? live.timestamp,
          thinking: entry.thinking ?? live.thinking,
          state: entry.state ?? live.state,
          detail: entry.detail ?? live.detail,
          truncated: false,
        }
      : live
    : entry
      ? {
          id: 0,
          role:
            entry.role === "user"
              ? "user"
              : entry.role === "assistant"
                ? "assistant"
                : "tool",
          state: entry.state ?? "complete",
          text: entry.text,
          timestamp: entry.timestamp,
          thinking: entry.thinking,
          detail: entry.detail,
          label: {
            kind: "literal",
            text:
              entry.toolEvidence?.toolName ??
              match(entry.role)
                .with("user", () => t("ui.history.role.user"))
                .with("assistant", () => t("ui.history.role.assistant"))
                .with("tool", "toolResult", () => t("ui.history.role.tool"))
                .otherwise(() => entry.role),
          },
        }
      : undefined;
  if (!item) return null;
  return (
    <ConversationItemView
      item={item}
      rowId={rowId}
      positions={positions}
      source={source}
      displayText={entry?.displayText}
      media={
        entry?.role === "user" && (
          <MessageMedia
            key={JSON.stringify([threadId, entry.id])}
            entry={entry}
            bridge={bridge}
            threadId={threadId}
          />
        )
      }
      evidence={
        entry?.toolEvidence && (
          <Disclosure>
            <DisclosureTrigger>
              {t("ui.history.nativeToolEvidence")}
            </DisclosureTrigger>
            <p>{t(historyToolEvidenceMessage(entry.toolEvidence))}</p>
            <p>
              {t("ui.history.toolCall", {
                toolName: entry.toolEvidence.toolName,
                toolCallId: entry.toolEvidence.toolCallId,
                recordId: entry.id,
              })}
            </p>
            <p>
              {t("ui.history.toolCoverage", {
                count: entry.toolEvidence.nonTextParts,
                source,
              })}
            </p>
          </Disclosure>
        )
      }
    />
  );
}
