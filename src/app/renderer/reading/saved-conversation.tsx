import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import type { HistoryBridge } from "../../../modules/conversation/contracts/public";
import {
  type ConversationModel,
  type ReadingPositions,
  savedConversationQuery,
} from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import { Conversation } from "./conversation";
import { ReadingBody } from "./reading-body";

/** Saved content is readable before execution. A native branch snapshot owns live reading. */
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
  const hasLive = useStore(
    model.stateStore,
    (state) => state.itemIds.length > 0,
  );
  const saved = useInfiniteQuery({
    ...savedConversationQuery(bridge, threadId),
    enabled: active && !hasLive,
  });
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetching, fetchNextPage } = saved;
  useEffect(() => {
    const node = sentinel.current;
    if (
      !active ||
      hasLive ||
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
  }, [active, hasLive, hasNextPage, isFetching, fetchNextPage]);
  if (hasLive)
    return (
      <Conversation
        model={model}
        positions={positions}
        onOpenHistory={onOpenHistory}
      />
    );
  const pages = saved.data?.pages ?? [];
  const unavailable = pages.find((page) => page.kind === "unavailable");
  const entries = pages.flatMap((page) =>
    page.kind === "page" ? page.entries : [],
  );
  const source =
    pages[0]?.kind === "page"
      ? JSON.stringify(["saved", threadId, pages[0].source])
      : undefined;
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
        unavailable.reason !== "missing" && (
          <p role="status">
            {t("ui.history.unavailable", {
              reason: t(`ui.history.reason.${unavailable.reason}`),
            })}
          </p>
        )}
      {pages.some((page) => page.kind === "page" && page.omitted > 0) && (
        <p className="muted">{t("ui.history.readOnlyCoverage")}</p>
      )}
      {entries.map((entry) => (
        <article
          className="message"
          data-selectable
          data-reading-row={entry.id}
          key={JSON.stringify([source, entry.id])}
        >
          <div className="message-heading">
            <strong>
              {match(entry.role)
                .with("user", () => t("ui.history.role.user"))
                .with("assistant", () => t("ui.history.role.assistant"))
                .with("tool", "toolResult", () => t("ui.history.role.tool"))
                .otherwise(() => entry.role)}
            </strong>
            <Button
              variant="ghost"
              onClick={() => void navigator.clipboard.writeText(entry.text)}
            >
              {t("ui.conversation.copy")}
            </Button>
          </div>
          <ReadingBody
            text={entry.text}
            position={
              positions && source
                ? { positions, key: JSON.stringify([source, entry.id]) }
                : undefined
            }
          />
        </article>
      ))}
      {!saved.isFetching &&
        !saved.isError &&
        !entries.length &&
        !hasNextPage &&
        (!unavailable || unavailable.reason === "missing") && (
          <p className="muted">{t("ui.conversation.empty")}</p>
        )}
      <div ref={sentinel} />
    </section>
  );
}
