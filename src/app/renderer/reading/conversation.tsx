import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import type { ConversationModel } from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Markdown } from "./markdown";
import { SubagentMessage } from "./subagents";

export function Conversation({
  model,
  onHistory,
}: {
  model: ConversationModel;
  onHistory?: () => void;
}) {
  const { t } = useI18n();
  const itemIds = useStore(model.stateStore, (state) => state.itemIds);
  const gap = useStore(model.stateStore, (state) => state.view?.gap ?? false);
  const exhausted = useStore(
    model.stateStore,
    (state) => state.resyncExhausted,
  );
  return (
    <section
      className="conversation"
      aria-label={t("ui.conversation.sectionLabel")}
    >
      <h2>{t("ui.conversation.heading")}</h2>
      {!itemIds.length && (
        <>
          <p className="muted">{t("ui.conversation.empty")}</p>
          {onHistory && (
            <Button variant="ghost" onClick={onHistory}>
              {t("ui.history.openCli")}
            </Button>
          )}
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
        <ConversationMessage key={id} id={id} model={model} />
      ))}
    </section>
  );
}

function ConversationMessage({
  id,
  model,
}: {
  id: number;
  model: ConversationModel;
}) {
  const { t, formatMessage } = useI18n();
  const item = useStore(model.stateStore, (state) => state.itemsById.get(id));
  if (!item) return null;
  if (item.subagent) return <SubagentMessage item={item} />;
  if (item.subagentNotice)
    return (
      <p role="status">
        {item.subagentNotice === "observation-limit"
          ? t("subagents.observationLimit")
          : t("subagents.observationUnavailable")}
      </p>
    );
  return (
    <article className="message" data-selectable>
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
          <pre>{item.text || t("ui.conversation.waitingResult")}</pre>
        </details>
      ) : (
        <Markdown text={item.text} streaming={item.state === "streaming"} />
      )}
      {item.truncated && (
        <p role="status">{formatMessage({ code: "conversation.truncated" })}</p>
      )}
    </article>
  );
}
