import { match } from "ts-pattern";
import type {
  ConversationItem,
  LifecycleObservation,
  TurnOutcome,
} from "../../../modules/conversation/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Disclosure,
  DisclosureTrigger,
} from "../../../modules/ui/renderer/public";

export function LifecycleEventRow({
  observation,
  rowId,
  detail,
}: {
  observation: LifecycleObservation;
  rowId: string | number;
  detail?: string | undefined;
}) {
  const { t, locale } = useI18n();
  return (
    <article
      className="message"
      data-reading-row={rowId}
      data-lifecycle-event={observation.kind}
    >
      <p>
        {match(observation)
          .with({ kind: "model-change" }, () => t("activity.modelChanged"))
          .with({ kind: "retry" }, (retry) =>
            t(
              retry.phase === "started"
                ? "activity.retryStarted"
                : "activity.retryEnded",
              { attempt: retry.attempt },
            ),
          )
          .with({ kind: "compaction" }, (compaction) =>
            t(
              compaction.phase === "started"
                ? "activity.compactionStarted"
                : "activity.compactionEnded",
              { action: compaction.action },
            ),
          )
          .exhaustive()}
      </p>
      <small>
        {t("activity.observedTime")}{" "}
        <time dateTime={new Date(observation.observedAt).toISOString()}>
          {new Intl.DateTimeFormat(locale, { timeStyle: "medium" }).format(
            observation.observedAt,
          )}
        </time>
      </small>
      {observation.kind === "compaction" && (
        <>
          {observation.reason && <code>{observation.reason}</code>}
          {observation.aborted && (
            <p role="status">{t("activity.compactionAborted")}</p>
          )}
          {observation.skipped && (
            <p role="status">{t("activity.compactionSkipped")}</p>
          )}
          {observation.willRetry && (
            <p role="status">{t("activity.compactionRetry")}</p>
          )}
        </>
      )}
      {observation.kind === "retry" && (
        <>
          {observation.maxAttempts !== undefined && (
            <small>
              {t("activity.retryLimit", { count: observation.maxAttempts })}
            </small>
          )}
          {observation.delayMs !== undefined && (
            <small>
              {t("activity.retryDelay", { milliseconds: observation.delayMs })}
            </small>
          )}
          {observation.success === false && (
            <p role="status">{t("ui.conversation.failed")}</p>
          )}
        </>
      )}
      {detail && (
        <Disclosure variant="inline">
          <DisclosureTrigger>{t("ui.conversation.details")}</DisclosureTrigger>
          <p>{detail}</p>
        </Disclosure>
      )}
    </article>
  );
}

export function TurnOutcomeSummary({
  outcome,
  state,
}: {
  outcome: TurnOutcome;
  state: ConversationItem["state"];
}) {
  const { t } = useI18n();
  return (
    <footer data-native-turn-outcome={outcome.observationId}>
      <small>{t("activity.turnEnded", { count: outcome.toolResults })}</small>
      {outcome.stopReason && <code>{outcome.stopReason}</code>}
      {outcome.failedTools > 0 && (
        <p role="status">
          {t("activity.failed", { count: outcome.failedTools })}
        </p>
      )}
      {outcome.unknownTools > 0 && (
        <p role="status">
          {t("activity.unknownTools", { count: outcome.unknownTools })}
        </p>
      )}
      {state === "aborted" && (
        <p role="status">{t("activity.turnInterrupted")}</p>
      )}
    </footer>
  );
}
