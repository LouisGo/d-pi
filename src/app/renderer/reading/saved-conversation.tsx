import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
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
} from "../../../modules/ui/renderer/public";
import { ConversationItemView } from "./conversation";
import { historyToolEvidenceMessage } from "./history";

/** One saved timeline survives execution startup and the bounded live window. */
export function SavedConversation({
  model,
  bridge,
  threadId,
  active,
  positions,
  onOpenHistory,
}: {
  model: ConversationModel;
  bridge: HistoryBridge;
  threadId: string;
  active: boolean;
  positions?: ReadingPositions | undefined;
  onOpenHistory?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  // Only membership/identity changes repaint the timeline; deltas belong to rows.
  useStore(
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
  const source = JSON.stringify(["conversation", threadId]);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetching, fetchNextPage } = saved;
  useEffect(() => {
    const node = sentinel.current;
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
  }, [active, hasNextPage, isFetching, fetchNextPage]);
  const pages = saved.data?.pages ?? [];
  const unavailable = pages.find((page) => page.kind === "unavailable");
  const entries = pages.flatMap((page) =>
    page.kind === "page" ? page.entries : [],
  );
  const nativeIds = new Set(entries.map((entry) => entry.id));
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
    >
      {saved.isFetching && <p role="status">{t("ui.history.reading")}</p>}
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
      {entries.map((entry) => (
        <SavedRow
          key={entry.id}
          entry={entry}
          liveId={liveByNativeId.get(entry.id)}
          model={model}
          positions={positions}
          source={source}
        />
      ))}
      {appended.map((id) => (
        <LiveRow
          key={`live:${id}`}
          id={id}
          model={model}
          positions={positions}
          source={source}
        />
      ))}
      {!saved.isFetching &&
        !saved.isError &&
        !entries.length &&
        !appended.length &&
        !hasNextPage &&
        (!unavailable || unavailable.reason === "unbound") && (
          <p className="muted">{t("ui.conversation.empty")}</p>
        )}
      {onOpenHistory && live.view?.gap && (
        <Button variant="ghost" onClick={onOpenHistory}>
          {t("ui.conversation.openHistory")}
        </Button>
      )}
      <div ref={sentinel} />
    </section>
  );
}
function LiveRow({
  id,
  model,
  positions,
  source,
}: {
  id: number;
  model: ConversationModel;
  positions?: ReadingPositions | undefined;
  source: string;
}) {
  const item = useStore(model.stateStore, (state) => state.itemsById.get(id));
  return item ? (
    <ConversationItemView
      item={item}
      rowId={`live:${id}`}
      positions={positions}
      source={source}
    />
  ) : null;
}
function SavedRow({
  entry,
  liveId,
  model,
  positions,
  source,
}: {
  entry: HistoryEntry;
  liveId?: number | undefined;
  model: ConversationModel;
  positions?: ReadingPositions | undefined;
  source: string;
}) {
  const { t } = useI18n();
  const live = useStore(model.stateStore, (state) =>
    liveId === undefined ? undefined : state.itemsById.get(liveId),
  );
  const item: ConversationItem = live ?? {
    id: 0,
    role:
      entry.role === "user"
        ? "user"
        : entry.role === "assistant"
          ? "assistant"
          : "tool",
    state: "complete",
    text: entry.text,
    label: {
      kind: "literal",
      text: match(entry.role)
        .with("user", () => t("ui.history.role.user"))
        .with("assistant", () => t("ui.history.role.assistant"))
        .with("tool", "toolResult", () => t("ui.history.role.tool"))
        .otherwise(() => entry.role),
    },
  };
  return (
    <>
      <ConversationItemView
        item={item}
        rowId={entry.id}
        positions={positions}
        source={source}
      />
      {entry.toolEvidence && (
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
      )}
    </>
  );
}
