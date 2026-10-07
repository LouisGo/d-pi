import { useState } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { Button } from "@/components/ui/button";
import type {
  Interaction,
  SubmissionReceipt,
} from "../../../modules/execution/contracts/public";
import type {
  RuntimeModel,
  SubmissionModel,
  SubmissionView,
} from "../../../modules/execution/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { UiMessage } from "../../../shared/messages/contracts";
import {
  receiptNeedsAttention,
  receiptStatusKey,
} from "../components/receipt-status";
import { runtimePhaseLabel } from "../components/runtime-phase";
import { QueueControls } from "./queue-controls";
export type FollowUpResult = {
  ok: boolean;
  message: UiMessage | null;
  submissionId: string | null;
};
const emptySubmissionStore = createStore<SubmissionView>()(() => ({
  sending: false as const,
  sendingText: false as const,
  receipts: [] as SubmissionReceipt[],
  receiptIds: [],
  receiptsById: new Map(),
  message: null,
  preparationFailure: null,
}));
export function RuntimePanel({
  model,
  submission,
  onFollowUp,
}: {
  model: RuntimeModel;
  submission?: SubmissionModel | null;
  onFollowUp: ((text: string) => Promise<FollowUpResult>) | undefined;
}) {
  const { t, formatMessage } = useI18n();
  const state = useStore(model.stateStore, (value) => value.view);
  const submissionStore = submission?.stateStore ?? emptySubmissionStore;
  const receiptsById = useStore(submissionStore, (value) => value.receiptsById);
  // Follow-up identities live here, keyed by dialog id, so a connectionGeneration
  // change (remount) neither loses the success indicator nor allows a silent
  // duplicate steer. Multiple entries per dialog are allowed: ack is call
  // confirmation, not task completion.
  const [followUps, setFollowUps] = useState<Record<string, string[]>>({});
  const handleFollowUp = (dialogId: string) => async (text: string) => {
    if (!onFollowUp) return { ok: false, message: null, submissionId: null };
    const result = await onFollowUp(text);
    if (result.submissionId)
      setFollowUps((prev) => ({
        ...prev,
        [dialogId]: [...(prev[dialogId] ?? []), result.submissionId as string],
      }));
    return result;
  };
  // Reuse an orphaned prepared follow-up instead of accumulating new ids:
  // a failed dispatch transport leaves its prepared receipt occupying a queue
  // slot with no other exit. continuePrepared dispatches the same identity.
  const handleContinueFollowUp = (
    submissionId: SubmissionReceipt["submissionId"],
  ) => {
    void submission?.continuePrepared(submissionId);
  };
  if (!state)
    return (
      <p className="muted" role="status">
        {t("ui.runtime.loading")}
      </p>
    );
  const label = runtimePhaseLabel(state, t);
  return (
    <section
      className="runtime-panel"
      data-attention-target="runtime"
      tabIndex={-1}
      aria-label={t("ui.runtime.sectionLabel")}
    >
      <strong role="status">{label}</strong>
      <details className="runtime-source">
        <summary>{t("ui.runtime.details")}</summary>
        <span className="muted">{formatMessage(state.configuration)}</span>
        {state.phase === "ready" && <p>{formatMessage(state.message)}</p>}
        {state.evidenceCoverage === "gap" && (
          <p>{formatMessage({ code: "runtime.evidenceGap" })}</p>
        )}
      </details>
      {state.phase !== "ready" && (
        <p className="muted">{formatMessage(state.message)}</p>
      )}
      {state.control &&
        (state.busy ||
          state.control.paused ||
          state.control.queued > 0 ||
          state.control.stopping ||
          state.control.background > 0) && (
          <div role="status">
            <p>
              {state.control.paused
                ? t("ui.runtime.queuePaused", {
                    queued: state.control.queued,
                    background: state.control.background,
                  })
                : t("ui.runtime.queueActive", {
                    queued: state.control.queued,
                    background: state.control.background,
                  })}
            </p>
            {!state.control.queueState &&
              state.control.queue.map((item, index) => (
                <p key={`${item.kind}-${index}`}>
                  <strong>
                    {item.kind === "steering"
                      ? t("ui.runtime.steering")
                      : t("ui.runtime.pending")}
                    ：
                  </strong>
                  {item.text}
                </p>
              ))}
            <div className="flex gap-2">
              <Button
                disabled={state.control.stopping || state.phase !== "ready"}
                onClick={() => void model.control("stop")}
              >
                {state.control.stopping
                  ? t("ui.runtime.stopping")
                  : t("ui.runtime.stop")}
              </Button>
              {state.control.paused && (
                <Button
                  disabled={
                    !state.trusted ||
                    state.control.stopping ||
                    state.phase !== "ready"
                  }
                  onClick={() => void model.control("continue")}
                >
                  {t("ui.runtime.continue")}
                </Button>
              )}
            </div>
          </div>
        )}
      <QueueControls model={model} />
      {state.interactions && (
        <section
          aria-label={t("ui.runtime.interactionsLabel")}
          className="native-interactions"
          data-attention-target="interaction"
          tabIndex={-1}
        >
          {state.interactions.unsupported && (
            <p role="alert">{t("ui.runtime.unsupportedInteraction")}</p>
          )}
          {state.interactions.items
            .filter(
              (item) =>
                item.status === "pending" ||
                item.status === "unknown" ||
                (item.status === "sent" && item.defaultAnswered),
            )
            .map((item) => (
              <NativeDialog
                key={`${state.interactions?.connectionGeneration}-${item.id}`}
                item={item}
                trusted={state.trusted}
                model={model}
                onFollowUp={onFollowUp ? handleFollowUp(item.id) : undefined}
                onContinueFollowUp={handleContinueFollowUp}
                receiptsById={receiptsById}
                followUpIds={followUps[item.id] ?? []}
                available={
                  state.phase !== "interrupted" && state.phase !== "failed"
                }
              />
            ))}
          {state.interactions.items.some(
            (item) =>
              item.status !== "pending" &&
              item.status !== "unknown" &&
              !(item.status === "sent" && item.defaultAnswered),
          ) && (
            <details>
              <summary>{t("ui.runtime.interactionRecords")}</summary>
              <div className="native-interactions">
                {state.interactions.items
                  .filter(
                    (item) =>
                      item.status !== "pending" &&
                      item.status !== "unknown" &&
                      !(item.status === "sent" && item.defaultAnswered),
                  )
                  .map((item) => (
                    <NativeDialog
                      key={item.id}
                      item={item}
                      trusted={state.trusted}
                      model={model}
                      onFollowUp={undefined}
                      onContinueFollowUp={undefined}
                      receiptsById={
                        emptySubmissionStore.getState().receiptsById
                      }
                      followUpIds={[]}
                      available={false}
                    />
                  ))}
              </div>
            </details>
          )}
        </section>
      )}
      <div className="flex gap-2">
        {!state.trusted && (
          <Button
            disabled={state.phase === "starting"}
            onClick={() => void model.act("allow")}
          >
            {t("ui.runtime.allow")}
          </Button>
        )}
        {state.trusted &&
          (state.phase === "allowed" || state.phase === "failed") && (
            <Button onClick={() => void model.act("start")}>
              {t("ui.runtime.start")}
            </Button>
          )}
        {state.trusted && (
          <Button variant="ghost" onClick={() => void model.act("revoke")}>
            {t("ui.runtime.revoke")}
          </Button>
        )}
        <Button variant="ghost" onClick={() => void model.act("inspect")}>
          {t("ui.runtime.inspect")}
        </Button>
      </div>
    </section>
  );
}

