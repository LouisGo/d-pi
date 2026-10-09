import { useStore } from "zustand";
import type { RuntimeModel } from "../../../modules/execution/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import { StopResponseIcon } from "../components/icons/reading";
import { Tooltip } from "../components/ui/tooltip";

export function ComposerStopAction({ model }: { model: RuntimeModel }) {
  const { t } = useI18n();
  const view = useStore(model.stateStore, (state) => state.view);
  if (!view?.busy && !view?.control?.stopping) return null;
  const stopping = view.control?.stopping === true;
  const label = t(stopping ? "ui.runtime.stopping" : "composer.stopResponse");
  return (
    <Tooltip content={label}>
      <Button
        variant="secondary"
        size="round"
        aria-label={label}
        disabled={stopping || view.phase !== "ready"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void model.control("stop")}
      >
        <StopResponseIcon />
      </Button>
    </Tooltip>
  );
}
