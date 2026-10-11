import { useStore } from "zustand";
import type { SubmissionReceipt } from "../../../modules/execution/contracts/public";
import type { RuntimeModel } from "../../../modules/execution/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { NativeInteraction } from "./native-interaction";

const noReceipts: ReadonlyMap<string, SubmissionReceipt> = new Map();
const noFollowUps: string[] = [];
/** A second presentation of the same controller, never a second form owner. */
export function DecisionDock({ model }: { model: RuntimeModel }) {
  const { t } = useI18n();
  const view = useStore(model.stateStore, (state) => state.view);
  const items =
    view?.interactions?.items.filter((item) => item.status === "pending") ?? [];
  if (!view || !items.length) return null;
  return (
    <section
      className="decision-dock"
      aria-label={t("ui.interaction.decisionDock")}
    >
      <div className="decision-dock-requests">
        {items.map((item) => (
          <NativeInteraction
            key={`${view.interactions?.connectionGeneration}-${item.id}`}
            item={item}
            model={model}
            surface="dock"
            trusted={view.trusted}
            available={view.phase !== "interrupted" && view.phase !== "failed"}
            onFollowUp={undefined}
            onContinueFollowUp={undefined}
            receiptsById={noReceipts}
            followUpIds={noFollowUps}
          />
        ))}
      </div>
    </section>
  );
}
