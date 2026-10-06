import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "../../../preferences/renderer/public";
import type {
  ConfigurationBridge,
  ConfigurationScope,
} from "../../contracts/public";
import { configurationSnapshotQuery } from "../queries";
import { AuthenticationProgress } from "./authentication-progress";
import { SnapshotSummary } from "./snapshot-summary";
import { useAuthentication } from "./use-authentication";
export function ConfigurationSettings({
  bridge,
  scope,
}: {
  bridge: ConfigurationBridge;
  scope: ConfigurationScope;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const authentication = useAuthentication(bridge);
  const { key, setKey, busy, savingKey, result, request, active } =
    authentication;
  const query = useQuery({
    ...configurationSnapshotQuery(bridge, scope),
    enabled: open,
  });
  return (
    <details
      className="configuration-settings"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{t("config.heading")}</summary>
      {open && (
        <div className="configuration-content">
          <p className="muted">{t("config.description")}</p>
          {query.isFetching && <p role="status">{t("config.loading")}</p>}
          {query.isError && (
            <p className="failure" role="alert">
              {t("config.failed")}
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="ui-button ui-button-primary"
              type="button"
              disabled={busy || active}
              onClick={() =>
                void request({
                  kind: "login",
                  scope,
                  traceId: crypto.randomUUID(),
                })
              }
            >
              {t("config.openaiLogin")}
            </button>
            <button
              className="ui-button ui-button-ghost"
              type="button"
              disabled={busy}
              onClick={() => void query.refetch()}
            >
              {t("config.refresh")}
            </button>
          </div>
          <form
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
            <label>
              {t("config.deepseekKey")}
              <input
                type="password"
                autoComplete="off"
                value={key}
                disabled={busy || active}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <button
              className="ui-button ui-button-primary"
              type="submit"
              disabled={!key.trim() || busy || active}
            >
              {t("config.saveKey")}
            </button>
          </form>
          <p className="muted">{t("config.keyNotice")}</p>
          <SnapshotSummary snapshot={query.data} />
        </div>
      )}
      {open && (
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
          <AuthenticationProgress
            bridge={bridge}
            authentication={authentication}
          />
        </div>
      )}
    </details>
  );
}
