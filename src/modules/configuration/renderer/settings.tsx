import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../preferences/renderer/public";
import type {
  ConfigurationBridge,
  ConfigurationCommand,
  ConfigurationEvent,
  ConfigurationScope,
} from "../contracts/public";
import { configurationSnapshotQuery } from "./queries";
export function ConfigurationSettings({
  bridge,
  scope,
}: {
  bridge: ConfigurationBridge;
  scope: ConfigurationScope;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [answer, setAnswer] = useState("");
  const eventRef = useRef<ConfigurationEvent | null>(null);
  const [event, setEvent] = useState<ConfigurationEvent | null>(null);
  const [challenge, setChallenge] = useState<Extract<
    ConfigurationEvent,
    { kind: "challenge" }
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const query = useQuery({
    ...configurationSnapshotQuery(bridge, scope),
    enabled: open,
  });
  const client = useQueryClient();
  useEffect(
    () =>
      bridge.subscribe((next) => {
        eventRef.current = next;
        setEvent(next);
        if (next.kind === "challenge") setChallenge(next);
        if (next.kind === "finished") {
          setBusy(false);
          setChallenge(null);
          setAnswer("");
          void client.invalidateQueries({ queryKey: ["configuration"] });
        }
      }),
    [bridge, client],
  );
  const request = async (command: ConfigurationCommand) => {
    setBusy(true);
    if (command.kind === "login") setChallenge(null);
    setResult(null);
    try {
      const reply = await bridge.request(command);
      if (reply.kind === "started") {
        const current = eventRef.current;
        if (current?.jobId === reply.jobId)
          setBusy(current.kind !== "finished");
        else {
          const next: ConfigurationEvent = {
            kind: "progress",
            jobId: reply.jobId,
            scope: reply.scope,
            traceId: reply.traceId,
            source: reply.source,
            message: "",
          };
          eventRef.current = next;
          setEvent(next);
        }
      } else {
        setBusy(false);
        setResult(reply.kind === "done" ? "saved" : "failed");
        if (reply.kind === "done") {
          setKey("");
          void client.invalidateQueries({ queryKey: ["configuration"] });
        }
      }
    } catch {
      setBusy(false);
      setResult("failed");
    }
  };
  const active = !!event && event.kind !== "finished";
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
          {query.data && (
            <>
              <p className="trace">
                {t("config.source")}: {query.data.source.directory}
                {query.data.source.profile
                  ? " · " + query.data.source.profile
                  : ""}
              </p>
              {query.data.coverage !== "complete" && (
                <p role="status">{t("config.partial")}</p>
              )}
              <p>
                {t(
                  query.data.openaiAuthenticated === null
                    ? "config.authUnknown"
                    : query.data.openaiAuthenticated
                      ? "config.openaiReady"
                      : "config.openaiMissing",
                )}{" "}
                ·{" "}
                {t(
                  query.data.deepseekAuthenticated === null
                    ? "config.authUnknown"
                    : query.data.deepseekAuthenticated
                      ? "config.deepseekReady"
                      : "config.deepseekMissing",
                )}
              </p>
            </>
          )}
          <div className="flex gap-2">
            <button
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
            <button type="submit" disabled={!key.trim() || busy || active}>
              {t("config.saveKey")}
            </button>
          </form>
          <p className="muted">{t("config.keyNotice")}</p>
          {result && (
            <p
              role="status"
              className={result === "failed" ? "failure" : "muted"}
            >
              {t(result === "saved" ? "config.saved" : "config.failed")}
            </p>
          )}
          {active && event && (
            <div role="status">
              {challenge && challenge.jobId === event.jobId && (
                <>
                  <p>{challenge.instructions}</p>
                  <button
                    type="button"
                    onClick={() =>
                      void bridge.request({
                        kind: "open-login",
                        jobId: challenge.jobId,
                        traceId: crypto.randomUUID(),
                      })
                    }
                  >
                    {t("config.openBrowser")}
                  </button>
                </>
              )}
              {event.kind === "progress" && (
                <p>{event.message || t("config.authWorking")}</p>
              )}
              {event.kind === "prompt" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void bridge.request({
                      kind: "answer",
                      jobId: event.jobId,
                      value: answer,
                      traceId: crypto.randomUUID(),
                    });
                    setAnswer("");
                  }}
                >
                  <label>
                    {event.message}
                    <input
                      type={event.secret ? "password" : "text"}
                      autoComplete="off"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                    />
                  </label>
                  <button type="submit">{t("config.answer")}</button>
                </form>
              )}
              <button
                type="button"
                onClick={() =>
                  void bridge.request({
                    kind: "cancel",
                    jobId: event.jobId,
                    traceId: crypto.randomUUID(),
                  })
                }
              >
                {t("config.cancel")}
              </button>
            </div>
          )}
          {event?.kind === "finished" && (
            <p role="status">{t(`config.auth.${event.result}`)}</p>
          )}
        </div>
      )}
    </details>
  );
}
