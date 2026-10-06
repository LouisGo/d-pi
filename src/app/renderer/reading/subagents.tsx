import { match } from "ts-pattern";
import { Button } from "@/components/ui/button";
import type { ConversationItem } from "../../../modules/conversation/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { ReadingBody } from "./reading-body";
export function SubagentMessage({ item }: { item: ConversationItem }) {
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
      data-subagent-id={agent.nativeId}
      data-subagent-status={agent.status}
      data-subagent-parent={agent.parentToolCallId}
    >
      <div className="message-heading">
        <strong>
          {t("subagents.heading")} ·{" "}
          {item.label.kind === "literal" ? item.label.text : "OMP"}
        </strong>
        <span>{status}</span>
        <Button
          variant="ghost"
          disabled={!item.text}
          onClick={() => void navigator.clipboard.writeText(item.text)}
        >
          {t("subagents.copy")}
        </Button>
      </div>
      <p className="muted">
        {agent.nativeId}
        {agent.parentToolCallId ? ` · ${agent.parentToolCallId}` : ""}
      </p>
      {agent.description && <p>{agent.description}</p>}
      {agent.task && (
        <details>
          <summary>{t("subagents.task")}</summary>
          <pre>{agent.task}</pre>
        </details>
      )}
      {agent.model && (
        <p>
          {t("subagents.model")} · {agent.model}
        </p>
      )}
      {agent.currentTool && (
        <p>
          {t("subagents.currentTool")} · {agent.currentTool}
        </p>
      )}
      <details open={agent.status !== "running" && agent.status !== "pending"}>
        <summary>
          {agent.resultSource === "progress"
            ? t("subagents.progress")
            : t("subagents.result")}
        </summary>
        {item.text ? (
          <ReadingBody
            text={item.text}
            streaming={agent.status === "running"}
          />
        ) : (
          <p>{t("subagents.noResult")}</p>
        )}
      </details>
      {reason && <p role="status">{reason}</p>}
      {agent.unhandledEvent && (
        <p role="status">
          {t("subagents.unhandledEvent", { eventType: agent.unhandledEvent })}
        </p>
      )}
      <p className="muted">{t("subagents.coverage")}</p>
    </article>
  );
}
