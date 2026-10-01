import { useI18n } from "../../../modules/preferences/renderer/public";
import type { AppModel } from "../wiring/model";
import { ChooseProjectButton } from "./choose-project-button";

export function EmptyWorkbench({ model }: { model: AppModel }) {
  const { t } = useI18n();
  return (
    <div className="empty-state">
      <h1>{t("app.empty.title")}</h1>
      <p className="muted">{t("app.empty.description")}</p>
      <ChooseProjectButton model={model} />
      <p className="empty-note">{t("app.empty.note")}</p>
    </div>
  );
}
