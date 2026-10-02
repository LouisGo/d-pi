import { useI18n } from "../../../preferences/renderer/public";
import type { ConfigurationBridge } from "../../contracts/public";
import type { useAuthentication } from "./use-authentication";

type Authentication = ReturnType<typeof useAuthentication>;
export function AuthenticationProgress({
  bridge,
  authentication,
}: {
  bridge: ConfigurationBridge;
  authentication: Pick<
    Authentication,
    "active" | "event" | "challenge" | "answer" | "setAnswer"
  >;
}) {
  const { t } = useI18n();
  const { active, event, challenge, answer, setAnswer } = authentication;
  return (
    <>
      {" "}
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
        <p
          role={event.result === "failed" ? "alert" : "status"}
          className={event.result === "failed" ? "failure" : undefined}
        >
          {event.code
            ? t(`config.error.${event.code}`)
            : t(`config.auth.${event.result}`)}
        </p>
      )}
    </>
  );
}
