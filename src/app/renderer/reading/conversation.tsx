import { match } from "ts-pattern";
import { useStore } from "zustand";
import type { ConversationItem } from "../../../modules/conversation/contracts/public";
import {
  type ConversationModel,
  type ReadingPositions,
  readingSourceKey,
} from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, EmptyState } from "../../../modules/ui/renderer/public";
import { CopyButton } from "../components/ui/copy-button";
import { MessageHeader, ToolResultFrame } from "./message-parts";
import { ReadingBody } from "./reading-body";
import { SubagentMessage } from "./subagents";

export function Conversation({
  model,
  positions,
  onOpenHistory,
  initializing = false,
}: {
  model: ConversationModel;
  positions?: ReadingPositions | undefined;
  onOpenHistory?: (() => void) | undefined;
  initializing?: boolean;
}) {
  const { t } = useI18n();
  const itemIds = useStore(model.stateStore, (state) => state.itemIds);
  const threadId = useStore(model.stateStore, (state) => state.threadId);
  const generation = useStore(
    model.stateStore,
    (state) => state.view?.connectionGeneration,
  );
  const gap = useStore(model.stateStore, (state) => state.view?.gap ?? false);
  const truncated = useStore(
    model.stateStore,
    (state) => state.view?.items.some((item) => item.truncated) ?? false,
  );
  const exhausted = useStore(
    model.stateStore,
    (state) => state.resyncExhausted,
  );
  const source =
    threadId && generation
      ? readingSourceKey({ kind: "live", threadId, generation })
      : undefined;
  return (
    <section
      className="conversation"
      data-reading-source={source}
      aria-label={t("ui.conversation.sectionLabel")}
    >
      {!initializing && !itemIds.length && (
        <EmptyState title={t("ui.conversation.empty")} />
      )}
      {gap && <p role="status">{t("ui.conversation.gap")}</p>}
      {onOpenHistory && (
        <Button variant="ghost" onClick={onOpenHistory}>
          {t("ui.conversation.openHistory")}
        </Button>
      )}
      {exhausted && (
        <Button
          variant="ghost"
          onClick={() => {
            const threadId = model.stateStore.getState().threadId;
            if (threadId) model.connect(threadId);
          }}
        >
          {t("subagents.reconnect")}
        </Button>
      )}
      {itemIds.map((id) => (
        <ConversationMessage
          key={JSON.stringify([threadId, generation, id])}
          id={id}
          model={model}
          positions={positions}
          source={source}
        />
      ))}
    </section>
  );
}

function ConversationMessage({
  id,
  model,
  positions,
  source,
}: {
  id: number;
  model: ConversationModel;
  positions?: ReadingPositions | undefined;
  source?: string | undefined;
}) {
  const item = useStore(model.stateStore, (state) => state.itemsById.get(id));
  if (!item) return null;
  return (
    <ConversationItemView
      item={item}
      rowId={id}
      positions={positions}
      source={source}
    />
  );
}

export function ConversationItemView({
  item,
  rowId,
  positions,
  source,
}: {
  item: ConversationItem;
  rowId: string | number;
  positions?: ReadingPositions | undefined;
  source?: string | undefined;
}) {
  const { t, formatMessage } = useI18n();
  const position =
    positions && source
      ? { positions, key: JSON.stringify([source, rowId]) }
      : undefined;
  if (item.subagent) return <SubagentMessage item={item} position={position} />;
  if (item.subagentNotice)
    return (
      <p role="status" data-reading-row={rowId}>
        {item.subagentNotice === "observation-limit"
          ? t("subagents.observationLimit")
          : t("subagents.observationUnavailable")}
      </p>
    );
  return (
    <article className="message" data-selectable data-reading-row={rowId}>
      <MessageHeader
        title={
          item.label.kind === "literal"
            ? item.label.text
            : formatMessage(item.label.value)
        }
        status={{
          label: match(item.state)
            .with("streaming", () => t("ui.conversation.streaming"))
            .with("failed", () => t("ui.conversation.failed"))
            .with("aborted", () => t("ui.conversation.aborted"))
            .with("complete", () => "")
            .exhaustive(),
          tone: item.state === "failed" ? "danger" : "neutral",
        }}
        actions={
          <CopyButton label={t("ui.conversation.copy")} text={item.text} />
        }
      />
      {item.continuationOf !== undefined && (
        <p className="muted">{t("ui.conversation.continuation")}</p>
      )}
      {item.detail && <p role="status">{item.detail}</p>}
      {item.notice ? (
        <p>{formatMessage(item.notice)}</p>
      ) : item.role === "tool" ? (
        <ToolResultFrame label={t("ui.conversation.toolOutput")}>
          <ReadingBody
            text={item.text || t("ui.conversation.waitingResult")}
            raw
            position={position}
          />
        </ToolResultFrame>
      ) : (
        <ReadingBody
          text={item.text}
          streaming={item.state === "streaming"}
          position={position}
        />
      )}
      {item.truncated && (
        <p role="status">{formatMessage({ code: "conversation.truncated" })}</p>
      )}
    </article>
  );
}
