import { useQuery } from "@tanstack/react-query";
import { useContext, useState } from "react";
import { match } from "ts-pattern";
import type {
  Answer,
  AnswerHistoryBridge,
  AnswerHistoryEntry,
} from "../../../modules/execution/contracts/public";
import {
  AnswerHistoryReadError,
  answerHistoryPageQuery,
} from "../../../modules/execution/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  ActionGroup,
  Button,
  Disclosure,
  DisclosureTrigger,
  LoadingIndicator,
} from "../../../modules/ui/renderer/public";
import type { ThreadId } from "../../../shared/identity";
import { ConversationVisibilityContext } from "../shell/layout/conversation-visibility";
import { useDocumentVisible } from "./window-visibility";

function AnswerText({ answer }: { answer: Answer }) {
  const { t } = useI18n();
  return match(answer)
    .with({ kind: "value" }, ({ value }) => (
      <p data-selectable>{value || t("ui.interaction.empty")}</p>
    ))
    .with({ kind: "confirm" }, ({ confirmed }) => (
      <p>{t(confirmed ? "ui.interaction.confirm" : "ui.interaction.reject")}</p>
    ))
    .with({ kind: "cancel" }, () => <p>{t("ui.interaction.cancelled")}</p>)
    .with({ kind: "ask" }, ({ answers }) => (
      <dl>
        {answers.map((value) => (
          <div key={value.id}>
            <dt>{value.id}</dt>
            <dd data-selectable>
              {value.selectedOptions.join("、") ||
                t("ui.interaction.selectNone")}
              {value.customInput !== undefined && <p>{value.customInput}</p>}
            </dd>
          </div>
        ))}
      </dl>
    ))
    .exhaustive();
}
function entryIdentity(entry: AnswerHistoryEntry): string {
  return entry.kind === "answer"
    ? entry.operationId
    : JSON.stringify(entry.requestKey);
}
function HistoryEntry({
  entry,
  open,
  onToggle,
}: {
  entry: AnswerHistoryEntry;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const state = match(entry)
    .with({ kind: "request" }, ({ presence }) =>
      match(presence)
        .with("observed", () => t("ui.interaction.requestObserved"))
        .with("ended", () => t("ui.interaction.nativeCancelled"))
        .with("unknown", () => t("ui.interaction.requestUnknown"))
        .exhaustive(),
    )
    .with({ kind: "answer" }, ({ status }) =>
      match(status)
        .with("dispatching", () => t("ui.interaction.answerSubmitted"))
        .with("not-dispatched", () => t("ui.interaction.notDispatched"))
        .with("written", () => t("ui.interaction.answerWritten"))
        .with("unknown", () => t("ui.interaction.answerUnknown"))
        .exhaustive(),
    )
    .exhaustive();
  return (
    <article className="answer-history-entry">
      <strong>{entry.dialog.title || t("ui.runtime.interactionsLabel")}</strong>
      <time dateTime={entry.updatedAt}>
        {new Date(entry.updatedAt).toLocaleString(locale)}
      </time>
      <p>{state}</p>
      {entry.kind === "answer" && (
        <p>
          {t(
            entry.origin === "user"
              ? "ui.interaction.userIntent"
              : "ui.interaction.appDefaultIntent",
          )}
        </p>
      )}
      <Disclosure
        open={open}
        onToggle={(event) => onToggle(event.currentTarget.open)}
      >
        <DisclosureTrigger>
          {t("ui.interaction.historyDetails")}
        </DisclosureTrigger>
        {open && (
          <div data-selectable>
            <p>{entry.dialog.message}</p>
            {entry.dialog.method === "ask" &&
              entry.dialog.questions.map((question) => (
                <section key={question.id}>
                  <strong>{question.question}</strong>
                  <ul>
                    {question.options.map((option) => (
                      <li key={option.label}>
                        {option.label}
                        {option.description && <p>{option.description}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            {entry.dialog.method === "select" && (
              <ul>
                {entry.dialog.options?.map((option, index) => (
                  <li key={`${index}-${option}`}>{option}</li>
                ))}
              </ul>
            )}
            {entry.kind === "answer" && <AnswerText answer={entry.answer} />}
            <p className="muted">
              {t("ui.interaction.nativeSource", {
                source: entry.requestKey.nativeSessionKey,
                request: entry.requestKey.requestId,
              })}
            </p>
            {entry.kind === "answer" && entry.answerObservedAt && (
              <time dateTime={entry.answerObservedAt}>
                {entry.answerObservedAt}
              </time>
            )}
          </div>
        )}
      </Disclosure>
    </article>
  );
}
function HistoryPage({
  bridge,
  threadId,
  cursor,
  setCursor,
  expanded,
  setExpanded,
}: {
  bridge: AnswerHistoryBridge;
  threadId: ThreadId;
  cursor: number | null;
  setCursor: (cursor: number | null) => void;
  expanded: ReadonlySet<string>;
  setExpanded: (id: string, open: boolean) => void;
}) {
  const { t } = useI18n();
  const query = useQuery(answerHistoryPageQuery(bridge, threadId, cursor));
  return (
    <div className="answer-history-page">
      <p className="muted">{t("ui.interaction.appObservedHistory")}</p>
      <ActionGroup>
        <Button
          variant="ghost"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {t("ui.interaction.refreshHistory")}
        </Button>
        {cursor !== null && (
          <Button
            variant="ghost"
            disabled={query.isFetching}
            onClick={() => setCursor(null)}
          >
            {t("ui.interaction.latestHistory")}
          </Button>
        )}
      </ActionGroup>
      <LoadingIndicator pending={query.isFetching} label={t("app.loading")} />
      {query.error && (
        <p role="alert">
          {t("ui.interaction.historyReadFailed")}
          {query.error instanceof AnswerHistoryReadError && (
            <code>{query.error.traceId}</code>
          )}
        </p>
      )}
      {query.data?.entries.map((entry) => (
        <HistoryEntry
          key={entryIdentity(entry)}
          entry={entry}
          open={expanded.has(entryIdentity(entry))}
          onToggle={(open) => setExpanded(entryIdentity(entry), open)}
        />
      ))}
      {query.data?.entries.length === 0 && (
        <p>{t("ui.interaction.historyEmpty")}</p>
      )}
      {query.data?.cursor !== null && query.data?.cursor !== undefined && (
        <Button
          variant="subtle"
          disabled={query.isFetching}
          onClick={() => setCursor(query.data!.cursor)}
        >
          {t("ui.interaction.olderHistory")}
        </Button>
      )}
    </div>
  );
}
function HistorySession({
  bridge,
  threadId,
}: {
  bridge: AnswerHistoryBridge;
  threadId: ThreadId;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const { visible } = useContext(ConversationVisibilityContext);
  const documentVisible = useDocumentVisible();
  return (
    <section className="answer-history">
      <Disclosure onToggle={(event) => setOpen(event.currentTarget.open)}>
        <DisclosureTrigger>
          {t("ui.runtime.interactionRecords")}
        </DisclosureTrigger>
        {open && visible && documentVisible && (
          <HistoryPage
            bridge={bridge}
            threadId={threadId}
            cursor={cursor}
            setCursor={(next) => {
              setCursor(next);
              setExpanded(new Set());
            }}
            expanded={expanded}
            setExpanded={(id, value) => {
              setExpanded((previous) => {
                const next = new Set(previous);
                if (value) next.add(id);
                else next.delete(id);
                return next;
              });
            }}
          />
        )}
      </Disclosure>
    </section>
  );
}

export function AnswerHistory(props: {
  bridge: AnswerHistoryBridge;
  threadId: ThreadId;
}) {
  return (
    <HistorySession
      key={props.threadId}
      bridge={props.bridge}
      threadId={props.threadId}
    />
  );
}
