import { useState } from "react";
import { useI18n } from "../../../preferences/renderer/public";
import {
  Button,
  Disclosure,
  DisclosureTrigger,
  FormField,
  SettingRow,
  TextInput,
} from "../../../ui/renderer/public";
import type {
  ConfigurationScope,
  ProviderSummary,
} from "../../contracts/public";
import type { useAuthentication } from "./use-authentication";
import type { useConfigurationWrite } from "./use-configuration-write";

export function ProviderAccounts({
  provider,
  scope,
  revision,
  disabled,
  authentication,
  write,
}: {
  provider: ProviderSummary;
  scope: ConfigurationScope;
  revision: string | undefined;
  disabled: boolean;
  authentication: ReturnType<typeof useAuthentication>;
  write: ReturnType<typeof useConfigurationWrite>;
}) {
  const { t } = useI18n();
  const [disconnect, setDisconnect] = useState<{
    id: number;
    revision: string;
  } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const keyProbe = provider.loginMethods.find(
    (method) => method.kind === "api-key",
  )?.probe;
  return (
    <section className="providers-detail-section">
      <h4>{t("providers.accounts")}</h4>
      <div className="providers-login-methods">
        {provider.loginMethods.map((method) => (
          <div key={method.id} className="providers-login-method">
            <div>
              <p title={method.name}>
                {t(
                  method.id === "openai-codex"
                    ? "providers.login.chatgpt"
                    : method.id === "openai-codex-device"
                      ? "providers.login.chatgptDevice"
                      : `providers.login.${method.kind}`,
                )}
              </p>
              {provider.loginMethods.filter(
                (entry) => entry.kind === method.kind,
              ).length > 1 &&
                method.id !== "openai-codex" &&
                method.id !== "openai-codex-device" && (
                  <p className="providers-hint">{method.name}</p>
                )}
              {(method.probe === "chat-completions" ||
                method.probe === "anthropic-messages") && (
                <p className="providers-probe-notice">
                  {t("providers.validationRequest")}
                </p>
              )}
              {method.probe === "models-endpoint" && (
                <p className="providers-hint">{t("providers.modelsRequest")}</p>
              )}
            </div>
            <Button
              variant="secondary"
              aria-label={method.name}
              disabled={disabled || !method.available}
              onClick={() =>
                void authentication.request({
                  kind: "login",
                  providerId: method.id,
                  scope,
                  traceId: crypto.randomUUID(),
                })
              }
            >
              {t(
                provider.accounts.length
                  ? "providers.addAccount"
                  : "providers.connect",
              )}
            </Button>
          </div>
        ))}
        {!provider.loginMethods.length && (
          <p className="providers-hint">{t("providers.noConnectionMethod")}</p>
        )}
      </div>
      {provider.accounts.map((account) => (
        <div key={account.credentialId} className="providers-account-row">
          <div className="providers-account-identity" data-selectable>
            <strong>
              {account.email ||
                account.accountId ||
                t("providers.accountFallback", { id: account.credentialId })}
            </strong>
            <span className="providers-hint">
              {account.orgName ||
                t(
                  account.type === "api_key"
                    ? "providers.apiKey"
                    : "providers.login.oauth-code",
                )}
            </span>
            {(account.orgId || account.projectId || account.enterpriseUrl) && (
              <Disclosure>
                <DisclosureTrigger>
                  {t("providers.accountDetails")}
                </DisclosureTrigger>
                <p className="providers-hint">
                  {[account.orgId, account.projectId, account.enterpriseUrl]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </Disclosure>
            )}
          </div>
          {disconnect?.id === account.credentialId ? (
            <div className="providers-confirm-actions">
              <p className="providers-hint">
                {t("providers.disconnectNotice")}
              </p>
              <Button
                variant="destructive"
                disabled={disabled || !revision}
                onClick={async () => {
                  if (!revision) return;
                  const saved = await write.request({
                    kind: "logout",
                    providerId: provider.id,
                    credentialId: account.credentialId,
                    expectedRevision: disconnect.revision,
                    scope,
                    traceId: crypto.randomUUID(),
                  });
                  if (saved) setDisconnect(null);
                }}
              >
                {t("providers.confirmDisconnect")}
              </Button>
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => setDisconnect(null)}
              >
                {t("providers.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              disabled={disabled || !revision}
              onClick={() =>
                revision &&
                setDisconnect({ id: account.credentialId, revision })
              }
            >
              {t("providers.disconnect")}
            </Button>
          )}
        </div>
      ))}
      {provider.authSource &&
        ["env", "config", "runtime"].includes(provider.authSource.kind) && (
          <div className="providers-external-credential">
            <p>{t("providers.externalCredential")}</p>
            {provider.authSource.envVar && (
              <p data-selectable className="providers-hint">
                {provider.authSource.envVar}
              </p>
            )}
          </div>
        )}
      {provider.apiKeyEditable && (
        <form
          className="providers-key-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!apiKey.trim() || disabled) return;
            const accepted = await authentication.request({
              kind: "save-key",
              providerId: provider.id,
              scope,
              traceId: crypto.randomUUID(),
              key: apiKey,
            });
            if (accepted) setApiKey("");
          }}
        >
          <FormField
            label={t("providers.apiKey")}
            description={t(
              provider.keyValidation !== "native"
                ? "providers.unvalidatedKey"
                : keyProbe === "models-endpoint"
                  ? "providers.modelsRequest"
                  : "providers.validationRequest",
            )}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                disabled={disabled}
                onChange={(event) => setApiKey(event.target.value)}
              />
            )}
          </FormField>
          <Button
            variant="secondary"
            type="submit"
            disabled={disabled || !apiKey.trim()}
          >
            {t("config.saveKey")}
          </Button>
        </form>
      )}
      <SettingRow
        label={t("providers.refreshCatalog")}
        description={t("providers.refreshNotice")}
      >
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            void write.request({
              kind: "refresh-catalog",
              providerId: provider.id,
              scope,
              traceId: crypto.randomUUID(),
            })
          }
        >
          {t("config.refresh")}
        </Button>
      </SettingRow>
    </section>
  );
}
