import { match } from "ts-pattern";
import type { RuntimeView } from "../../../modules/execution/contracts/public";
import type { I18n } from "../../../shared/i18n/create-i18n";

export function runtimePhaseLabel(
  state: Pick<RuntimeView, "phase" | "busy" | "model">,
  t: I18n["t"],
) {
  return match(state.phase)
    .with("browse", () => t("ui.runtime.phase.browse"))
    .with("allowed", () => t("ui.runtime.phase.allowed"))
    .with("starting", () => t("ui.runtime.phase.starting"))
    .with("ready", () =>
      state.busy
        ? t("ui.runtime.phase.busy")
        : !state.model
          ? t("ui.runtime.phase.noModel")
          : t("ui.runtime.phase.ready"),
    )
    .with("interrupted", () => t("ui.runtime.phase.interrupted"))
    .with("failed", () => t("ui.runtime.phase.failed"))
    .exhaustive();
}
