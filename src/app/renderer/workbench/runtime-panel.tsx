import { useState } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type {
  RuntimeView,
  SubmissionReceipt,
} from "../../../modules/execution/contracts/public";
import type {
  RuntimeModel,
  SubmissionModel,
  SubmissionView,
} from "../../../modules/execution/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  ActionGroup,
  Button,
  Disclosure,
  DisclosureTrigger,
  LoadingIndicator,
} from "../../../modules/ui/renderer/public";
import { runtimePhaseLabel } from "../components/runtime-phase";
import { type FollowUpResult, NativeInteraction } from "./native-interaction";
import { QueueControls } from "./queue-controls";

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
  inspection = true,
  origin,
}: {
  model: RuntimeModel;
  inspection?: boolean;
  origin?: "cli" | undefined;
  submission?: SubmissionModel | null;
  onFollowUp: ((text: string) => Promise<FollowUpResult>) | undefined;
}) {
  const { t } = useI18n();
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
    return inspection ? (
      <LoadingIndicator pending label={t("app.loading")} />
    ) : null;
  const actionable =
    state.busy ||
    state.control?.paused ||
    state.control?.queued ||
    state.control?.stopping ||
    state.control?.background ||
    state.control?.queueState?.editing ||
    state.control?.queueState?.items.length ||
    state.control?.queueState?.hiddenCount ||
    state.queueOperation?.status === "unknown" ||
    state.queueOperation?.status === "failed" ||
    state.interactions?.unsupported ||
    state.interactions?.items.some(
      (item) =>
        item.status === "pending" ||
        item.status === "unknown" ||
        (item.status === "sent" && item.defaultAnswered),
    );
  if (!inspection && !actionable) return null;
  if (
    !inspection &&
    state.phase !== "ready" &&
    !state.control &&
    !state.interactions
  )
    return null;
  return (
    <section
      className="runtime-panel"
      data-attention-target="runtime"
      tabIndex={-1}
      aria-label={t("ui.runtime.sectionLabel")}
    >
      {inspection ? <RuntimeInspection model={model} origin={origin} /> : null}
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
            <ActionGroup>
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
            </ActionGroup>
          </div>
        )}
      <QueueControls model={model} hiddenEmpty={!inspection} />
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
              <NativeInteraction
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
            <Disclosure hidden={!inspection}>
              <DisclosureTrigger>
                {t("ui.runtime.interactionRecords")}
              </DisclosureTrigger>
              <div className="native-interactions">
                {state.interactions.items
                  .filter(
                    (item) =>
                      item.status !== "pending" &&
                      item.status !== "unknown" &&
                      !(item.status === "sent" && item.defaultAnswered),
                  )
                  .map((item) => (
                    <NativeInteraction
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
            </Disclosure>
          )}
        </section>
      )}
    </section>
  );
}

export function RuntimeInspection({
  model,
  origin,
}: {
  model: RuntimeModel;
  origin?: "cli" | undefined;
}) {
  const { t, formatMessage } = useI18n();
  const state = useStore(model.stateStore, (value) => value.view);
  if (!state) return <LoadingIndicator pending label={t("app.loading")} />;
  const label = runtimePhaseLabel(state, t);
  return (
    <section
      data-runtime-inspector=""
      aria-label={t("ui.runtime.sectionLabel")}
    >
      <strong role="status">{label}</strong>
      <div className="runtime-source">
        <Disclosure>
          <DisclosureTrigger>{t("ui.runtime.details")}</DisclosureTrigger>
          <span className="muted">{formatMessage(state.configuration)}</span>
          {state.phase === "ready" && <p>{formatMessage(state.message)}</p>}
          {state.evidenceCoverage === "gap" && (
            <p>{formatMessage({ code: "runtime.evidenceGap" })}</p>
          )}
        </Disclosure>
      </div>
      {state.phase !== "ready" && (
        <p className="muted">{formatMessage(state.message)}</p>
      )}
      <RuntimeActions model={model} state={state} origin={origin} />
    </section>
  );
}
function RuntimeActions({
  model,
  state,
  origin,
}: {
  model: RuntimeModel;
  state: RuntimeView;
  origin?: "cli" | undefined;
}) {
  const { t } = useI18n();
  return (
    <ActionGroup>
      {!state.trusted && (
        <Button
          disabled={state.phase === "starting"}
          onClick={() => void model.act("allow")}
        >
          {t("ui.runtime.allow")}
        </Button>
      )}
      {state.trusted &&
        (state.phase === "failed" || state.phase === "interrupted") &&
        !state.busy && (
          <Button onClick={() => void model.act("start")}>
            {t(origin === "cli" ? "ui.runtime.retryStart" : "ui.runtime.retry")}
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
    </ActionGroup>
  );
}
