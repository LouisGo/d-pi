import { useI18n } from "../../../modules/preferences/renderer/public";
import { EmptyState } from "../../../modules/ui/renderer/public";
import type { AppModel } from "../wiring/model";
import { ChooseProjectButton } from "./choose-project-button";

export function EmptyWorkbench({ model }: { model: AppModel }) {
  const { t } = useI18n();
  return (
    <EmptyState
      size="page"
      title={t("app.empty.title")}
      description={t("app.empty.description")}
      action={<ChooseProjectButton model={model} />}
      note={t("app.empty.note")}
    />
  );
}
