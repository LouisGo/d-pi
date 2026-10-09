import { match } from "ts-pattern";
import type { ConversationItem } from "../../../modules/conversation/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Disclosure,
  DisclosureTrigger,
} from "../../../modules/ui/renderer/public";
import { CopyButton } from "../components/ui/copy-button";
import { MessageHeader, ToolResultFrame } from "./message-parts";
import { ReadingBody, type ReadingBodyBinding } from "./reading-body";
export function SubagentMessage({
  item,
  position,
  rowId = item.id,
}: {
  item: ConversationItem;
  position?: ReadingBodyBinding | undefined;
  rowId?: string | number;
}) {
  const { t } = useI18n();
  const agent = item.subagent;
  if (!agent) return null;
  const status = match(agent.status)
    .with("pending", () => t("subagents.pending"))
    .with("running", () => t("subagents.running"))
    .with("completed", () => t("subagents.completed"))
    .with("failed", () => t("subagents.failed"))
    .with("aborted", () => t("subagents.aborted"))
    .with("unknown", () => t("subagents.unknown"))
    .exhaustive();
  const reason = agent.reason
    ? match(agent.reason)
        .with("transcript-unavailable", () =>
          t("subagents.transcriptUnavailable"),
        )
        .with("transcript-too-large", () => t("subagents.transcriptTooLarge"))
        .with("transcript-empty", () => t("subagents.transcriptEmpty"))
        .with("transcript-reset", () => t("subagents.transcriptReset"))
        .with("truncated", () => t("subagents.truncated"))
        .with("identity-ambiguous", () => t("subagents.identityAmbiguous"))
        .with("missing-lifecycle", () => t("subagents.missingLifecycle"))
        .with("observation-unavailable", () =>
          t("subagents.observationUnavailable"),
        )
        .exhaustive()
    : null;
  return (
    <article
      className="message"
      data-selectable
      data-reading-row={rowId}
      data-message-role="subagent"
      data-subagent-id={agent.nativeId}
      data-subagent-status={agent.status}
      data-subagent-parent={agent.parentToolCallId}
    >
      <MessageHeader
        title={agent.description || t("subagents.heading")}
        status={{
          label: status,
          tone: agent.status === "failed" ? "danger" : "neutral",
        }}
        actions={
          <CopyButton
            label={t("subagents.copy")}
            text={item.text}
            disabled={!item.text}
          />
        }
      />
      {agent.task && (
        <Disclosure>
          <DisclosureTrigger>{t("subagents.task")}</DisclosureTrigger>
          <pre>{agent.task}</pre>
        </Disclosure>
      )}
      {agent.currentTool && (
        <p>
          {t("subagents.currentTool")} · {agent.currentTool}
        </p>
      )}
      <ToolResultFrame
        open={agent.status !== "running" && agent.status !== "pending"}
        label={
          agent.resultSource === "progress"
            ? t("subagents.progress")
            : t("subagents.result")
        }
      >
        {item.text ? (
          <ReadingBody
            text={item.text}
            position={position}
            streaming={agent.status === "running"}
          />
        ) : (
          <p>{t("subagents.noResult")}</p>
        )}
      </ToolResultFrame>
      {reason && <p role="status">{reason}</p>}
      <Disclosure>
        <DisclosureTrigger>{t("ui.conversation.details")}</DisclosureTrigger>
        <p className="muted">
          {agent.nativeId}
          {agent.parentToolCallId ? ` · ${agent.parentToolCallId}` : ""}
        </p>
        {agent.model && (
          <p>
            {t("subagents.model")} · {agent.model}
          </p>
        )}
        {agent.unhandledEvent && (
          <p role="status">
            {t("subagents.unhandledEvent", { eventType: agent.unhandledEvent })}
          </p>
        )}
        <p className="muted">{t("subagents.coverage")}</p>
      </Disclosure>
    </article>
  );
}
