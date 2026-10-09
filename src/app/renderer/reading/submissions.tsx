import { useStore } from "zustand";
import type { SubmissionModel } from "../../../modules/execution/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Button,
  Disclosure,
  DisclosureTrigger,
} from "../../../modules/ui/renderer/public";
import { submissionRejectionKey } from "../components/receipt-status";
import { CopyButton } from "../components/ui/copy-button";

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
      <Disclosure>
        <DisclosureTrigger>
          {t("ui.submissions.summary", { count: receiptIds.length })}
        </DisclosureTrigger>
        <p className="muted">{t("ui.submissions.warning")}</p>
        <Button variant="ghost" onClick={() => void model.refresh()}>
          {t("ui.submissions.checkStatus")}
        </Button>
        {receiptIds.map((id) => (
          <SubmissionRecord key={id} id={id} model={model} />
        ))}
      </Disclosure>
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
    <article
      className="message"
      data-selectable
      data-attention-receipt-trace={receipt.traceId}
      tabIndex={-1}
    >
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
      {receipt.content && (
        <Disclosure>
          <DisclosureTrigger>
            {t("ui.submissions.frozenContent")}
          </DisclosureTrigger>
          <pre>{receipt.content.message}</pre>
          {receipt.content.sources.map((source, index) => (
            <p key={`${source.attachmentId}:${index}`}>
              {source.name}
              {source.path ? ` · ${source.path}` : ""}
            </p>
          ))}
          {!!receipt.content.images.length && (
            <p>{t("queue.images", { count: receipt.content.images.length })}</p>
          )}
          <CopyButton
            label={t("ui.submissions.copyContent")}
            text={receipt.content.message}
          />
        </Disclosure>
      )}
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
        <Disclosure>
          <DisclosureTrigger>
            {t("ui.submissions.resendTitle")}
          </DisclosureTrigger>
          <p role="alert">{t("ui.submissions.resendWarning")}</p>
          <Button
            disabled={sending}
            onClick={() => void model.resend(receipt.submissionId)}
          >
            {t("ui.submissions.resendConfirm")}
          </Button>
        </Disclosure>
      )}
      <CopyButton
        label={t("ui.submissions.copyOriginal")}
        text={receipt.text}
      />
    </article>
  );
}
