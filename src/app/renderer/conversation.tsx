import { code } from "@streamdown/code";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { WebsiteIcon } from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import type {
  HistoryBridge,
  HistoryCursor,
  HistoryEntry,
  HistoryPage,
} from "../../modules/conversation/contracts/public";
import type { ConversationModel } from "../../modules/conversation/core/public";
import type { SubmissionModel } from "../../modules/execution/renderer/public";
import { useI18n } from "../../modules/preferences/renderer/public";
import { submissionRejectionKey } from "./receipt-status";
import { urlBrand } from "./url-display";

// Keep remote resources inert. Native text can be copied; only an explicit app action may open a URL.
function Markdown({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Streamdown
      plugins={{ code }}
      controls={false}
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      components={{
        img: ({ alt }) => (
          <span>
            {t("ui.conversation.image", {
              alt: alt ?? t("ui.conversation.imageNotLoaded"),
            })}
          </span>
        ),
        a: ({ children, href }) => (
          <span title={href}>
            <WebsiteIcon brand={urlBrand(href ?? "")} />
            {children} {href && <code>{href}</code>}
          </span>
        ),
      }}
    >
      {text}
    </Streamdown>
  );
}
export function Conversation({ model }: { model: ConversationModel }) {
  const { t } = useI18n();
  const itemIds = useStore(model.stateStore, (state) => state.itemIds);
  const gap = useStore(model.stateStore, (state) => state.view?.gap ?? false);
  return (
    <section
      className="conversation"
      aria-label={t("ui.conversation.sectionLabel")}
    >
      <h2>{t("ui.conversation.heading")}</h2>
      {!itemIds.length && <p className="muted">{t("ui.conversation.empty")}</p>}
      {gap && <p role="status">{t("ui.conversation.gap")}</p>}
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
  return (
    <article className="message">
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

export function Submissions({ model }: { model: SubmissionModel }) {
  const { t, formatMessage } = useI18n();
  const message = useStore(model.stateStore, (state) => state.message);
  const receiptIds = useStore(model.stateStore, (state) => state.receiptIds);
  return (
    <section
      className="submission-records"
      aria-label={t("ui.submissions.sectionLabel")}
    >
      {message && (
        <p role="alert" className="failure">
          {formatMessage(message)}
        </p>
      )}
      <details>
        <summary>
          {t("ui.submissions.summary", { count: receiptIds.length })}
        </summary>
        <p className="muted">{t("ui.submissions.warning")}</p>
        <Button variant="ghost" onClick={() => void model.refresh()}>
          {t("ui.submissions.checkStatus")}
        </Button>
        {receiptIds.map((id) => (
          <SubmissionRecord key={id} id={id} model={model} />
        ))}
      </details>
    </section>
  );
}

function SubmissionRecord({
  id,
  model,
}: {
  id: string;
  model: SubmissionModel;
}) {
  const { t } = useI18n();
  const receipt = useStore(model.stateStore, (state) =>
    state.receiptsById.get(id),
  );
  const sending = useStore(model.stateStore, (state) => state.sending);
  if (!receipt) return null;
  return (
    <article className="message">
      <p>
        {receipt.state === "rejected"
          ? t(submissionRejectionKey(receipt.rejectionReason))
          : receipt.state === "acknowledged"
            ? t("ui.submissions.acknowledged")
            : receipt.state === "prepared"
              ? t("ui.submissions.prepared")
              : receipt.state === "dispatching"
                ? t("ui.submissions.dispatching")
                : t("ui.submissions.unknown")}
        {receipt.outcome === "completed"
          ? t("ui.submissions.outcomeCompleted")
          : receipt.outcome === "aborted"
            ? t("ui.submissions.outcomeAborted")
            : receipt.outcome === "failed"
              ? t("ui.submissions.outcomeFailed")
              : receipt.outcome === "unknown"
                ? t("ui.submissions.outcomeUnknown")
                : ""}
      </p>
      <pre>{receipt.text}</pre>
      {receipt.retryOf && (
        <p className="trace">
          {t("ui.submissions.retryOf", { id: receipt.retryOf })}
        </p>
      )}
      {receipt.state === "prepared" && (
        <>
          <p className="muted">{t("ui.submissions.preparedWarning")}</p>
          <Button
            disabled={sending}
            onClick={() => void model.continuePrepared(receipt.submissionId)}
          >
            {t("ui.submissions.continue")}
          </Button>
        </>
      )}
      {(receipt.state === "unknown" ||
        receipt.outcome === "unknown" ||
        receipt.outcome === "failed" ||
        receipt.outcome === "aborted") && (
        <details>
          <summary>{t("ui.submissions.resendTitle")}</summary>
          <p role="alert">{t("ui.submissions.resendWarning")}</p>
          <Button
            disabled={sending}
            onClick={() => void model.resend(receipt.submissionId)}
          >
            {t("ui.submissions.resendConfirm")}
          </Button>
        </details>
      )}
      <Button
        variant="ghost"
        onClick={() => void navigator.clipboard.writeText(receipt.text)}
      >
        {t("ui.submissions.copyOriginal")}
      </Button>
    </article>
  );
}

type HistoryToolEvidenceMessage =
  | "ui.history.toolFailed"
  | "ui.history.toolReportedWrite"
  | "ui.history.toolSuccessNoWrite"
  | "ui.history.toolUnknown";

export function historyToolEvidenceMessage(
  evidence: NonNullable<HistoryEntry["toolEvidence"]>,
): HistoryToolEvidenceMessage {
  if (evidence.isError === true) return "ui.history.toolFailed";
  if (evidence.isError !== false) return "ui.history.toolUnknown";
  return match(evidence.effect)
    .with("mutation", () => "ui.history.toolReportedWrite" as const)
    .with("no-mutation", () => "ui.history.toolSuccessNoWrite" as const)
    .with("unknown", () => "ui.history.toolUnknown" as const)
    .exhaustive();
}

export function History({
  bridge,
  threadId,
}: {
  bridge: HistoryBridge;
  threadId: string;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function read(cursor: HistoryCursor | null) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      setPage(await bridge.read(threadId, cursor));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="history" aria-label={t("ui.history.sectionLabel")}>
      <details>
        <summary>{t("ui.history.sectionLabel")}</summary>
        <p className="muted">{t("ui.history.description")}</p>
        <Button variant="ghost" disabled={busy} onClick={() => void read(null)}>
          {t("ui.history.read")}
        </Button>
        {error && <p role="alert">{t("ui.history.readFailed")}</p>}
        {page?.kind === "unavailable" && (
          <p role="status">
            {t("ui.history.unavailable", {
              reason: match(page.reason)
                .with("missing", () => t("ui.history.reason.missing"))
                .with("denied", () => t("ui.history.reason.denied"))
                .with("changed", () => t("ui.history.reason.changed"))
                .with("unsupported", () => t("ui.history.reason.unsupported"))
                .with("invalid", () => t("ui.history.reason.invalid"))
                .with("cancelled", () => t("ui.history.reason.cancelled"))
                .exhaustive(),
            })}
          </p>
        )}
        {page?.kind === "page" && (
          <>
            {page.incompleteTail && <p>{t("ui.history.incompleteTail")}</p>}
            {page.omitted > 0 && (
              <p>{t("ui.history.omitted", { count: page.omitted })}</p>
            )}
            {page.entries.map((entry) => (
              <article className="message" key={entry.id}>
                <strong>
                  {match(entry.role)
                    .with("user", () => t("ui.history.role.user"))
                    .with("assistant", () => t("ui.history.role.assistant"))
                    .with("tool", "toolResult", () => t("ui.history.role.tool"))
                    .otherwise(() => entry.role)}
                </strong>
                <p className="trace">
                  {t("ui.history.parent", {
                    id: entry.id,
                    parentId: entry.parentId ?? t("ui.history.root"),
                  })}
                </p>
                {entry.toolEvidence && (
                  <div className="file-meta">
                    <strong>{t("ui.history.nativeToolEvidence")}</strong>
                    <p>
                      {t("ui.history.toolCall", {
                        toolName: entry.toolEvidence.toolName,
                        toolCallId: entry.toolEvidence.toolCallId,
                        recordId: entry.id,
                      })}
                    </p>
                    <p>{t(historyToolEvidenceMessage(entry.toolEvidence))}</p>
                    <p>
                      {t("ui.history.toolCoverage", {
                        count: entry.toolEvidence.nonTextParts,
                        source: page.source.slice(0, 16),
                      })}
                    </p>
                  </div>
                )}
                <Markdown text={entry.text} />
              </article>
            ))}
            {page.next && (
              <Button disabled={busy} onClick={() => void read(page.next)}>
                {t("ui.history.next")}
              </Button>
            )}
            {!page.entries.length && !page.next && (
              <p>{t("ui.history.empty")}</p>
            )}
          </>
        )}
      </details>
    </section>
  );
}
