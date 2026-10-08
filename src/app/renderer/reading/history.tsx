import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import type {
  HistoryBridge,
  HistoryCursor,
  HistoryEntry,
} from "../../../modules/conversation/contracts/public";
import {
  type BoundHistoryAttempt,
  boundHistoryPageQuery,
  projectHistoryCatalogQuery,
  projectHistoryPageQuery,
  ReadingPositions,
  readingSourceKey,
} from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Button,
  Disclosure,
  DisclosureTrigger,
  Select,
} from "../../../modules/ui/renderer/public";
import { ReadingBody } from "./reading-body";

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

interface HistoryProps {
  bridge: HistoryBridge;
  threadId: string;
  active: boolean;
  positions?: ReadingPositions;
  onReturnLive?: (() => void) | undefined;
}
export function History(props: HistoryProps) {
  return <HistoryContent key={props.threadId} {...props} />;
}
function HistoryContent({
  bridge,
  threadId,
  active,
  positions,
  onReturnLive,
}: HistoryProps) {
  const [localPositions] = useState(() => new ReadingPositions());
  useEffect(() => () => localPositions.dispose(), [localPositions]);
  const owner = positions ?? localPositions;
  const history = useStore(owner.stateStore, (state) => state.history);
  const { choice, cursor } = history;
  const [boundAttempt, setBoundAttempt] = useState<BoundHistoryAttempt | null>(
    () => (history.readBound ? { id: crypto.randomUUID(), cursor } : null),
  );
  const { t } = useI18n();
  const catalog = useQuery({
    ...projectHistoryCatalogQuery(bridge, threadId),
    enabled: active,
  });
  const selected =
    choice ??
    (catalog.data?.kind === "catalog"
      ? (catalog.data.sessions[0]?.key ?? "")
      : "");
  const nativePage = useQuery({
    ...projectHistoryPageQuery(bridge, threadId, selected || null, cursor),
    enabled: active && !!selected,
  });
  const boundPage = useQuery({
    ...boundHistoryPageQuery(bridge, threadId, boundAttempt),
    enabled: active && !selected && boundAttempt !== null,
  });
  useEffect(() => {
    if (choice === null && selected)
      owner.rememberHistory({ ...history, choice: selected });
  }, [choice, selected, history, owner]);
  const page = selected ? nativePage.data : boundPage.data;
  const busy = !selected && active && boundPage.isFetching;
  const discovering = active && catalog.isFetching;
  const awaitingCatalog = discovering && !catalog.data;
  const reading = busy || (active && nativePage.isFetching);
  function read(nextCursor: HistoryCursor | null) {
    owner.rememberHistory({
      ...history,
      choice: selected || "",
      cursor: nextCursor,
      readBound: !selected,
    });
    if (!selected)
      setBoundAttempt({ id: crypto.randomUUID(), cursor: nextCursor });
  }
  const source =
    page?.kind === "page"
      ? readingSourceKey({
          kind: "native",
          threadId,
          sessionKey: selected || "bound",
          source: page.source,
          pageOffset: cursor?.offset ?? 0,
        })
      : undefined;
  return (
    <section
      className="history"
      data-reading-source={source}
      aria-label={t("ui.history.sectionLabel")}
    >
      <h2>{t("ui.history.sectionLabel")}</h2>
      <p className="muted">{t("ui.history.readOnlyCoverage")}</p>
      {onReturnLive && (
        <Button variant="ghost" onClick={onReturnLive}>
          {t("ui.history.returnLive")}
        </Button>
      )}
      {discovering && <p role="status">{t("ui.history.discovering")}</p>}
      {reading && <p role="status">{t("ui.history.reading")}</p>}

      <div className="history-controls">
        <label>
          {t("ui.history.choose")}
          <Select
            value={selected}
            disabled={awaitingCatalog || busy}
            aria-label={t("ui.history.choose")}
            onValueChange={(value) => {
              owner.rememberHistory({
                choice: value,
                cursor: null,
                readBound: false,
              });
              setBoundAttempt(null);
            }}
            options={[
              {
                value: "",
                label: t(
                  awaitingCatalog
                    ? "ui.history.discovering"
                    : "ui.history.bound",
                ),
              },
              ...(catalog.data?.kind === "catalog"
                ? catalog.data.sessions.map((session) => ({
                    value: session.key,
                    label: `${session.title} · ${session.sessionId.slice(0, 8)}`,
                  }))
                : []),
            ]}
          />
        </label>
        <Button
          variant="ghost"
          title={t("ui.history.refreshStart")}
          disabled={catalog.isFetching || nativePage.isFetching || busy}
          onClick={() => {
            void catalog.refetch();
            if (cursor) read(null);
            else if (selected) void nativePage.refetch();
            else if (history.readBound) read(null);
          }}
        >
          {t("config.refresh")}
        </Button>
      </div>
      <p className="muted">{t("ui.history.refreshStart")}</p>
      {catalog.data?.kind === "catalog" && catalog.data.partial && (
        <p role="status">{t("ui.history.catalogPartial")}</p>
      )}
      {(catalog.isError || nativePage.isError || boundPage.isError) && (
        <p role="alert">{t("ui.history.readFailed")}</p>
      )}
      {catalog.data?.kind === "unavailable" && (
        <p role="status">
          {t("ui.history.catalogUnavailableReason", {
            reason: match(catalog.data.reason)
              .with("missing", () => t("ui.history.reason.missing"))
              .with("denied", () => t("ui.history.reason.denied"))
              .with("invalid", () => t("ui.history.reason.invalid"))
              .exhaustive(),
          })}
        </p>
      )}
      <div className="history-source">
        <Disclosure>
          <DisclosureTrigger>{t("ui.history.sourceDetails")}</DisclosureTrigger>
          <p className="muted">{t("ui.history.projectDescription")}</p>
          <p className="muted">{t("ui.history.description")}</p>
        </Disclosure>
      </div>
      {!selected && (
        <>
          {!boundAttempt && <p className="muted">{t("ui.history.notRead")}</p>}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void read(null)}
          >
            {t("ui.history.read")}
          </Button>
        </>
      )}
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
            <article
              className="message"
              data-selectable
              data-reading-row={entry.id}
              key={JSON.stringify([threadId, selected, page.source, entry.id])}
            >
              <div className="message-heading">
                <strong>
                  {match(entry.role)
                    .with("user", () => t("ui.history.role.user"))
                    .with("assistant", () => t("ui.history.role.assistant"))
                    .with("tool", "toolResult", () => t("ui.history.role.tool"))
                    .otherwise(() => entry.role)}
                </strong>
                <Button
                  variant="ghost"
                  onClick={() => void navigator.clipboard.writeText(entry.text)}
                >
                  {t("ui.conversation.copy")}
                </Button>
              </div>
              <div className="history-record file-meta">
                <Disclosure>
                  <DisclosureTrigger>
                    {t(
                      entry.toolEvidence
                        ? "ui.history.nativeToolEvidence"
                        : "ui.history.recordDetails",
                    )}
                  </DisclosureTrigger>
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
                </Disclosure>
              </div>
              <ReadingBody
                text={entry.text}
                position={
                  positions && source
                    ? { positions, key: JSON.stringify([source, entry.id]) }
                    : undefined
                }
              />
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
          {!page.entries.length && !page.next && <p>{t("ui.history.empty")}</p>}
        </>
      )}
    </section>
  );
}
