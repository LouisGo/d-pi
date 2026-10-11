import { interactionDraftIdentity } from "../../../modules/execution/contracts/public";
import type {
  ActivationOutcome,
  AttentionEntry,
} from "../../contracts/attention";

export function locateActivation(
  workspace: HTMLElement,
  entry: AttentionEntry,
): ActivationOutcome | null {
  if (
    workspace.dataset.activationThread &&
    workspace.dataset.activationThread !== entry.threadId
  )
    return null;
  if (!entry.sourceTarget)
    return locateAttention(workspace, entry) ? "located" : null;
  const source = entry.sourceTarget;
  let target: HTMLElement | null = null;
  if (source.kind === "request") {
    const key = source.requestKey;
    if (key.threadId !== entry.threadId) return null;
    const identity = interactionDraftIdentity(key.threadId, key, key.requestId);
    target =
      [
        ...workspace.querySelectorAll<HTMLElement>(
          '[data-interaction-request-key][data-editor-owner="true"]',
        ),
      ].find((node) => node.dataset.interactionRequestKey === identity) ?? null;
  } else if (source.kind === "receipt" || source.kind === "result") {
    target =
      [
        ...workspace.querySelectorAll<HTMLElement>(
          "[data-attention-receipt-trace]",
        ),
      ].find((node) => node.dataset.attentionReceiptTrace === source.traceId) ??
      null;
    if (target) {
      let ancestor = target.parentElement;
      while (ancestor && ancestor !== workspace) {
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
        ancestor = ancestor.parentElement;
      }
    }
  } else if (source.kind === "runtime")
    target =
      [...workspace.querySelectorAll<HTMLElement>("[data-runtime-trace]")].find(
        (node) => node.dataset.runtimeTrace === source.traceId,
      ) ?? null;
  const unavailable = target === null;
  if (!target && workspace.dataset.activationThread === entry.threadId)
    target = workspace;
  if (!target) return null;
  target.scrollIntoView({ block: "nearest" });
  target.focus({ preventScroll: true });
  return document.activeElement === target
    ? unavailable && source.kind !== "thread"
      ? "target-unavailable"
      : "located"
    : null;
}
/** Presentation only: expose a sampled result when it is actually present. */
export function locateAttention(
  workspace: HTMLElement,
  entry: AttentionEntry,
): boolean {
  const receipt =
    entry.kind === "failed"
      ? workspace.querySelector<HTMLElement>(
          `[data-attention-receipt-trace="${entry.traceId}"]`,
        )
      : null;
  const target =
    receipt ??
    workspace.querySelector<HTMLElement>(
      entry.kind === "needs-answer"
        ? "[data-attention-target=interaction]"
        : entry.kind === "failed" || entry.kind === "interrupted"
          ? "[data-attention-target=runtime]"
          : "[data-attention-target=result]",
    ) ??
    workspace.querySelector<HTMLElement>("[data-attention-target=runtime]");
  if (!target) return false;
  if (receipt) {
    let ancestor = receipt.parentElement;
    while (ancestor && ancestor !== workspace) {
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
  }
  target.scrollIntoView({ block: "nearest" });
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}
