import { useState, useSyncExternalStore } from "react";
import { match } from "ts-pattern";
import { Button } from "@/components/ui/button";
import type { Interaction } from "../features/control/interactions";
import type { RuntimeModel } from "../features/runtime/model";
import type { SubmissionReceipt } from "../features/submission/contracts";
import type { SubmissionModel } from "../features/submission/model";
export type FollowUpResult = {
  ok: boolean;
  message: string | null;
  submissionId: string | null;
};
const emptySubmissionSubscribe = () => () => {};
const emptySubmissionSnapshot = () => ({
  sending: false as const,
  sendingText: false as const,
  receipts: [] as SubmissionReceipt[],
  message: null as string | null,
});
export function RuntimePanel({
  model,
  submission,
  onFollowUp,
}: {
  model: RuntimeModel;
  submission?: SubmissionModel | null;
  onFollowUp: ((text: string) => Promise<FollowUpResult>) | undefined;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  // subscribe/getSnapshot references are stable (instance methods or module
  // constants); null->model flips once when submission becomes available.
  const submissions = useSyncExternalStore(
    submission?.subscribe ?? emptySubmissionSubscribe,
    submission?.getSnapshot ?? emptySubmissionSnapshot,
  );
  // Follow-up identities live here, keyed by dialog id, so a generation
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
        正在读取项目执行状态…
      </p>
    );
  const label = match(state.phase)
    .with("browse", () => "仅浏览")
    .with("allowed", () => "已允许项目执行")
    .with("starting", () => "正在启动 OMP")
    .with("ready", () => (state.busy ? "OMP 正在工作" : "OMP 已就绪"))
    .with("interrupted", () => "原生状态待确认")
    .with("failed", () => "OMP 尚未就绪")
    .exhaustive();
  return (
    <section className="runtime-panel" aria-label="项目执行">
      <strong role="status">{label}</strong>
      <span className="muted">{state.configuration}</span>
      {state.model && <span>模型：{state.model}</span>}
      <p className="muted">{state.message}</p>
      {state.control && (
        <div role="status">
          <p>
            {state.control.paused ? "队列已暂缓" : "原生队列"}：
            {state.control.queued} 条；后台活动：{state.control.background}
          </p>
          {state.control.queue.map((item, index) => (
            <p key={`${item.kind}-${index}`}>
              <strong>{item.kind === "steering" ? "干预" : "待处理"}：</strong>
              {item.text}
            </p>
          ))}
          <div className="flex gap-2">
            <Button
              disabled={state.control.stopping || state.phase !== "ready"}
              onClick={() => void model.control("stop")}
            >
              {state.control.stopping ? "正在请求停止…" : "停止并暂缓队列"}
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
                明确继续
              </Button>
            )}
          </div>
        </div>
      )}
      {state.interactions && (
        <section aria-label="原生交互" className="native-interactions">
          {state.interactions.unsupported && (
            <p role="alert">
              存在尚不支持或超出显示预算的原生交互，未自动回答。
            </p>
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
                key={`${state.interactions?.generation}-${item.id}`}
                item={item}
                trusted={state.trusted}
                model={model}
                onFollowUp={onFollowUp ? handleFollowUp(item.id) : undefined}
                onContinueFollowUp={handleContinueFollowUp}
                submissionReceipts={submissions.receipts}
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
              <summary>交互记录</summary>
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
                      submissionReceipts={[]}
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
            允许项目执行
          </Button>
        )}
        {state.trusted &&
          (state.phase === "allowed" || state.phase === "failed") && (
            <Button onClick={() => void model.act("start")}>启动 OMP</Button>
          )}
        {state.trusted && (
          <Button variant="ghost" onClick={() => void model.act("revoke")}>
            撤销执行授权
          </Button>
        )}
        <Button variant="ghost" onClick={() => void model.act("inspect")}>
          检查状态
        </Button>
      </div>
    </section>
  );
}

function defaultAnswerText(item: Interaction): string {
  if (item.method === "select") return item.options?.[0] ?? "已取消";
  if (item.prefill !== undefined) return item.prefill || "（空）";
  return "已取消";
}

