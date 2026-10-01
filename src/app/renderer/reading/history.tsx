import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { match } from "ts-pattern";
import { Button } from "@/components/ui/button";
import type {
  HistoryBridge,
  HistoryCursor,
  HistoryEntry,
  HistoryPage,
} from "../../../modules/conversation/contracts/public";
import {
  projectHistoryCatalogQuery,
  projectHistoryPageQuery,
} from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Markdown } from "./markdown";

type HistoryToolEvidenceMessage =
  | "ui.history.toolFailed"
  | "ui.history.toolReportedWrite"
  | "ui.history.toolSuccessNoWrite"
  | "ui.history.toolUnknown";

export function historyToolEvidenceMessage(
  evidence: NonNullable<HistoryEntry["toolEvidence"]>,
): HistoryToolEvidenceMessage {
  if (evidence.isError === true) return "ui.history.toolFailed";
  if (evidence.isError !== false) return "ui.history.toolUnknown";
  return match(evidence.effect)
    .with("mutation", () => "ui.history.toolReportedWrite" as const)
    .with("no-mutation", () => "ui.history.toolSuccessNoWrite" as const)
    .with("unknown", () => "ui.history.toolUnknown" as const)
    .exhaustive();
}

export function History({
  bridge,
  threadId,
  active,
}: {
  bridge: HistoryBridge;
  threadId: string;
  active: boolean;
}) {
  const { t } = useI18n();
  const catalog = useQuery({
    ...projectHistoryCatalogQuery(bridge, threadId),
    enabled: active,
  });
  const [choice, setChoice] = useState<string | null>(null);
  const [cursor, setCursor] = useState<HistoryCursor | null>(null);
  const selected =
    choice ??
    (catalog.data?.kind === "catalog"
      ? (catalog.data.sessions[0]?.key ?? "")
      : "");
  const nativePage = useQuery({
    ...projectHistoryPageQuery(bridge, threadId, selected || null, cursor),
    enabled: active && !!selected,
  });
  const [boundPage, setPage] = useState<HistoryPage | null>(null);
  const page = selected ? nativePage.data : boundPage;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function read(cursor: HistoryCursor | null) {
    if (selected) {
      setCursor(cursor);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      setPage(await bridge.read(threadId, cursor));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="history" aria-label={t("ui.history.sectionLabel")}>
      <details open>
        <summary>{t("ui.history.sectionLabel")}</summary>
        <p>{t("ui.history.projectDescription")}</p>
        <label>
          {t("ui.history.choose")}
          <select
            value={selected}
            onChange={(event) => {
              setChoice(event.target.value);
              setCursor(null);
            }}
          >
            <option value="">{t("ui.history.bound")}</option>
            {catalog.data?.kind === "catalog" &&
              catalog.data.sessions.map((session) => (
                <option key={session.key} value={session.key}>
                  {session.title} · {session.sessionId.slice(0, 8)}
                </option>
              ))}
          </select>
        </label>
        <Button
          variant="ghost"
          disabled={catalog.isFetching || nativePage.isFetching}
          onClick={() => {
            void catalog.refetch();
            if (cursor) setCursor(null);
            else if (selected) void nativePage.refetch();
          }}
        >
          {t("config.refresh")}
        </Button>
        {catalog.data?.kind === "catalog" && catalog.data.partial && (
          <p role="status">{t("ui.history.catalogPartial")}</p>
        )}
        {(catalog.isError || nativePage.isError) && (
          <p role="alert">{t("ui.history.readFailed")}</p>
        )}
        {catalog.data?.kind === "unavailable" && (
          <p role="status">{t("ui.history.catalogUnavailable")}</p>
        )}
        <p className="muted">{t("ui.history.description")}</p>
        {!selected && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void read(null)}
          >
            {t("ui.history.read")}
          </Button>
        )}
        {error && <p role="alert">{t("ui.history.readFailed")}</p>}
        {page?.kind === "unavailable" && (
          <p role="status">
            {t("ui.history.unavailable", {
              reason: match(page.reason)
                .with("missing", () => t("ui.history.reason.missing"))
                .with("denied", () => t("ui.history.reason.denied"))
                .with("changed", () => t("ui.history.reason.changed"))
                .with("unsupported", () => t("ui.history.reason.unsupported"))
                .with("invalid", () => t("ui.history.reason.invalid"))
                .with("cancelled", () => t("ui.history.reason.cancelled"))
                .exhaustive(),
            })}
          </p>
        )}
        {page?.kind === "page" && (
          <>
            {page.incompleteTail && <p>{t("ui.history.incompleteTail")}</p>}
            {page.omitted > 0 && (
              <p>{t("ui.history.omitted", { count: page.omitted })}</p>
            )}
            {page.entries.map((entry) => (
              <article className="message" key={entry.id}>
                <strong>
                  {match(entry.role)
                    .with("user", () => t("ui.history.role.user"))
                    .with("assistant", () => t("ui.history.role.assistant"))
                    .with("tool", "toolResult", () => t("ui.history.role.tool"))
                    .otherwise(() => entry.role)}
                </strong>
                <p className="trace">
                  {t("ui.history.parent", {
                    id: entry.id,
                    parentId: entry.parentId ?? t("ui.history.root"),
                  })}
                </p>
                {entry.toolEvidence && (
                  <div className="file-meta">
                    <strong>{t("ui.history.nativeToolEvidence")}</strong>
                    <p>
                      {t("ui.history.toolCall", {
                        toolName: entry.toolEvidence.toolName,
                        toolCallId: entry.toolEvidence.toolCallId,
                        recordId: entry.id,
                      })}
                    </p>
                    <p>{t(historyToolEvidenceMessage(entry.toolEvidence))}</p>
                    <p>
                      {t("ui.history.toolCoverage", {
                        count: entry.toolEvidence.nonTextParts,
                        source: page.source.slice(0, 16),
                      })}
                    </p>
                  </div>
                )}
                <Markdown text={entry.text} />
              </article>
            ))}
            {page.next && (
              <Button
                disabled={busy || nativePage.isFetching}
                onClick={() => void read(page.next)}
              >
                {t("ui.history.next")}
              </Button>
            )}
            {!page.entries.length && !page.next && (
              <p>{t("ui.history.empty")}</p>
            )}
          </>
        )}
      </details>
    </section>
  );
}
