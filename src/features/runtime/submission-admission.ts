import type { RuntimeView } from "./contracts";

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
