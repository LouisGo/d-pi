import { match } from "ts-pattern";
import type {
  SubmissionReceipt,
  SubmissionRejectionReason,
} from "../../../modules/execution/contracts/public";
import type { MessageKey } from "../../../shared/i18n/create-i18n";

/** Native refusal causes, in the order the Host checks them. */
const rejectionMessageKeys = {
  "content-missing": {
    submission: "ui.submissions.rejected.contentMissing",
    followUp: "ui.interaction.rejected.contentMissing",
  },
  "content-corrupt": {
    submission: "ui.submissions.rejected.contentCorrupt",
    followUp: "ui.interaction.rejected.contentCorrupt",
  },
  "transport-too-large": {
    submission: "ui.submissions.rejected.transportTooLarge",
    followUp: "ui.interaction.rejected.transportTooLarge",
  },
  "image-unsupported": {
    submission: "submission.imageUnsupported",
    followUp: "submission.imageUnsupported",
  },
  "not-ready": {
    submission: "ui.submissions.rejected.notReady",
    followUp: "ui.interaction.rejected.notReady",
  },
  "native-unavailable": {
    submission: "ui.submissions.rejected.nativeUnavailable",
    followUp: "ui.interaction.rejected.nativeUnavailable",
  },
  "unsupported-native-command": {
    submission: "ui.submissions.rejected.unsupportedNativeCommand",
    followUp: "ui.interaction.rejected.unsupportedNativeCommand",
  },
  paused: {
    submission: "ui.submissions.rejected.paused",
    followUp: "ui.interaction.rejected.paused",
  },
  "interaction-pending": {
    submission: "ui.submissions.rejected.interactionPending",
    followUp: "ui.interaction.rejected.interactionPending",
  },
  "stale-target": {
    submission: "ui.submissions.rejected.staleTarget",
    followUp: "ui.interaction.rejected.staleTarget",
  },
  "correlation-limit": {
    submission: "ui.submissions.rejected.correlationLimit",
    followUp: "ui.interaction.rejected.correlationLimit",
  },
} as const satisfies Record<
  SubmissionRejectionReason,
  { submission: MessageKey; followUp: MessageKey }
>;

export function submissionRejectionKey(
  reason: SubmissionRejectionReason | undefined,
): MessageKey {
  return reason
    ? rejectionMessageKeys[reason].submission
    : "ui.submissions.rejected";
}

/** A refusal with no reported cause keeps the generic copy: the App reports
 * the cause the Host proved and must not invent one. `outcome` is optional so
 * callers that only render a state label do not have to invent one. */
export type ReceiptStatus = Pick<SubmissionReceipt, "state"> &
  Partial<Pick<SubmissionReceipt, "outcome" | "rejectionReason">>;

export function receiptStatusKey(receipt: ReceiptStatus): MessageKey {
  return match(receipt)
    .with({ state: "rejected" }, (value) =>
      value.rejectionReason
        ? rejectionMessageKeys[value.rejectionReason].followUp
        : "ui.interaction.followUpRejected",
    )
    .with(
      { state: "prepared" },
      () => "ui.interaction.followUpPrepared" as const,
    )
    .with(
      { state: "dispatching" },
      () => "ui.interaction.followUpDispatching" as const,
    )
    .with({ state: "unknown" }, () => "ui.interaction.followUpUnknown" as const)
    .with(
      { state: "acknowledged", outcome: "completed" },
      () => "ui.interaction.followUpCompleted" as const,
    )
    .with(
      { state: "acknowledged", outcome: "aborted" },
      () => "ui.interaction.followUpAborted" as const,
    )
    .with(
      { state: "acknowledged", outcome: "unobserved" },
      () => "ui.interaction.followUpAcknowledged" as const,
    )
    .with(
      { state: "acknowledged" },
      () => "ui.interaction.followUpUnknown" as const,
    )
    .exhaustive();
}

/** ACK confirms the call, never the task, so only an unobserved outcome may
 * read as acknowledged. */
export function receiptNeedsAttention(receipt: ReceiptStatus): boolean {
  return (
    receipt.state === "rejected" ||
    receipt.state === "unknown" ||
    (receipt.state === "acknowledged" &&
      receipt.outcome !== "unobserved" &&
      receipt.outcome !== "completed")
  );
}
