import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "../../../preferences/renderer/public";
import {
  Button,
  Disclosure,
  DisclosureTrigger,
  FormField,
  SettingRow,
  SettingsGroup,
  TextInput,
} from "../../../ui/renderer/public";
import type {
  ConfigurationBridge,
  ConfigurationScope,
} from "../../contracts/public";
import { configurationSnapshotQuery } from "../queries";
import { AuthenticationProgress } from "./authentication-progress";
import type { ModelPreferencesProps } from "./provider-models";
import { ProvidersSettings } from "./providers-settings";
import { SnapshotSummary } from "./snapshot-summary";
import { useAuthentication } from "./use-authentication";
import { useConfigurationWrite } from "./use-configuration-write";
export type ConfigurationSettingsProps = ModelPreferencesProps & {
  bridge: ConfigurationBridge;
  scope: ConfigurationScope;
  presentation?: "disclosure" | "page";
  active?: boolean;
};
export function ConfigurationSettings({
  bridge,
  scope,
  presentation = "disclosure",
  active = true,
  modelPicker,
  onModelPreference,
}: ConfigurationSettingsProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const authentication = useAuthentication(bridge);
  const write = useConfigurationWrite(bridge);
  const {
    key,
    setKey,
    busy,
    savingKey,
    result,
    request,
    active: authActive,
  } = authentication;
  const expanded = presentation === "page" || open;
  const query = useQuery({
    ...configurationSnapshotQuery(bridge, scope),
    enabled: expanded && active,
  });
  const feedback = expanded && (
    <div className="configuration-feedback">
      {savingKey && <p role="status">{t("config.savingKey")}</p>}
      {result && (
        <p
          role={result.kind === "failed" ? "alert" : "status"}
          className={result.kind === "failed" ? "failure" : "muted"}
        >
          {result.kind === "saved"
            ? t("config.saved")
            : t(`config.error.${result.code}`)}
          {result.kind === "failed" && (
            <span className="trace">
              {" "}
              {t("app.trace", { traceId: result.traceId })}
            </span>
          )}
        </p>
      )}
      {write.result && (
        <p
          role={write.result.kind === "failed" ? "alert" : "status"}
          className={write.result.kind === "failed" ? "failure" : "muted"}
        >
          {write.result.kind === "saved"
            ? t("config.saved")
            : t(`config.error.${write.result.code}`)}
          {write.result.kind === "failed" && (
            <span className="trace">
              {" "}
              {t("app.trace", { traceId: write.result.traceId })}
            </span>
          )}
        </p>
      )}
      <AuthenticationProgress authentication={authentication} />
    </div>
  );
  const content = expanded && (
    <div
      className={
        presentation === "page" ? "configuration-page" : "configuration-content"
      }
    >
      {presentation === "disclosure" && (
        <p className="muted">{t("config.description")}</p>
      )}
      {query.isFetching && (
        <p role="status" className="muted">
          {t("config.loading")}
        </p>
      )}
      {query.isError && (
        <p className="failure" role="alert">
          {t("config.failed")}
        </p>
      )}
      {query.data?.providers !== undefined ? (
        <ProvidersSettings
          key={`${JSON.stringify(scope)}:${query.data.source.directory}:${query.data.source.profile ?? ""}`}
          snapshot={query.data}
          scope={scope}
          disabled={
            !active ||
            busy ||
            authActive ||
            authentication.continuing ||
            write.busy ||
            query.isFetching
          }
          authentication={authentication}
          write={write}
          modelPicker={modelPicker}
          onModelPreference={onModelPreference}
          onRefresh={() => void query.refetch()}
        />
      ) : (
        (!query.isError || query.data) && (
          <>
            <SettingsGroup title={t("settings.accounts")}>
              <SettingRow
                label={t("settings.openaiAccount")}
                description={t("settings.openaiDescription")}
              >
                <Button
                  variant="secondary"
                  disabled={busy || authActive}
                  onClick={() =>
                    void request({
                      kind: "login",
                      scope,
                      traceId: crypto.randomUUID(),
                    })
                  }
                >
                  {t("config.openaiLogin")}
                </Button>
              </SettingRow>
              <SettingRow
                label={t("settings.deepseekAccount")}
                description={t("config.keyNotice")}
              >
                <form
                  className="settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void request({
                      kind: "save-key",
                      scope,
                      traceId: crypto.randomUUID(),
                      key,
                    });
                  }}
                >
                  <FormField label={t("config.deepseekKey")}>
                    {({ id, describedBy, invalid }) => (
                      <TextInput
                        id={id}
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={key}
                        disabled={busy || authActive}
                        onChange={(e) => setKey(e.target.value)}
                      />
                    )}
                  </FormField>
                  <Button
                    variant="secondary"
                    type="submit"
                    disabled={!key.trim() || busy || authActive}
                  >
                    {t("config.saveKey")}
                  </Button>
                </form>
              </SettingRow>
            </SettingsGroup>
            <SettingsGroup title={t("settings.nativeConfiguration")}>
              <SettingRow
                label={t("config.source")}
                description={t("settings.nativeDescription")}
              >
                <Button
                  variant="ghost"
                  disabled={busy || query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  {t("config.refresh")}
                </Button>
              </SettingRow>
              <div className="settings-summary">
                {query.isFetching && <p role="status">{t("config.loading")}</p>}
                {query.isError && (
                  <p className="failure" role="alert">
                    {t("config.failed")}
                  </p>
                )}
                <SnapshotSummary snapshot={query.data} />
              </div>
            </SettingsGroup>
          </>
        )
      )}
    </div>
  );
  return presentation === "page" ? (
    <div className="configuration-page">
      {content}
      {feedback}
    </div>
  ) : (
    <Disclosure
      className="configuration-settings"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <DisclosureTrigger>{t("config.heading")}</DisclosureTrigger>
      {content}
      {feedback}
    </Disclosure>
  );
}
