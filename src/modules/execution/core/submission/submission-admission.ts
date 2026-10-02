import { match } from "ts-pattern";
import type { SubmissionReceipt } from "../../contracts/public";
import type { RuntimeView } from "../../contracts/runtime";

export type SubmissionBlockReason =
  | "loading"
  | "browse"
  | "allowed"
  | "starting"
  | "interrupted"
  | "failed"
  | "untrusted"
  | "model-changing"
  | "no-model"
  | "paused"
  | "stopping"
  | "unsupported-interaction"
  | "interaction";

export function submissionBlockReason(
  view: RuntimeView | null | undefined,
): SubmissionBlockReason | null {
  if (!view) return "loading";
  return match(view.phase)
    .with(
      "browse",
      "allowed",
      "starting",
      "interrupted",
      "failed",
      (phase) => phase,
    )
    .with("ready", () => {
      if (!view.trusted) return "untrusted";
      if (view.modelChanging) return "model-changing";
      if (!view.model) return "no-model";
      if (view.control?.stopping) return "stopping";
      if (view.control?.paused) return "paused";
      if (view.interactions?.unsupported) return "unsupported-interaction";
      if (
        view.interactions?.items.some(
          (item) => item.status === "pending" || item.status === "unknown",
        )
      )
        return "interaction";
      return null;
    })
    .exhaustive();
}

// Busy execution accepts native follow-ups; unresolved interaction does not.
// Shared by Main admission and both Renderer submission entry points.
export function canSubmit(view: RuntimeView | null | undefined): boolean {
  return submissionBlockReason(view) === null;
}

// Queue cap (2026-09-28 user decision): at most QUEUE_CAP pending entries.
// Counts prepared/dispatching receipts plus the native queue preview length;
// acknowledged/unknown/rejected receipts are terminal or fate-unknown and do
// not occupy queue slots. The native preview can briefly mirror a dispatching
// receipt, so the count is conservative by at most that overlap.
export const QUEUE_CAP = 20;
export function queueCount(
  receipts: SubmissionReceipt[],
  queueLength: number,
): number {
  return (
    receipts.filter(
      (receipt) =>
        receipt.state === "prepared" || receipt.state === "dispatching",
    ).length + Math.max(0, queueLength)
  );
}
export function queueCapped(
  receipts: SubmissionReceipt[],
  queueLength: number,
): boolean {
  return queueCount(receipts, queueLength) >= QUEUE_CAP;
}
