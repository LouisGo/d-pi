import type { SubmissionReceipt } from "../contracts/public";
import type { RuntimeView } from "../contracts/runtime";

// Busy execution accepts native follow-ups; unresolved interaction does not.
// Shared by Main admission and both Renderer submission entry points.
export function canSubmit(view: RuntimeView | null | undefined): boolean {
  return !!(
    view?.phase === "ready" &&
    view.trusted &&
    view.model &&
    !view.control?.paused &&
    !view.control?.stopping &&
    !view.interactions?.unsupported &&
    !view.interactions?.items.some(
      (item) => item.status === "pending" || item.status === "unknown",
    )
  );
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
