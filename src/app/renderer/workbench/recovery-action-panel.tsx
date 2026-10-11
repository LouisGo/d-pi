import { useState } from "react";
import type { RuntimeView } from "../../../modules/execution/contracts/public";
import type { RuntimeModel } from "../../../modules/execution/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  ActionGroup,
  Button,
  Disclosure,
  DisclosureTrigger,
} from "../../../modules/ui/renderer/public";
import { runtimePhaseLabel } from "../components/runtime-phase";

function hasUnknownRuntimeOperation(state: RuntimeView): boolean {
  return [
    state.queueOperation,
    state.modelOperation,
    state.subagentOperation,
  ].some((operation) => operation?.status === "unknown");
}
export function runtimeNeedsRecovery(state: RuntimeView): boolean {
  return (
    state.phase === "failed" ||
    state.phase === "interrupted" ||
    state.recoveryFailure !== undefined ||
    state.evidenceCoverage === "gap" ||
    state.approvals?.coverage === "gap" ||
    state.approvals?.items.some((item) => item.status === "unknown") === true ||
    hasUnknownRuntimeOperation(state) ||
    state.interactions?.items.some((item) => item.status === "unknown") ===
      true ||
    state.interactionOperations?.some((item) => item.status === "unknown") ===
      true
  );
}

/** Read existing facts; reconnect delegates admission and identity checks to Main. */
export function RecoveryActionPanel({
  model,
  state,
  unknownSubmission,
  onReviewAnswers,
  onReviewOperations,
}: {
  model: RuntimeModel;
  state: RuntimeView;
  unknownSubmission: boolean;
  onReviewAnswers: (() => void) | undefined;
  onReviewOperations: (() => void) | undefined;
}) {
  const { t, formatMessage } = useI18n();
  const [pending, setPending] = useState(false);
  const unknown =
    unknownSubmission ||
    state.interactions?.items.some((item) => item.status === "unknown") ||
    state.interactionOperations?.some((item) => item.status === "unknown") ||
    hasUnknownRuntimeOperation(state);
  async function check(kind: "inspect" | "start") {
    if (pending) return;
    setPending(true);
    try {
      await model.act(kind);
    } finally {
      setPending(false);
    }
  }
  return (
    <section data-recovery-panel="" aria-label={t("ui.recovery.title")}>
      <strong role="status">{t("ui.recovery.title")}</strong>
      {(state.phase === "failed" ||
        state.phase === "interrupted" ||
        state.recoveryFailure) && <p>{formatMessage(state.message)}</p>}
      {state.evidenceCoverage === "gap" && (
        <p>{formatMessage({ code: "runtime.evidenceGap" })}</p>
      )}
      {unknown && <p>{t("ui.recovery.unknown")}</p>}
      <p className="muted">{t("ui.recovery.keepInput")}</p>
      <ActionGroup>
        <Button
          variant="ghost"
          disabled={pending || state.phase === "starting"}
          onClick={() => void check("inspect")}
        >
          {t("ui.runtime.inspect")}
        </Button>
        {state.trusted &&
          !state.busy &&
          (state.phase === "failed" || state.phase === "interrupted") && (
            <Button disabled={pending} onClick={() => void check("start")}>
              {t("ui.recovery.reconnect")}
            </Button>
          )}
        {onReviewAnswers && (
          <Button variant="ghost" onClick={onReviewAnswers}>
            {t("ui.recovery.answers")}
          </Button>
        )}
        {onReviewOperations && (
          <Button variant="ghost" onClick={onReviewOperations}>
            {t("ui.recovery.messages")}
          </Button>
        )}
      </ActionGroup>
      <Disclosure>
        <DisclosureTrigger>{t("ui.recovery.facts")}</DisclosureTrigger>
        <p>{runtimePhaseLabel(state, t)}</p>
        <dl>
          <dt>{t("ui.recovery.thread")}</dt>
          <dd>
            <code>{state.threadId}</code>
          </dd>
          <dt>{t("ui.recovery.trace")}</dt>
          <dd>
            <code>{state.traceId}</code>
          </dd>
          {state.connectionGeneration && (
            <>
              <dt>{t("ui.recovery.connection")}</dt>
              <dd>
                <code>{state.connectionGeneration}</code>
              </dd>
            </>
          )}
          {state.interactions?.nativeSessionKey && (
            <>
              <dt>{t("ui.recovery.native")}</dt>
              <dd>
                <code>{state.interactions.nativeSessionKey}</code>
              </dd>
            </>
          )}
        </dl>
        {state.interactionOperations
          ?.filter((item) => item.status === "unknown")
          .map((item) => (
            <p key={item.operationId}>
              <code>{item.operationId}</code> · <code>{item.requestId}</code> ·{" "}
              {t("ui.recovery.operationUnknown")}
            </p>
          ))}
      </Disclosure>
    </section>
  );
}
