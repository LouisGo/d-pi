import { useStore } from "zustand";
import { AddIcon, FolderIcon } from "@/components/icons/common";
import { IconButton } from "@/components/ui/icon-button";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import type { AppModel } from "../wiring/model";

export function ChooseProjectButton({
  model,
  iconOnly = false,
}: {
  model: AppModel;
  iconOnly?: boolean;
}) {
  const { t } = useI18n();
  const busy = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition === "unknown",
  );
  if (iconOnly)
    return (
      <IconButton
        data-choose-project
        variant="ghost"
        appearance="plain"
        label={t("app.empty.choose")}
        pending={busy}
        onClick={() => void model.choose()}
      >
        <AddIcon size={14} />
      </IconButton>
    );
  return (
    <Button
      data-choose-project
      disabled={busy}
      onClick={() => void model.choose()}
    >
      <FolderIcon />
      {t("app.empty.choose")}
    </Button>
  );
}
