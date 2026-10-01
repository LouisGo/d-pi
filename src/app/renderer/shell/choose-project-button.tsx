import { useStore } from "zustand";
import { FolderIcon } from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { AppModel } from "../wiring/model";

export function ChooseProjectButton({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const busy = useStore(
    model.stateStore,
    (state) =>
      state.kind === "ready" &&
      (state.busy || state.threadTransition === "unknown"),
  );
  return (
    <Button disabled={busy} onClick={() => void model.choose()}>
      <FolderIcon />
      {t("app.empty.choose")}
    </Button>
  );
}
