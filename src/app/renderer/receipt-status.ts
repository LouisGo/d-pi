import { match } from "ts-pattern";
import type {
  SubmissionReceipt,
  SubmissionRejectionReason,
} from "../../modules/execution/contracts/public";
import type { MessageKey } from "../../shared/i18n/create-i18n";

/** Native refusal causes, in the order the Host checks them. */
const rejectionMessageKeys = {
  "not-ready": "ui.interaction.rejected.notReady",
  "native-unavailable": "ui.interaction.rejected.nativeUnavailable",
  "unsupported-native-command":
    "ui.interaction.rejected.unsupportedNativeCommand",
  paused: "ui.interaction.rejected.paused",
  "interaction-pending": "ui.interaction.rejected.interactionPending",
  "stale-target": "ui.interaction.rejected.staleTarget",
  "correlation-limit": "ui.interaction.rejected.correlationLimit",
} as const satisfies Record<SubmissionRejectionReason, MessageKey>;

/** A refusal with no reported cause keeps the generic copy: the App reports
 * the cause the Host proved and must not invent one. `outcome` is optional so
 * callers that only render a state label do not have to invent one. */
export type ReceiptStatus = Pick<SubmissionReceipt, "state"> &
  Partial<Pick<SubmissionReceipt, "outcome" | "rejectionReason">>;

export function receiptStatusKey(receipt: ReceiptStatus): MessageKey {
  return match(receipt)
    .with({ state: "rejected" }, (value) =>
      value.rejectionReason
        ? rejectionMessageKeys[value.rejectionReason]
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
    (receipt.state === "acknowledged" && receipt.outcome !== "unobserved")
  );
}
