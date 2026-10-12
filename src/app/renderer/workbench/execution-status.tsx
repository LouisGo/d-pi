import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { ConversationItem } from "../../../modules/conversation/contracts/public";
import type {
  ConversationModel,
  ConversationState,
} from "../../../modules/conversation/core/public";
import type {
  RuntimeView,
  SubmissionReceipt,
} from "../../../modules/execution/contracts/public";
import type {
  RuntimeModel,
  SubmissionModel,
  SubmissionView,
} from "../../../modules/execution/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Button,
  Disclosure,
  DisclosureTrigger,
  LoadingIndicator,
} from "../../../modules/ui/renderer/public";
import { CopyButton } from "../components/ui/copy-button";

const noReading = createStore<
  Pick<ConversationState, "view" | "itemIds" | "itemsById">
>(() => ({ view: null, itemIds: [], itemsById: new Map() }));
const noSubmission = createStore<
  Pick<SubmissionView, "sending" | "sendingText" | "receipts" | "message">
>(() => ({ sending: false, sendingText: false, receipts: [], message: null }));

/** A read-only display of the owners' facts. No timers advance execution. */
export function executionStage(
  runtime: RuntimeView | null,
  receipt: SubmissionReceipt | undefined,
  sending: boolean,
  item: ConversationItem | undefined,
) {
  if (runtime?.phase === "starting") return "connecting";
  if (sending) return "sending";
  if (receipt?.state === "dispatching") return "dispatching";
  if (receipt?.state === "unknown" || receipt?.outcome === "unknown")
    return "unknown";
  if (runtime?.phase === "failed" || runtime?.phase === "interrupted")
    return "disconnected";
  if (runtime?.control?.stopping) return "stopping";
  if (
    runtime?.interactions?.items.some(
      (request) => request.status === "pending",
    ) ||
    runtime?.approvals?.items.some((approval) => approval.status === "pending")
  )
    return "answer";
  if (runtime?.control?.paused) return "paused";
  if (runtime?.busy) {
    if (item?.lifecycle?.kind === "retry" && item.lifecycle.phase === "started")
      return "retrying";
    if (item?.role === "tool" && item.state === "streaming") return "tool";
    if (item?.role === "assistant" && item.state === "streaming") {
      if (item.text) return "generating";
      if (item.thinking) return "thinking";
    }
    return "waiting";
  }
  if (receipt?.state === "rejected") return "rejected";
  if (receipt?.outcome === "failed") return "failed";
  if (receipt?.state === "prepared") return "prepared";
  if (receipt?.state === "acknowledged" && receipt.outcome === "unobserved")
    return "queued";
  return null;
}

export function ExecutionStatus({
  runtime,
  submission,
  reading,
  onReviewOperations,
}: {
  runtime: RuntimeModel;
  submission: SubmissionModel | null;
  reading: ConversationModel | null;
  onReviewOperations: (() => void) | undefined;
}) {
  const { t, formatMessage } = useI18n();
  const view = useStore(runtime.stateStore, (state) => state.view);
  const submissionStore = submission?.stateStore ?? noSubmission;
  const sending = useStore(
    submissionStore,
    (state) => state.sending || state.sendingText,
  );
  const receipt = useStore(submissionStore, (state) => state.receipts[0]);
  const message = useStore(submissionStore, (state) => state.message);
  const readingStore = reading?.stateStore ?? noReading;
  // Parallel tools update their original row, not the list tail. Select the
  // phase rather than a body so progress text does not repaint this strip.
  const stage = useStore(readingStore, (state) => {
    let item: ConversationItem | undefined;
    if (state.view?.connectionGeneration === view?.connectionGeneration) {
      const runningTool = state.itemIds.findLast((id) => {
        const value = state.itemsById.get(id);
        return value?.role === "tool" && value.state === "streaming";
      });
      item = state.itemsById.get(runningTool ?? state.itemIds.at(-1) ?? -1);
    }
    return executionStage(view, receipt, sending, item);
  });
  if (!stage && !message) return null;
  const danger =
    stage === "failed" ||
    stage === "rejected" ||
    stage === "unknown" ||
    stage === "disconnected" ||
    !!message;
  const pending =
    !danger && stage !== "prepared" && stage !== "paused" && stage !== "answer";
  // A preparation failure has no proven receipt identity. Runtime disconnects
  // retain their runtime trace instead of borrowing the latest submission's.
  const traceId = message
    ? undefined
    : stage === "disconnected"
      ? view?.traceId
      : receipt?.traceId;
  return (
    <section
      className="execution-status"
      data-execution-status={stage ?? "failed"}
      data-tone={danger ? "danger" : "neutral"}
      aria-label={t("ui.execution.section")}
    >
      <div className="execution-status-summary">
        <LoadingIndicator
          pending={pending}
          identity={stage ?? ""}
          label={t("ui.execution.section")}
        />
        <span role={danger ? "alert" : "status"}>
          {message
            ? formatMessage(message)
            : stage
              ? t(`ui.execution.${stage}`)
              : null}
        </span>
        {onReviewOperations &&
          (danger || stage === "prepared" || stage === "queued") && (
            <Button variant="ghost" onClick={onReviewOperations}>
              {t("ui.recovery.messages")}
            </Button>
          )}
      </div>
      {(stage === "waiting" || stage === "unknown") && (
        <p className="muted">
          {t(
            stage === "waiting"
              ? "ui.execution.waitingHint"
              : "ui.recovery.unknown",
          )}
        </p>
      )}
      {danger && traceId && (
        <Disclosure variant="inline">
          <DisclosureTrigger>{t("ui.conversation.details")}</DisclosureTrigger>
          {stage === "disconnected" && view && (
            <p>{formatMessage(view.message)}</p>
          )}
          {receipt?.promptResult?.status === "error" &&
            receipt.promptResult.error?.httpStatus && (
              <p>HTTP {receipt.promptResult.error.httpStatus}</p>
            )}
          <code>{traceId}</code>
          <CopyButton text={traceId} label={t("ui.execution.copyTrace")} />
        </Disclosure>
      )}
    </section>
  );
}
