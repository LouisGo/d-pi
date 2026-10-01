import { useI18n } from "../../../preferences/renderer/public";
import type { ConfigurationSnapshot } from "../../contracts/public";
export function SnapshotSummary({
  snapshot,
}: {
  snapshot: ConfigurationSnapshot | null | undefined;
}) {
  const { t } = useI18n();
  return (
    <>
      {" "}
      {snapshot && (
        <>
          <p className="trace">
            {t("config.source")}: {snapshot.source.directory}
            {snapshot.source.profile ? " · " + snapshot.source.profile : ""}
          </p>
          {snapshot.coverage !== "complete" && (
            <p role="status">{t("config.partial")}</p>
          )}
          <p>
            {t(
              snapshot.openaiAuthenticated === null
                ? "config.authUnknown"
                : snapshot.openaiAuthenticated
                  ? "config.openaiReady"
                  : "config.openaiMissing",
            )}{" "}
            ·{" "}
            {t(
              snapshot.deepseekAuthenticated === null
                ? "config.authUnknown"
                : snapshot.deepseekAuthenticated
                  ? "config.deepseekReady"
                  : "config.deepseekMissing",
            )}
          </p>
        </>
      )}
    </>
  );
}
