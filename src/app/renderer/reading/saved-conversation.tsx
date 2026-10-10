import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import type {
  ConversationItem,
  HistoryBridge,
  HistoryEntry,
} from "../../../modules/conversation/contracts/public";
import {
  type ConversationModel,
  type ReadingPositions,
  refreshSavedConversation,
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
import { ReadingWindow } from "./reading-window";

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
  const identities = useStore(model.stateStore, (state) => state.nativeIdentities);
  const client = useQueryClient();
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
  const refresh = useRef<AbortController | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
    const controller = new AbortController();
    refresh.current?.abort();
    refresh.current = controller;
    setRefreshing(true);
    const timer = setTimeout(() => {
      void refreshSavedConversation(client, bridge, threadId, controller.signal)
        .finally(() => {
          if (refresh.current === controller) setRefreshing(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (refresh.current === controller) setRefreshing(false);
    };
  }, [active, generation, identities, client, bridge, threadId]);
  const source = JSON.stringify(["conversation", threadId]);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, fetchNextPage } = saved;
  const isFetching = saved.isFetching || refreshing;
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
      <ReadingWindow
        key={source}
        source={source}
        positions={positions}
        rows={rows.map((row, index) => {
          const item = row.liveId === undefined ? undefined : live.itemsById.get(row.liveId);
          const role = row.entry?.role ?? item?.role;
          return {
            id: row.key,
            turn: role === "user" ? (row.entry?.displayText ?? row.entry?.text ?? item?.text ?? "").replace(/\s+/g, " ").slice(0, 240) : undefined,
            pinned: row.liveId !== undefined && item?.state === "streaming" ? () => model.stateStore.getState().itemsById.get(row.liveId ?? -1)?.state === "streaming" : undefined,
            preview: () => {
              const current = model.stateStore.getState();
              let reply = "";
              for (let next = index + 1; next < rows.length; next++) {
                const following = rows[next];
                const liveItem = following?.liveId === undefined ? undefined : current.itemsById.get(following.liveId);
                const nextRole = following?.entry?.role ?? liveItem?.role;
                if (nextRole === "user") break;
                if (nextRole === "assistant") { reply = following?.entry?.text ?? liveItem?.text ?? ""; if (reply) break; }
              }
              return { question: row.entry?.displayText ?? row.entry?.text ?? (row.liveId === undefined ? "" : current.itemsById.get(row.liveId)?.text ?? ""), reply };
            },
          };
        })}
        renderRow={(_metadata, index) => {
          const row = rows[index];
          return row ? (
            <TimelineRow
              rowId={row.key}
              entry={row.entry}
              liveId={row.liveId}
              model={model}
              positions={positions}
              source={source}
              bridge={bridge}
              threadId={threadId}
            />
          ) : null;
        }}
      />
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
