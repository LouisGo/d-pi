import { useRef, useState } from "react";
import type {
  Interaction,
  SubmissionReceipt,
} from "../../../modules/execution/contracts/public";
import type { RuntimeModel } from "../../../modules/execution/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  ActionGroup,
  AnswerOptions,
  Button,
  TextArea,
} from "../../../modules/ui/renderer/public";
import type { UiMessage } from "../../../shared/messages/contracts";
import { CloseIcon } from "../components/icons/common";
import {
  receiptNeedsAttention,
  receiptStatusKey,
} from "../components/receipt-status";
import { IconButton } from "../components/ui/icon-button";
export type FollowUpResult = {
  ok: boolean;
  message: UiMessage | null;
  submissionId: string | null;
};

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

export function NativeInteraction({
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
  model: Pick<RuntimeModel, "answer" | "dismiss">;
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
  const answered = useRef(false);
  const [selection, setSelection] = useState<
    | {
        kind: "option";
        index: number;
        value: string;
      }
    | { kind: "custom" }
    | null
  >(null);
  // A native update must not silently retarget an already selected answer.
  const selected =
    selection?.kind === "option" &&
    item.options?.[selection.index] === selection.value
      ? selection
      : null;
  const customAnswer = selection?.kind === "custom";
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
    if (
      !enabled ||
      answered.current ||
      (!trusted && response.kind !== "cancel")
    )
      return;
    answered.current = true;
    setSent(true);
    void model.answer(item.id, response);
  };
  return (
    <article
      className="native-interaction"
      data-selectable
      aria-label={item.title}
    >
      <header className="native-interaction-heading">
        <strong>{item.title}</strong>
        {item.status === "pending" && !sent && (
          <IconButton
            variant="ghost"
            label={t("ui.interaction.cancel")}
            disabled={!enabled}
            onClick={() => answer({ kind: "cancel" })}
          >
            <CloseIcon />
          </IconButton>
        )}
      </header>
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
          {item.method === "select" ? (
            <AnswerOptions
              aria-label={item.title}
              value={
                customAnswer
                  ? { kind: "custom", value }
                  : selected
                    ? { kind: "option", value: String(selected.index) }
                    : null
              }
              options={(item.options ?? []).map((option, index) => ({
                value: String(index),
                label: option,
                description: item.optionDetails?.[index]?.description,
              }))}
              disabled={!enabled || !trusted}
              custom={{
                label: t("ui.interaction.customAnswer"),
                placeholder: t("ui.interaction.customPlaceholder"),
                maxLength: 16384,
              }}
              onValueChange={(next) => {
                if (next.kind === "custom") {
                  setSelection({ kind: "custom" });
                  setValue(next.value);
                  return;
                }
                const option = item.options?.[Number(next.value)];
                if (option !== undefined) {
                  setSelection({
                    kind: "option",
                    index: Number(next.value),
                    value: option,
                  });
                  setValue("");
                }
              }}
            />
          ) : item.method !== "confirm" ? (
            <TextArea
              data-native-answer
              aria-label={item.title}
              disabled={!enabled || !trusted}
              value={value}
              placeholder={item.placeholder}
              maxLength={16384}
              onChange={(event) => setValue(event.target.value)}
            />
          ) : null}
          <footer className="native-interaction-footer">
            <ActionGroup>
              <Button
                variant="subtle"
                disabled={!enabled || (item.method === "confirm" && !trusted)}
                onClick={() =>
                  answer(
                    item.method === "confirm"
                      ? { kind: "confirm", confirmed: false }
                      : { kind: "cancel" },
                  )
                }
              >
                {t(
                  item.method === "confirm"
                    ? "ui.interaction.reject"
                    : "ui.interaction.cancel",
                )}
              </Button>
              <Button
                variant="accent"
                disabled={
                  !enabled ||
                  !trusted ||
                  (item.method === "select" &&
                    (customAnswer ? !value.trim() : selected === null))
                }
                onClick={() => {
                  if (item.method === "confirm")
                    answer({ kind: "confirm", confirmed: true });
                  else if (item.method === "select") {
                    if (customAnswer && value.trim())
                      answer({ kind: "value", value });
                    else if (selected)
                      answer({ kind: "value", value: selected.value });
                  } else answer({ kind: "value", value });
                }}
              >
                {t(
                  item.method === "confirm"
                    ? "ui.interaction.confirm"
                    : "ui.interaction.submit",
                )}
              </Button>
            </ActionGroup>
          </footer>
        </>
      ) : defaulted ? (
        <>
          <TextArea
            data-native-answer
            aria-label={t("ui.interaction.continueAnswerLabel", {
              title: item.title,
            })}
            disabled={!available || !trusted || followUpInFlight || sending}
            value={value}
            placeholder={item.placeholder}
            maxLength={16384}
            onChange={(event) => setValue(event.target.value)}
          />
          <footer className="native-interaction-footer">
            <Button
              variant="accent"
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
          </footer>
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
