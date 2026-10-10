import type { ReactNode } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import type { ConversationItem } from "../../../modules/conversation/contracts/public";
import {
  type ConversationModel,
  type ReadingPositions,
  readingSourceKey,
} from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Button,
  Disclosure,
  DisclosureTrigger,
  EmptyState,
} from "../../../modules/ui/renderer/public";
import {
  MessageActions,
  MessageStatus,
  ThinkingDisclosure,
  ToolResultFrame,
  UserMessageBubble,
} from "./message-parts";
import { ReadingBody } from "./reading-body";
import { ReadingWindow } from "./reading-window";
import { SubagentMessage } from "./subagents";
import { ToolObservationDetails } from "./tool-observation";

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
      <ReadingWindow
        key={source}
        source={source ?? ""}
        positions={positions}
        rows={itemIds.map((id) => {
          const item = model.stateStore.getState().itemsById.get(id);
          return {
            id: String(id),
            turn:
              item?.role === "user"
                ? item.text.replace(/\s+/g, " ").slice(0, 240)
                : undefined,
            preview: () => {
              const state = model.stateStore.getState();
              const start = state.itemIds.indexOf(id);
              let reply = "";
              for (
                let index = start + 1;
                index < state.itemIds.length;
                index++
              ) {
                const next = state.itemsById.get(state.itemIds[index] ?? -1);
                if (next?.role === "user") break;
                if (next?.role === "assistant" && next.text) {
                  reply = next.text;
                  break;
                }
              }
              return { question: state.itemsById.get(id)?.text ?? "", reply };
            },
            pinned:
              item?.state === "streaming"
                ? () =>
                    model.stateStore.getState().itemsById.get(id)?.state ===
                    "streaming"
                : undefined,
          };
        })}
        renderRow={(_row, index) => (
          <ConversationMessage
            id={itemIds[index] ?? -1}
            model={model}
            positions={positions}
            source={source}
          />
        )}
      />
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
  evidence,
  displayText,
  media,
}: {
  item: ConversationItem;
  rowId: string | number;
  positions?: ReadingPositions | undefined;
  source?: string | undefined;
  evidence?: ReactNode;
  displayText?: string | undefined;
  media?: ReactNode;
}) {
  const { t, formatMessage } = useI18n();
  const position =
    positions && source
      ? { positions, key: JSON.stringify([source, rowId]) }
      : undefined;
  if (item.subagent)
    return <SubagentMessage item={item} position={position} rowId={rowId} />;
  if (item.subagentNotice)
    return (
      <p role="status" data-reading-row={rowId}>
        {item.subagentNotice === "observation-limit"
          ? t("subagents.observationLimit")
          : t("subagents.observationUnavailable")}
      </p>
    );
  const title =
    item.label.kind === "literal"
      ? item.label.text
      : formatMessage(item.label.value);
  const status = match(item.state)
    .with("streaming", () =>
      item.role === "tool"
        ? t("ui.conversation.streaming")
        : t("ui.conversation.generating"),
    )
    .with("failed", () => t("ui.conversation.failed"))
    .with("aborted", () => t("ui.conversation.aborted"))
    .with("complete", () => "")
    .exhaustive();
  if (item.role === "tool")
    return (
      <article
        className="message message-tool"
        data-message-role="tool"
        data-selectable
        data-reading-row={rowId}
      >
        <ToolResultFrame
          label={title}
          status={{
            label: status,
            tone: item.state === "failed" ? "danger" : "neutral",
          }}
          evidence={evidence}
        >
          {item.detail && <p role="status">{item.detail}</p>}
          {item.tool && <ToolObservationDetails tool={item.tool} />}
          <ReadingBody
            text={item.text || t("ui.conversation.waitingResult")}
            raw
            position={position}
          />
          <MessageActions text={item.text} label={t("ui.conversation.copy")} />
          {item.truncated && (
            <p role="status">
              {formatMessage({ code: "conversation.truncated" })}
            </p>
          )}
        </ToolResultFrame>
      </article>
    );
  return (
    <article
      className="message"
      data-message-role={item.role}
      data-message-state={item.state}
      data-selectable
      data-reading-row={rowId}
      data-conversation-turn={item.role === "user" ? rowId : undefined}
      data-turn-preview={
        item.role === "user"
          ? (displayText ?? item.text).replace(/\s+/g, " ").slice(0, 240)
          : undefined
      }
      aria-label={
        item.role === "assistant"
          ? t("ui.history.role.assistant")
          : item.role === "user"
            ? t("ui.history.role.user")
            : undefined
      }
    >
      {item.thinking && (
        <ThinkingDisclosure
          text={item.thinking}
          label={t(
            item.state === "streaming" && !item.text
              ? "ui.conversation.thinkingActive"
              : "ui.conversation.thinking",
          )}
          streaming={item.state === "streaming"}
        />
      )}
      {(!item.thinking || item.text || item.state !== "streaming") && (
        <MessageStatus state={item.state} label={status} />
      )}
      {item.continuationOf !== undefined && (
        <p className="muted">{t("ui.conversation.continuation")}</p>
      )}
      {item.detail && (
        <Disclosure variant="inline">
          <DisclosureTrigger>{t("ui.conversation.details")}</DisclosureTrigger>
          <p>{item.detail}</p>
        </Disclosure>
      )}
      {item.role === "user" && media}
      {item.notice ? (
        <p>{formatMessage(item.notice)}</p>
      ) : item.role === "user" ? (
        (displayText ?? item.text) ? (
          <UserMessageBubble text={displayText ?? item.text} />
        ) : null
      ) : (
        <ReadingBody
          text={item.text}
          assistantReply={item.role === "assistant"}
          streaming={item.state === "streaming"}
          position={position}
        />
      )}
      {item.truncated && (
        <p role="status">{formatMessage({ code: "conversation.truncated" })}</p>
      )}
      <MessageActions
        text={displayText ?? item.text}
        label={t("ui.conversation.copy")}
        timestamp={item.timestamp}
      />
      {evidence}
    </article>
  );
}
