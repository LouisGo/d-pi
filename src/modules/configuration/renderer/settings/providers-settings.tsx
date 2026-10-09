import { type ReactNode, useState } from "react";
import { useI18n } from "../../../preferences/renderer/public";
import {
  Button,
  Disclosure,
  DisclosureTrigger,
  ProviderBrandIcon,
  SearchIcon,
  Switch,
  TextInput,
} from "../../../ui/renderer/public";
import type {
  ConfigurationScope,
  ConfigurationSnapshot,
} from "../../contracts/public";
import { orderProviderCatalog } from "../../core/public";
import { providerDisplayName } from "../provider-presentation";
import { CustomModelForm } from "./custom-model-form";
import { ModelRoles } from "./model-roles";
import { ProviderAccounts } from "./provider-accounts";
import { type ModelPreferencesProps, ProviderModels } from "./provider-models";
import type { useAuthentication } from "./use-authentication";
import type { useConfigurationWrite } from "./use-configuration-write";

export function ProvidersSettings({
  snapshot,
  scope,
  disabled,
  authentication,
  write,
  modelPicker,
  onModelPreference,
  onRefresh,
  scopeControl,
}: ModelPreferencesProps & {
  snapshot: ConfigurationSnapshot;
  scope: ConfigurationScope;
  disabled: boolean;
  authentication: ReturnType<typeof useAuthentication>;
  write: ReturnType<typeof useConfigurationWrite>;
  onRefresh(): void;
  scopeControl?: ReactNode;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const providers = orderProviderCatalog(snapshot.providers ?? []);
  const selected =
    providers.find((provider) => provider.id === selectedId) ?? providers[0];
  const filtered = providers.filter((provider) =>
    `${provider.id} ${provider.name}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase().trim()),
  );
  return (
    <div className="providers-settings">
      <div className="providers-source">
        {scopeControl ?? (
          <strong>
            {t(
              scope.kind === "application"
                ? "providers.globalScope"
                : "providers.threadScope",
            )}
          </strong>
        )}
        <Disclosure>
          <DisclosureTrigger>{t("providers.source")}</DisclosureTrigger>
          <div className="providers-source-paths">
            <span data-selectable>{snapshot.source.directory}</span>
            <span data-selectable>{snapshot.source.cwd}</span>
            {snapshot.source.profile && (
              <span data-selectable>
                {t("providers.profile")}: {snapshot.source.profile}
              </span>
            )}
            <p className="providers-hint">{t("providers.sharedNotice")}</p>
          </div>
        </Disclosure>
        <Button variant="ghost" disabled={disabled} onClick={onRefresh}>
          {t("config.refresh")}
        </Button>
      </div>
      {snapshot.coverage !== "complete" && (
        <p className="providers-partial" role="status">
          {t("providers.partial")}
        </p>
      )}
      <div className="providers-workspace">
        <aside className="providers-rail" aria-label={t("providers.title")}>
          <div className="providers-search">
            <SearchIcon />
            <TextInput
              aria-label={t("providers.search")}
              placeholder={t("providers.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="providers-provider-list">
            {filtered.map((provider) => (
              <div
                key={provider.id}
                className="providers-provider-row"
                data-selected={selected?.id === provider.id || undefined}
              >
                <Button
                  variant="navigation"
                  className="providers-provider-button"
                  aria-label={provider.name}
                  aria-pressed={selected?.id === provider.id}
                  onClick={() => setSelectedId(provider.id)}
                >
                  <ProviderBrandIcon provider={provider.id} size={20} />
                  <span className="providers-provider-identity">
                    <strong title={provider.name}>
                      {providerDisplayName(provider.id, provider.name)}
                    </strong>
                    <span className="providers-hint">
                      {t(
                        provider.disabled
                          ? "providers.disabled"
                          : `providers.auth.${provider.authState}`,
                      )}
                      <span aria-hidden="true"> · </span>
                      {t("models.count", { count: provider.modelCount })}
                    </span>
                  </span>
                </Button>
                <Switch
                  aria-label={t("providers.enable", { name: provider.name })}
                  checked={!provider.disabled}
                  disabled={disabled || !snapshot.revision}
                  onCheckedChange={(enabled) => {
                    if (!snapshot.revision) return;
                    void write.request({
                      kind: "provider-enable",
                      providerId: provider.id,
                      enabled,
                      expectedRevision: snapshot.revision,
                      scope,
                      traceId: crypto.randomUUID(),
                    });
                  }}
                />
              </div>
            ))}
            {!filtered.length && (
              <p className="providers-empty">{t("providers.empty")}</p>
            )}
          </div>
        </aside>
        <div className="providers-detail" key={selected?.id ?? "empty"}>
          {selected ? (
            <>
              <header className="providers-detail-heading">
                <ProviderBrandIcon provider={selected.id} size={20} />
                <div>
                  <h3 title={selected.name}>
                    {providerDisplayName(selected.id, selected.name)}
                  </h3>
                  <p className="providers-hint" data-selectable>
                    {selected.id}
                  </p>
                </div>
              </header>
              <ProviderAccounts
                provider={selected}
                scope={scope}
                revision={snapshot.revision}
                disabled={disabled}
                authentication={authentication}
                write={write}
              />
              <ProviderModels
                provider={selected.id}
                snapshot={snapshot}
                scope={scope}
                disabled={disabled}
                write={write}
                modelPicker={modelPicker}
                onModelPreference={onModelPreference}
              />
            </>
          ) : (
            <div className="providers-empty">
              <p>{t("providers.empty")}</p>
              <Button
                variant="secondary"
                disabled={disabled || !snapshot.revision}
                onClick={() => setAdding(true)}
              >
                {t("models.addCustom")}
              </Button>
              {adding && (
                <CustomModelForm
                  provider=""
                  snapshot={snapshot}
                  scope={scope}
                  disabled={disabled}
                  write={write}
                  onClose={() => setAdding(false)}
                />
              )}
            </div>
          )}
        </div>
      </div>
      {!!snapshot.modelRoles?.length && (
        <ModelRoles
          snapshot={snapshot}
          scope={scope}
          disabled={disabled}
          write={write}
          order={modelPicker?.order}
        />
      )}
    </div>
  );
}
