import type { AttentionEntry } from "../../contracts/attention";
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