function defaultAnswerText(
  item: Interaction,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (item.method === "select")
    return item.options?.[0] ?? t("ui.interaction.cancelled");
  if (item.prefill !== undefined)
    return item.prefill || t("ui.interaction.empty");
  return t("ui.interaction.cancelled");
}

function NativeDialog({
  item,
  model,
  available,
  trusted,
  onFollowUp,
  onContinueFollowUp,
  receiptsById,
  followUpIds,
}: {
  item: Interaction;
  model: RuntimeModel;
  available: boolean;
  trusted: boolean;
  onFollowUp: ((text: string) => Promise<FollowUpResult>) | undefined;
  onContinueFollowUp:
    | ((submissionId: SubmissionReceipt["submissionId"]) => void)
    | undefined;
  receiptsById: ReadonlyMap<string, SubmissionReceipt>;
  followUpIds: string[];
}) {
  const { t, formatMessage } = useI18n();
  const [value, setValue] = useState(item.prefill ?? "");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [followUpError, setFollowUpError] = useState<
    UiMessage | "fallback" | null
  >(null);
  const enabled = available && item.status === "pending" && !sent;
  const defaulted = item.status === "sent" && item.defaultAnswered;
  const followUpReceipts = followUpIds
    .map((id) => receiptsById.get(id) ?? null)
    .filter((receipt) => receipt !== null);
  // The formal receipts own the results. An in-flight prepared/dispatching
  // entry pauses further sends for this card; terminal entries never lock:
  // acknowledged is call confirmation, not task completion, so a typo can be
  // corrected with a new steer. Rejected/unknown stay visible with retry.
  const followUpInFlight = followUpReceipts.some(
    (receipt) =>
      receipt.state === "prepared" || receipt.state === "dispatching",
  );
  const followUp = () => {
    if (
      !available ||
      !trusted ||
      !onFollowUp ||
      !value.trim() ||
      sending ||
      followUpInFlight
    )
      return;
    setSending(true);
    setFollowUpError(null);
    void onFollowUp(value).then((result) => {
      setSending(false);
      // Identity is appended by the parent (survives remount); failures with
      // a formal receipt are still tracked via that identity.
      if (!result.ok || !result.submissionId)
        setFollowUpError(result.message ?? "fallback");
    });
  };
  const answer = (response: Parameters<RuntimeModel["answer"]>[1]) => {
    if (!enabled || (!trusted && response.kind !== "cancel")) return;
    setSent(true);
    void model.answer(item.id, response);
  };
  return (
    <article className="message" data-selectable aria-label={item.title}>
      <strong>{item.title}</strong>
      {item.message && <p>{item.message}</p>}
      {defaulted && (
        <p role="status">
          {t("ui.interaction.defaultAnswered", {
            answer: defaultAnswerText(item, t),
          })}
        </p>
      )}
      {item.status === "pending" && !sent ? (
        <>
          {item.method === "confirm" ? (
            <div className="flex gap-2">
              <Button
                disabled={!enabled || !trusted}
                onClick={() => answer({ kind: "confirm", confirmed: true })}
              >
                {t("ui.interaction.confirm")}
              </Button>
              <Button
                variant="ghost"
                disabled={!enabled || !trusted}
                onClick={() => answer({ kind: "confirm", confirmed: false })}
              >
                {t("ui.interaction.reject")}
              </Button>
            </div>
          ) : item.method === "select" ? (
            <div className="flex flex-col gap-2">
              {item.options?.map((option, index) => (
                <div key={`${index}-${option}`}>
                  <Button
                    disabled={!enabled || !trusted}
                    onClick={() => answer({ kind: "value", value: option })}
                  >
                    {option}
                  </Button>
                  {item.optionDetails?.[index]?.description && (
                    <p>{item.optionDetails[index]?.description}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div>
              <textarea
                className="native-answer"
                aria-label={item.title}
                disabled={!enabled || !trusted}
                value={value}
                placeholder={item.placeholder}
                maxLength={16384}
                onChange={(event) => setValue(event.target.value)}
              />
              <Button
                disabled={!enabled || !trusted}
                onClick={() => answer({ kind: "value", value })}
              >
                {t("ui.interaction.submit")}
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            disabled={!enabled}
            onClick={() => answer({ kind: "cancel" })}
          >
            {t("ui.interaction.cancel")}
          </Button>
        </>
      ) : defaulted ? (
        <>
          <div>
            <textarea
              className="native-answer"
              aria-label={t("ui.interaction.continueAnswerLabel", {
                title: item.title,
              })}
              disabled={!available || !trusted || followUpInFlight || sending}
              value={value}
              placeholder={item.placeholder}
              maxLength={16384}
              onChange={(event) => setValue(event.target.value)}
            />
            <Button
              disabled={
                !available ||
                !trusted ||
                followUpInFlight ||
                sending ||
                !value.trim()
              }
              onClick={followUp}
            >
              {sending
                ? t("ui.interaction.sendingFollowUp")
                : t("ui.interaction.sendFollowUp")}
            </Button>
          </div>
          {followUpReceipts.map((receipt) => {
            const trouble = receiptNeedsAttention(receipt);
            return (
              <div key={receipt.submissionId}>
                <p
                  role={trouble ? "alert" : "status"}
                  className={trouble ? "failure" : undefined}
                >
                  {t(receiptStatusKey(receipt))}
                </p>
                {receipt.state === "prepared" && onContinueFollowUp && (
                  <Button
                    variant="ghost"
                    disabled={!available || !trusted}
                    onClick={() => onContinueFollowUp(receipt.submissionId)}
                  >
                    {t("ui.interaction.continueDispatch")}
                  </Button>
                )}
              </div>
            );
          })}
          {followUpError && (
            <p role="alert" className="failure">
              {followUpError === "fallback"
                ? t("ui.interaction.followUpFailed")
                : formatMessage(followUpError)}
            </p>
          )}
        </>
      ) : (
        <>
          <p role="status">
            {item.status === "expired"
              ? t("ui.interaction.expired")
              : item.status === "cancelled"
                ? item.dismissed
                  ? t("ui.interaction.dismissed")
                  : t("ui.interaction.nativeCancelled")
                : item.status === "unknown"
                  ? t("ui.interaction.answerUnknown")
                  : item.status === "pending"
                    ? t("ui.interaction.answerSubmitted")
                    : t("ui.interaction.answerWritten")}
          </p>
          {item.status === "unknown" && (
            <>
              <Button
                variant="ghost"
                onClick={() => void model.dismiss(item.id)}
              >
                {t("ui.interaction.dismissUnknown")}
              </Button>
              <p className="muted">{t("ui.interaction.dismissWarning")}</p>
            </>
          )}
        </>
      )}
    </article>
  );
}