function NativeDialog({
  item,
  model,
  available,
  trusted,
  onFollowUp,
  onContinueFollowUp,
  submissionReceipts,
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
  submissionReceipts: SubmissionReceipt[];
  followUpIds: string[];
}) {
  const [value, setValue] = useState(item.prefill ?? "");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const enabled = available && item.status === "pending" && !sent;
  const defaulted = item.status === "sent" && item.defaultAnswered;
  const followUpReceipts = followUpIds
    .map(
      (id) =>
        submissionReceipts.find((receipt) => receipt.submissionId === id) ??
        null,
    )
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
        setFollowUpError(result.message ?? "追发失败，原文保留在输入框。");
    });
  };
  const answer = (response: Parameters<RuntimeModel["answer"]>[1]) => {
    if (!enabled || (!trusted && response.kind !== "cancel")) return;
    setSent(true);
    void model.answer(item.id, response);
  };
  return (
    <article className="message" aria-label={item.title}>
      <strong>{item.title}</strong>
      {item.message && <p>{item.message}</p>}
      {defaulted && (
        <p role="status">
          已按默认作答：{defaultAnswerText(item)}
          （超时自动作答，避免任务阻塞）。你仍可继续作答，将作为新的追发消息送达。
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
                确认
              </Button>
              <Button
                variant="ghost"
                disabled={!enabled || !trusted}
                onClick={() => answer({ kind: "confirm", confirmed: false })}
              >
                拒绝
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
                提交回答
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            disabled={!enabled}
            onClick={() => answer({ kind: "cancel" })}
          >
            取消交互
          </Button>
        </>
      ) : defaulted ? (
        <>
          <div>
            <textarea
              className="native-answer"
              aria-label={`${item.title}的继续作答`}
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
              {sending ? "正在追发…" : "作为追发消息发送"}
            </Button>
          </div>
          {followUpReceipts.map((receipt) => (
            <div key={receipt.submissionId}>
              <p
                role={
                  receipt.state === "rejected" ||
                  receipt.state === "unknown" ||
                  receipt.outcome === "failed" ||
                  receipt.outcome === "unknown"
                    ? "alert"
                    : "status"
                }
                className={
                  receipt.state === "rejected" ||
                  receipt.state === "unknown" ||
                  receipt.outcome === "failed" ||
                  receipt.outcome === "unknown"
                    ? "failure"
                    : undefined
                }
              >
                {receipt.state === "acknowledged" &&
                receipt.outcome !== "failed" &&
                receipt.outcome !== "unknown"
                  ? "已作为追发消息发送（调用已确认，可继续追发纠正）。"
                  : receipt.state === "prepared"
                    ? "已保存，未派发（发送中断留下的草稿，可继续派发复用，不会多占一条排队）。"
                    : receipt.state === "dispatching"
                      ? "已派发，等待原生调用确认；不是任务完成。"
                      : `追发${receipt.state === "rejected" ? "被拒绝" : "结果未知"}，原文保留，可修改后再次发送；以提交记录为准。`}
              </p>
              {receipt.state === "prepared" && onContinueFollowUp && (
                <Button
                  variant="ghost"
                  disabled={!available || !trusted}
                  onClick={() => onContinueFollowUp(receipt.submissionId)}
                >
                  继续派发此条
                </Button>
              )}
            </div>
          ))}
          {followUpError && (
            <p role="alert" className="failure">
              {followUpError}
            </p>
          )}
        </>
      ) : (
        <>
          <p role="status">
            {item.status === "expired"
              ? "请求已超时"
              : item.status === "cancelled"
                ? item.dismissed
                  ? "已确认未知并关闭（仅解除本地阻塞，原生可能仍在工作；不是原生已取消）"
                  : "原生已取消"
                : item.status === "unknown"
                  ? "回答结果未知，不自动重答"
                  : item.status === "pending"
                    ? "回答已提交，结果尚未确认；不会自动重答"
                    : "回答已写出，等待原生后续结果；不代表任务完成"}
          </p>
          {item.status === "unknown" && (
            <>
              <Button
                variant="ghost"
                onClick={() => void model.dismiss(item.id)}
              >
                确认未知并关闭
              </Button>
              <p className="muted">
                仅解除本地阻塞，原生可能已收到默认答案并继续工作；不代表杀掉原生，请先核对原生历史再重发。
              </p>
            </>
          )}
        </>
      )}
    </article>
  );
}
