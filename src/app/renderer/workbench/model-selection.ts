import type { RuntimeView } from "../../../modules/execution/contracts/public";

export function modelSelectionMode(view: RuntimeView | null | undefined) {
  if (!view || view.busy || view.modelChanging || view.phase === "starting")
    return "blocked";
  return view.modelSelection ?? (view.phase === "ready" ? "live" : "blocked");
}

export function displayedModel(view: RuntimeView | null | undefined) {
  if (modelSelectionMode(view) === "next-start" && view?.selectedModel)
    return `${view.selectedModel.provider}/${view.selectedModel.modelId}`;
  return (
    view?.model ??
    (view?.selectedModel
      ? `${view.selectedModel.provider}/${view.selectedModel.modelId}`
      : null)
  );
}
