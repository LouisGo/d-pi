import { match } from "ts-pattern";
import { draftByteLength } from "../../shared/draft-text";
import {
  type FrozenSubmission,
  FrozenSubmissionSchema,
  SubmissionConflict,
  type SubmissionEvent,
  type SubmissionFailure,
  type SubmissionReceipt,
} from "./contracts";
export interface SubmissionStore {
  prepareSubmission(value: FrozenSubmission): SubmissionReceipt;
  submission(id: string): SubmissionReceipt | null;
  dispatchSubmission(id: string): boolean;
  acknowledgeSubmission(id: string): boolean;
  failSubmission(id: string): void;
  unknownSubmission(id: string): void;
}
export interface NativeSubmissionPort {
  isCurrentTarget(target: FrozenSubmission["target"]): boolean;
  canDispatch(target: FrozenSubmission["target"]): boolean;
  write(value: FrozenSubmission, frame: string): void;
}
export type SubmissionResult =
  | { kind: "receipt"; receipt: SubmissionReceipt }
  | {
      kind: "failed";
      code: SubmissionFailure["code"];
      error: SubmissionFailure;
    };
export interface SubmissionDiagnostic {
  traceId: string;
  requestId: string;
  connectionId: string;
  submissionId: string;
  threadId: string;
  nativeProcessInstanceId: string;
  operation: "submit";
  stage: "prepared" | "dispatching" | "acknowledged" | "unknown" | "failed";
}
// Conservative v18.3.0 physical-frame budget; not an observed native input limit.
export const SUBMISSION_FRAME_BUDGET = 1024 * 1024;
function frameFor(value: FrozenSubmission): string {
  return `${JSON.stringify({ id: value.requestId, type: "prompt", message: value.text, streamingBehavior: value.delivery ?? "followUp" })}\n`;
}
function sameTarget(
  a: FrozenSubmission["target"],
  b: FrozenSubmission["target"],
): boolean {
  return (
    a.processInstanceId === b.processInstanceId &&
    a.connectionGeneration === b.connectionGeneration &&
    a.configContextId === b.configContextId &&
    a.nativeSessionRef === b.nativeSessionRef
  );
}
export class SubmissionCoordinator {
  constructor(
    private readonly store: SubmissionStore,
    private readonly native: NativeSubmissionPort,
    private readonly record: (event: SubmissionDiagnostic) => void = () => {},
  ) {}
  prepare(value: FrozenSubmission): SubmissionResult {
    try {
      if (draftByteLength(frameFor(value)) > SUBMISSION_FRAME_BUDGET)
        return this.failure("content-too-large", value);
      if (!this.native.canDispatch(value.target))
        return this.failure("not-ready", value);
      const receipt = this.store.prepareSubmission(value);
      this.log(receipt);
      return { kind: "receipt", receipt };
    } catch (error) {
      return this.failure(
        error instanceof SubmissionConflict
          ? "revision-conflict"
          : "storage-unavailable",
        value,
      );
    }
  }
  dispatch(id: string): SubmissionResult {
    let context: FrozenSubmission | undefined;
    try {
      const receipt = this.store.submission(id);
      context = receipt ?? undefined;
      if (!receipt) return this.failure("unknown-submission", context);
      if (receipt.state !== "prepared") return { kind: "receipt", receipt };
      if (
        !this.native.isCurrentTarget(receipt.target) ||
        !this.native.canDispatch(receipt.target)
      )
        return this.failure("not-ready", context);
      const frame = frameFor(receipt);
      if (draftByteLength(frame) > SUBMISSION_FRAME_BUDGET)
        return this.failure("content-too-large", context);
      if (!this.store.dispatchSubmission(id)) return this.result(id);
      this.log({ ...receipt, state: "dispatching" });
      try {
        this.native.write(FrozenSubmissionSchema.strip().parse(receipt), frame);
      } catch {
        this.store.unknownSubmission(id);
      }
      return this.result(id);
    } catch {
      return this.failure("storage-unavailable", context);
    }
  }
  receive(event: SubmissionEvent): SubmissionResult {
    let context: FrozenSubmission | undefined;
    try {
      const receipt = this.store.submission(event.submissionId);
      context = receipt ?? undefined;
      if (
        !receipt ||
        receipt.requestId !== event.requestId ||
        !sameTarget(receipt.target, event.target) ||
        !this.native.isCurrentTarget(event.target)
      )
        return this.failure("stale-event", context);
      match(event.kind)
        .with("ack", () => {
          this.store.acknowledgeSubmission(receipt.submissionId);
        })
        .with("error", () => {
          this.store.failSubmission(receipt.submissionId);
        })
        .with("disconnected", () => {
          this.store.unknownSubmission(receipt.submissionId);
        })
        .exhaustive();
      return this.result(receipt.submissionId);
    } catch {
      // Preserve the dispatching row if the database is still unavailable.
      try {
        this.store.unknownSubmission(event.submissionId);
      } catch {
        /* Restart recovers it. */
      }
      return this.failure("storage-unavailable", context);
    }
  }
  private result(id: string): SubmissionResult {
    const receipt = this.store.submission(id);
    if (!receipt) return this.failure("unknown-submission");
    this.log(receipt);
    return { kind: "receipt", receipt };
  }
  private log(receipt: SubmissionReceipt): void {
    try {
      this.record({
        traceId: receipt.traceId,
        requestId: receipt.requestId,
        connectionId: receipt.target.connectionGeneration,
        submissionId: receipt.submissionId,
        threadId: receipt.threadId,
        nativeProcessInstanceId: receipt.target.processInstanceId,
        operation: "submit",
        stage: receipt.outcome === "failed" ? "failed" : receipt.state,
      });
    } catch {
      /* Diagnostic failure cannot alter submission persistence or dispatch. */
    }
  }
  private failure(
    code: SubmissionFailure["code"],
    context?: FrozenSubmission,
  ): SubmissionResult {
    const safeMessage = match(code)
      .with(
        "storage-unavailable",
        () => "提交记录暂时无法保存。请保留原文并核对状态，不要重复发送。",
      )
      .with("not-ready", () => "当前执行环境尚未就绪，原文已保留。")
      .with("content-too-large", () => "正文编码后超过发送上限，原文未截断。")
      .with("unknown-submission", () => "找不到该次提交记录。")
      .with("stale-event", () => "已忽略不属于当前实例的回执。")
      .with(
        "revision-conflict",
        () => "提交身份或草稿版本已变化，请核对当前内容。",
      )
      .exhaustive();
    return {
      kind: "failed",
      code,
      error: {
        errorId: crypto.randomUUID(),
        traceId: context?.traceId ?? crypto.randomUUID(),
        code,
        observedAt: "main",
        reportedBy: "app",
        attribution: "unknown",
        handlingOwner: "submission",
        recovery:
          code === "storage-unavailable" ? "reconcile_first" : "user_action",
        safeMessage,
      },
    };
  }
}
