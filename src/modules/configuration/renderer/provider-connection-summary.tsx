import { match } from "ts-pattern";
import { useI18n } from "../../preferences/renderer/public";
import { ProviderBrandIcon } from "../../ui/renderer/public";
import type { ProviderSummary } from "../contracts/public";
import { providerDisplayName } from "./provider-presentation";

export function ProviderConnectionSummary({
  providerId,
  provider,
}: {
  providerId: string;
  provider: ProviderSummary | undefined;
}) {
  const { t } = useI18n();
  const name = providerDisplayName(providerId, provider?.name);
  const source = provider?.authSource;
  const label =
    !provider || provider.authState === "unknown"
      ? t("providers.connection.unknown", { name })
      : provider.disabled
        ? t("providers.connection.disabled", { name })
        : provider.authState === "required"
          ? t("providers.connection.required", { name })
          : provider.authState === "keyless"
            ? t("providers.connection.keyless", { name })
            : match(source?.kind)
                .with("oauth", () =>
                  t(
                    providerId === "openai-codex"
                      ? "providers.connection.chatgpt"
                      : "providers.connection.account",
                    { name },
                  ),
                )
                .with("api_key", () =>
                  t("providers.connection.apiKey", { name }),
                )
                .with("env", () =>
                  t("providers.connection.environment", { name }),
                )
                .with("config", () =>
                  t("providers.connection.configuration", { name }),
                )
                .with("runtime", () =>
                  t("providers.connection.runtime", { name }),
                )
                .with(undefined, () =>
                  t("providers.connection.unknown", { name }),
                )
                .exhaustive();
  // The snapshot describes the auth source and connected credentials, not the
  // account selected for an individual request. Never guess among accounts.
  const accounts =
    !provider?.disabled && provider?.authState === "configured"
      ? provider.accounts.filter((account) => account.type === source?.kind)
      : [];
  const account = accounts.length === 1 ? accounts[0] : undefined;
  const accountSummary = account
    ? [account.email || account.accountId, account.orgName]
        .filter(Boolean)
        .join(" · ")
    : accounts.length > 1
      ? t("providers.connection.accounts", { count: accounts.length })
      : source?.kind === "env"
        ? source.envVar
        : undefined;
  return (
    <div className="model-picker-connection">
      <ProviderBrandIcon provider={providerId} size={18} />
      <span>
        <span className="model-picker-connection-label" title={label}>
          {label}
        </span>
        {accountSummary && (
          <span
            className="model-picker-connection-account"
            title={accountSummary}
            data-selectable
          >
            {accountSummary}
          </span>
        )}
      </span>
    </div>
  );
}
