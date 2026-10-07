import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { match } from "ts-pattern";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import {
  type DiagnosticBridge,
  type DiagnosticFilter,
  DiagnosticFilterSchema,
  DiagnosticOperationSchema,
  DiagnosticStageSchema,
} from "../../../shared/diagnostics";
import { createId } from "../../../shared/identity";
import styles from "./diagnostics.module.css";
import { diagnosticFeedbackMetadata } from "./diagnostics-feedback";
import { DiagnosticReadError, diagnosticQuery } from "./diagnostics-queries";

type Props = {
  bridge?: DiagnosticBridge | undefined;
  traceId?: string | undefined;
  contained?: boolean;
};
type CommandResult = { text: string; traceId?: string };
export function Diagnostics({
  bridge = globalThis.window?.desktop?.diagnostics,
  traceId,
  contained = false,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        data-diagnostics-trigger={traceId ? "trace" : "global"}
        disabled={!bridge}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {t(traceId ? "ui.diagnostics.traceEntry" : "ui.diagnostics.entry")}
      </Button>
      {!bridge && (
        <span className="muted">{t("ui.diagnostics.unavailable")}</span>
      )}
      {open &&
        bridge &&
        (contained ? (
          <DiagnosticPanel bridge={bridge} traceId={traceId} close={close} />
        ) : (
          createPortal(
            <DiagnosticPanel
              key={traceId ?? "global"}
              bridge={bridge}
              traceId={traceId}
              close={close}
            />,
            document.body,
          )
        ))}
    </>
  );
}

