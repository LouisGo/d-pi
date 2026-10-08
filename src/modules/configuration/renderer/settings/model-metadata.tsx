import { useI18n } from "../../../preferences/renderer/public";
import type { ConfigurationSnapshot } from "../../contracts/public";

type Model = ConfigurationSnapshot["models"][number];

export function SettingsModelMetadata({ model }: { model: Model }) {
  const { t, locale } = useI18n();
  const number = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return (
    <div className="providers-model-metadata">
      {model.contextWindow != null && (
        <span>
          {t("models.context", { value: number.format(model.contextWindow) })}
        </span>
      )}
      {model.maxTokens != null && (
        <span>
          {t("models.output", { value: number.format(model.maxTokens) })}
        </span>
      )}
      {model.reasoning && <span>{t("models.reasoning")}</span>}
      {model.input.includes("image") && <span>{t("models.vision")}</span>}
      {model.cost && (
        <span title={t("models.price")}>
          ${model.cost.input} / ${model.cost.output}
        </span>
      )}
      {model.reason === "authentication-required" && (
        <span>{t("providers.auth.required")}</span>
      )}
      {model.reason === "disabled" && <span>{t("providers.disabled")}</span>}
      {model.reason === "configuration-unknown" && (
        <span>{t("providers.auth.unknown")}</span>
      )}
    </div>
  );
}
