import { useI18n } from "../../../preferences/renderer/public";
import { Button, FormField, TextInput } from "../../../ui/renderer/public";
import type { useAuthentication } from "./use-authentication";

type Authentication = ReturnType<typeof useAuthentication>;
export function AuthenticationProgress({
  authentication,
}: {
  authentication: Pick<
    Authentication,
    | "active"
    | "event"
    | "challenge"
    | "answer"
    | "setAnswer"
    | "continuing"
    | "continueRequest"
  >;
}) {
  const { t } = useI18n();
  const {
    active,
    event,
    challenge,
    answer,
    setAnswer,
    continuing,
    continueRequest,
  } = authentication;
  return (
    <>
      {" "}
      {active && event && (
        <div className="providers-auth-progress" role="status">
          {"providerId" in event && event.providerId && (
            <strong>{event.providerId}</strong>
          )}
          {event.source && (
            <p className="trace" data-selectable>
              {event.source.directory}
            </p>
          )}
          {challenge && challenge.jobId === event.jobId && (
            <>
              <p data-selectable>{challenge.instructions}</p>
              <Button
                variant="secondary"
                type="button"
                disabled={continuing}
                onClick={() =>
                  void continueRequest({
                    kind: "open-login",
                    jobId: challenge.jobId,
                    traceId: crypto.randomUUID(),
                  })
                }
              >
                {t("config.openBrowser")}
              </Button>
            </>
          )}
          {event.kind === "progress" && (
            <p data-selectable>{event.message || t("config.authWorking")}</p>
          )}
          {event.kind === "prompt" && (
            <form
              className="settings-form"
              data-auth-prompt
              onSubmit={(e) => {
                e.preventDefault();
                if ((!event.allowEmpty && !answer.trim()) || continuing) return;
                void continueRequest({
                  kind: "answer",
                  jobId: event.jobId,
                  value: answer,
                  traceId: crypto.randomUUID(),
                });
              }}
            >
              <FormField label={event.message}>
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    type={event.secret ? "password" : "text"}
                    placeholder={event.placeholder}
                    required={!event.allowEmpty}
                    disabled={continuing}
                    autoComplete="off"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                )}
              </FormField>
              <Button
                type="submit"
                disabled={continuing || (!event.allowEmpty && !answer.trim())}
              >
                {t("config.answer")}
              </Button>
            </form>
          )}
          <Button
            variant="ghost"
            type="button"
            disabled={continuing}
            onClick={() =>
              void continueRequest({
                kind: "cancel",
                jobId: event.jobId,
                traceId: crypto.randomUUID(),
              })
            }
          >
            {t("config.cancel")}
          </Button>
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