function initialFilter(traceId?: string): DiagnosticFilter {
  const now = Date.now();
  return {
    since: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    until: new Date(now).toISOString(),
    limit: 100,
    ...(traceId ? { traceId } : {}),
  };
}
function localTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
    .toISOString()
    .slice(0, 19);
}
function DiagnosticPanel({
  bridge,
  traceId,
  close,
}: Props & { bridge: DiagnosticBridge; close: () => void }) {
  const { t } = useI18n();
  const headingId = useId();
  const panel = useRef<HTMLElement>(null);
  const applyButton = useRef<HTMLButtonElement>(null);
  const restoreApplyFocus = useRef(false);
  const [filter, setFilter] = useState(() => initialFilter(traceId));
  const [invalid, setInvalid] = useState(false);
  const [command, setCommand] = useState<CommandResult | null>(null);
  const [pending, setPending] = useState<"export" | "copy" | null>(null);
  const busy = pending !== null;
  const active = useRef(true);
  const locked = useRef(false);
  const query = useQuery(diagnosticQuery(bridge, filter));
  const error = query.error instanceof DiagnosticReadError ? query.error : null;
  const metadata = diagnosticFeedbackMetadata(
    filter,
    query.data,
    command?.traceId ?? error?.traceId,
  );
  const feedback = t("ui.diagnostics.template", { metadata });
  useEffect(() => {
    active.current = true;
    panel.current?.focus();
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (filter && restoreApplyFocus.current) {
      applyButton.current?.focus();
      restoreApplyFocus.current = false;
    }
  }, [filter]);
  function apply(form: HTMLFormElement) {
    const values = new FormData(form);
    const since = String(values.get("since") ?? "");
    const until = String(values.get("until") ?? "");
    const start = new Date(since);
    const end = new Date(until);
    const raw = {
      since: Number.isFinite(start.getTime()) ? start.toISOString() : "",
      until: Number.isFinite(end.getTime()) ? end.toISOString() : "",
      limit: Number(values.get("limit")),
      ...Object.fromEntries(
        [
          "traceId",
          "threadId",
          "processInstanceId",
          "stage",
          "operation",
        ].flatMap((key) => {
          const value = String(values.get(key) ?? "").trim();
          return value ? [[key, value]] : [];
        }),
      ),
    };
    const parsed = DiagnosticFilterSchema.safeParse(raw);
    setInvalid(!parsed.success);
    if (parsed.success) {
      restoreApplyFocus.current = true;
      setFilter(parsed.data);
      setCommand(null);
    }
  }
  async function exportDiagnostics() {
    if (locked.current) return;
    locked.current = true;
    setPending("export");
    setCommand(null);
    const exportTrace = createId();
    try {
      const reply = await bridge.request({
        kind: "export",
        traceId: exportTrace,
        filter,
      });
      if (!active.current) return;
      setCommand(
        match(reply)
          .with({ kind: "exported" }, (r) => ({
            text: t("ui.diagnostics.exported", { fileName: r.fileName }),
            traceId: r.traceId,
          }))
          .with({ kind: "cancelled" }, (r) => ({
            text: t("ui.diagnostics.cancelled"),
            traceId: r.traceId,
          }))
          .with({ kind: "failed" }, (r) => ({
            text: t("ui.diagnostics.commandFailed", { reason: r.reason }),
            traceId: r.traceId,
          }))
          .with({ kind: "snapshot" }, (r) => ({
            text: t("ui.diagnostics.commandFailed", {
              reason: "invalid-reply",
            }),
            traceId: r.traceId,
          }))
          .exhaustive(),
      );
    } catch {
      if (active.current)
        setCommand({
          text: t("ui.diagnostics.commandFailed", {
            reason: "connection-failed",
          }),
          traceId: exportTrace,
        });
    } finally {
      locked.current = false;
      if (active.current) setPending(null);
    }
  }
  async function copyFeedback() {
    if (locked.current) return;
    locked.current = true;
    setPending("copy");
    try {
      await navigator.clipboard.writeText(feedback);
      if (active.current) setCommand({ text: t("ui.diagnostics.copied") });
    } catch {
      if (active.current) setCommand({ text: t("ui.diagnostics.copyFailed") });
    } finally {
      locked.current = false;
      if (active.current) setPending(null);
    }
  }
  return (
    <section
      ref={panel}
      className={styles.panel}
      data-diagnostics-panel
      aria-labelledby={headingId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <header className={styles.heading}>
        <h2 id={headingId}>{t("ui.diagnostics.heading")}</h2>
        <Button variant="ghost" data-diagnostics-close onClick={close}>
          {t("ui.diagnostics.close")}
        </Button>
      </header>
      <p className="muted">{t("ui.diagnostics.description")}</p>
      <form
        className={styles.filters}
        key={JSON.stringify(filter)}
        onSubmit={(event) => {
          event.preventDefault();
          apply(event.currentTarget);
        }}
        noValidate
      >
        <label>
          {t("ui.diagnostics.since")}
          <input
            data-diagnostics-filter="since"
            name="since"
            aria-label={t("ui.diagnostics.since")}
            type="datetime-local"
            step="1"
            defaultValue={localTime(filter.since)}
          />
        </label>
        <label>
          {t("ui.diagnostics.until")}
          <input
            data-diagnostics-filter="until"
            name="until"
            aria-label={t("ui.diagnostics.until")}
            type="datetime-local"
            step="1"
            defaultValue={localTime(filter.until)}
          />
        </label>
        <label>
          {t("ui.diagnostics.trace")}
          <input
            data-diagnostics-filter="traceId"
            name="traceId"
            aria-label={t("ui.diagnostics.trace")}
            defaultValue={filter.traceId ?? ""}
          />
        </label>
        <label>
          {t("ui.diagnostics.thread")}
          <input
            data-diagnostics-filter="threadId"
            name="threadId"
            aria-label={t("ui.diagnostics.thread")}
            defaultValue={filter.threadId ?? ""}
          />
        </label>
        <label>
          {t("ui.diagnostics.writer")}
          <input
            data-diagnostics-filter="processInstanceId"
            name="processInstanceId"
            aria-label={t("ui.diagnostics.writer")}
            defaultValue={filter.processInstanceId ?? ""}
          />
        </label>
        <label>
          {t("ui.diagnostics.stage")}
          <select
            data-diagnostics-filter="stage"
            name="stage"
            aria-label={t("ui.diagnostics.stage")}
            defaultValue={filter.stage ?? ""}
          >
            <option value="">{t("ui.diagnostics.allStages")}</option>
            {DiagnosticStageSchema.options.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("ui.diagnostics.operation")}
          <select
            data-diagnostics-filter="operation"
            name="operation"
            aria-label={t("ui.diagnostics.operation")}
            defaultValue={filter.operation ?? ""}
          >
            <option value="">{t("ui.diagnostics.allOperations")}</option>
            {DiagnosticOperationSchema.options.map((operation) => (
              <option key={operation} value={operation}>
                {operation}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("ui.diagnostics.limit")}
          <input
            data-diagnostics-filter="limit"
            name="limit"
            aria-label={t("ui.diagnostics.limit")}
            type="number"
            min="1"
            max="500"
            defaultValue={filter.limit}
          />
        </label>
        <Button
          ref={applyButton}
          type="submit"
          data-diagnostics-apply
          disabled={busy}
        >
          {t("ui.diagnostics.apply")}
        </Button>
      </form>
      {invalid && <p role="alert">{t("ui.diagnostics.invalidFilter")}</p>}
      <div className={styles.actions}>
        <Button
          variant="ghost"
          data-diagnostics-refresh
          disabled={query.isFetching || busy}
          onClick={() => void query.refetch()}
        >
          {t("ui.diagnostics.refresh")}
        </Button>
        <Button
          data-diagnostics-export
          disabled={busy || query.isFetching}
          onClick={() => void exportDiagnostics()}
        >
          {t(
            pending === "export"
              ? "ui.diagnostics.exporting"
              : "ui.diagnostics.export",
          )}
        </Button>
        <Button
          variant="ghost"
          data-diagnostics-copy
          disabled={busy}
          onClick={() => void copyFeedback()}
        >
          {t("ui.diagnostics.copy")}
        </Button>
      </div>
      {query.isFetching && (
        <p role="status">
          {t(
            query.data ? "ui.diagnostics.refreshing" : "ui.diagnostics.loading",
          )}
        </p>
      )}
      {error && (
        <p role="alert" data-diagnostics-query-error>
          {t(
            query.data
              ? "ui.diagnostics.staleFailure"
              : "ui.diagnostics.readFailure",
            { reason: error.reason },
          )}{" "}
          <span className="trace">{error.traceId}</span>
        </p>
      )}
      {command && (
        <p role="status" data-diagnostics-command-result>
          {command.text}{" "}
          {command.traceId && (
            <>
              <span className="trace">{command.traceId}</span>
              <Button
                variant="ghost"
                data-diagnostics-command-trace
                disabled={busy}
                onClick={() => {
                  setFilter(initialFilter(command.traceId));
                  setInvalid(false);
                }}
              >
                {t("ui.diagnostics.commandTrace")}
              </Button>
            </>
          )}
        </p>
      )}
      {query.data && (
        <div data-diagnostics-snapshot data-selectable>
          <p className="trace">
            {t("ui.diagnostics.sample", {
              time: query.data.sampledAt,
              count: query.data.records.length,
            })}
          </p>
          <p data-diagnostics-coverage>
            {t("ui.diagnostics.coverage", {
              files: query.data.coverage.files,
              bytes: query.data.coverage.bytes,
              lines: query.data.coverage.lines,
              malformed: query.data.coverage.malformed,
              redacted: query.data.coverage.redacted,
              unreadable: query.data.coverage.unreadable,
            })}
          </p>
          {query.data.coverage.truncated && (
            <p role="status">{t("ui.diagnostics.truncated")}</p>
          )}
          <p data-diagnostics-writer>
            {t(
              query.data.writer.degraded
                ? "ui.diagnostics.writerDegraded"
                : "ui.diagnostics.writerHealthy",
              { dropped: query.data.writer.dropped },
            )}
          </p>
          <p className="muted">{t("ui.diagnostics.interpretation")}</p>
          {query.data.records.length === 0 ? (
            <p>{t("ui.diagnostics.empty")}</p>
          ) : (
            <ol className={styles.records}>
              {query.data.records.map((record, index) => (
                <li
                  key={`${record.processInstanceId}:${record.time}:${record.traceId}:${index}`}
                  data-diagnostics-record
                >
                  <div className="trace">
                    {record.time} · {record.operation} · {record.stage}
                    {record.observedAt ? ` · ${record.observedAt}` : ""}
                  </div>
                  <div className="trace">
                    {record.traceId} · {record.processInstanceId}
                  </div>
                  {record.threadId && (
                    <div className="trace">
                      {t("ui.diagnostics.recordThread", {
                        threadId: record.threadId,
                      })}
                    </div>
                  )}
                  <div className="trace">
                    {record.build.id}
                    {record.durationMs !== undefined
                      ? ` · ${record.durationMs} ms`
                      : ""}
                    {record.code ? ` · ${record.code}` : ""}
                    {record.causeCode ? ` · ${record.causeCode}` : ""}
                    {record.receiptState ? ` · ${record.receiptState}` : ""}
                    {record.outcome ? ` · ${record.outcome}` : ""}
                  </div>
                  <details>
                    <summary>{t("ui.diagnostics.recordDetails")}</summary>
                    <pre className={styles.metadata}>
                      {JSON.stringify(record, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <label className={styles.feedback}>
        {t("ui.diagnostics.feedback")}
        <textarea
          data-diagnostics-feedback
          aria-label={t("ui.diagnostics.feedback")}
          readOnly
          value={feedback}
          rows={7}
        />
      </label>
      <p className="muted">{t("ui.diagnostics.feedbackHint")}</p>
    </section>
  );
}
