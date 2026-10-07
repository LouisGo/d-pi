import { useStore } from "zustand";
import {
  type ConversationModel,
  type ReadingPositions,
  readingSourceKey,
} from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import { ReadingBody } from "./reading-body";
import { SubagentMessage } from "./subagents";

export function Conversation({
  model,
  positions,
}: {
  model: ConversationModel;
  positions?: ReadingPositions | undefined;
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
      {!itemIds.length && (
        <>
          <p className="muted">{t("ui.conversation.empty")}</p>
        </>
      )}
      {gap && <p role="status">{t("ui.conversation.gap")}</p>}
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
  const { t, formatMessage } = useI18n();
  const item = useStore(model.stateStore, (state) => state.itemsById.get(id));
  if (!item) return null;
  const position =
    positions && source
      ? { positions, key: JSON.stringify([source, id]) }
      : undefined;
  if (item.subagent) return <SubagentMessage item={item} position={position} />;
  if (item.subagentNotice)
    return (
      <p role="status" data-reading-row={id}>
        {item.subagentNotice === "observation-limit"
          ? t("subagents.observationLimit")
          : t("subagents.observationUnavailable")}
      </p>
    );
  return (
    <article className="message" data-selectable data-reading-row={id}>
      <div className="message-heading">
        <strong>
          {item.label.kind === "literal"
            ? item.label.text
            : formatMessage(item.label.value)}
        </strong>
        <span>
          {item.state === "streaming"
            ? t("ui.conversation.streaming")
            : item.state === "failed"
              ? t("ui.conversation.failed")
              : ""}
        </span>
        <Button
          variant="ghost"
          onClick={() => void navigator.clipboard.writeText(item.text)}
        >
          {t("ui.conversation.copy")}
        </Button>
      </div>
      {item.notice ? (
        <p>{formatMessage(item.notice)}</p>
      ) : item.role === "tool" ? (
        <details>
          <summary>{t("ui.conversation.toolOutput")}</summary>
          <ReadingBody
            text={item.text || t("ui.conversation.waitingResult")}
            raw
            position={position}
          />
        </details>
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
