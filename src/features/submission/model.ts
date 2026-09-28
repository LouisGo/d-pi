import { match } from "ts-pattern";
import type { ThreadId } from "../../shared/identity";
import type { CapturedDraft, DraftController } from "../draft/controller";
import {
  type SubmissionBridge,
  SubmissionIdSchema,
  type SubmissionReceipt,
  type SubmissionReply,
} from "./contracts";

interface View {
  sending: boolean;
  receipts: SubmissionReceipt[];
  message: string | null;
}
// Receipt facts advance independently: a late ACK can resolve call confirmation,
// but cannot erase an observed failure/uncertain outcome. Millisecond wall-clock
// timestamps are display metadata, not a causal ordering of IPC replies/events.
function mergeReceipt(
  old: SubmissionReceipt,
  next: SubmissionReceipt,
): SubmissionReceipt {
  if (old.state === "rejected") return old;
  const state = match(old.state)
    .with("acknowledged", () => "acknowledged" as const)
    .with("unknown", () =>
      next.state === "prepared" || next.state === "dispatching"
        ? ("unknown" as const)
        : next.state,
    )
    .with("dispatching", () =>
      next.state === "prepared" ? ("dispatching" as const) : next.state,
    )
    .with("prepared", () => next.state)
    .exhaustive();
  return {
    ...next,
    state,
    acknowledgedAt: old.acknowledgedAt ?? next.acknowledgedAt,
    outcome:
      state === "rejected"
        ? "unobserved"
        : old.outcome === "failed" || next.outcome === "failed"
          ? "failed"
          : old.outcome === "unknown" || next.outcome === "unknown"
            ? "unknown"
            : "unobserved",
    updatedAt: old.updatedAt > next.updatedAt ? old.updatedAt : next.updatedAt,
  };
}
export class SubmissionModel {
  private view: View = { sending: false, receipts: [], message: null };
  private listeners = new Set<() => void>();
  private captured: CapturedDraft | null = null;
  private remove: () => void;
  private disposed = false;
  replace: (() => boolean) | null = null;
  constructor(
    private readonly bridge: SubmissionBridge,
    private readonly threadId: ThreadId,
    private readonly draft: DraftController,
  ) {
    this.remove = bridge.subscribe((reply) => this.accept(reply));
    void this.refresh();
  }
  getSnapshot = (): View => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(change: Partial<View>): void {
    if (this.disposed) return;
    this.view = { ...this.view, ...change };
    for (const cb of this.listeners) cb();
  }
  private accept(reply: SubmissionReply): void {
    if (reply.kind === "failed") {
      this.publish({ message: reply.error.safeMessage });
      return;
    }
    const receipts = reply.kind === "list" ? reply.receipts : [reply.receipt];
    const values = new Map(this.view.receipts.map((r) => [r.submissionId, r]));
    for (const receipt of receipts)
      if (receipt.threadId === this.threadId) {
        const old = values.get(receipt.submissionId);
        values.set(
          receipt.submissionId,
          old ? mergeReceipt(old, receipt) : receipt,
        );
      }
    this.publish({
      receipts: [...values.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 100),
    });
    this.consume();
  }
  consume(): void {
    const captured = this.captured;
    if (!captured) return;
    const receipt = this.view.receipts.find(
      (r) => r.submissionId === captured.submissionId,
    );
    if (receipt?.state === "rejected") {
      this.draft.releaseRejectedSubmission(captured.submissionId);
      this.captured = null;
      return;
    }
    if (
      receipt?.acknowledgedAt &&
      this.replace &&
      this.draft.consumeSubmission(captured, this.replace)
    )
      this.captured = null;
  }
  async refresh(): Promise<void> {
    try {
      this.accept(
        await this.bridge.request({ kind: "list", threadId: this.threadId }),
      );
    } catch {
      this.publish({ message: "提交状态尚未核对。请保留原文，不要重复发送。" });
    }
  }
  async send(delivery: "followUp" | "steer" = "followUp"): Promise<void> {
    if (this.view.sending || this.disposed) return;
    this.publish({ sending: true, message: null });
    const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
    try {
      const captured = await this.draft.captureSubmission(
        submissionId,
        async (value) => {
          if (!value.text.trim()) return false;
          const reply = await this.bridge.request({
            kind: "prepare",
            threadId: this.threadId,
            submissionId,
            traceId: crypto.randomUUID(),
            revision: value.revision,
            text: value.text,
            delivery,
          });
          this.accept(reply);
          return reply.kind === "receipt" && reply.receipt.state === "prepared";
        },
      );
      if (!captured) {
        if (!this.view.message)
          this.publish({ message: "未发送：请检查正文与草稿保存状态。" });
        return;
      }
      this.captured = captured;
      this.accept(
        await this.bridge.request({
          kind: "dispatch",
          threadId: this.threadId,
          submissionId,
        }),
      );
    } catch {
      this.publish({
        message: "发送结果无法确认。原文与提交记录保留，不会自动重发。",
      });
    } finally {
      this.publish({ sending: false });
    }
  }
  // Follow-up text that does not come from the draft (e.g. a late answer to
  // an already default-answered dialog). It travels the same prepare/dispatch
  // pipeline and command policy, but never captures the draft: revision 0
  // marks the non-draft origin and ACK never consumes the editor content.
  async sendText(
    text: string,
    delivery: "followUp" | "steer" = "followUp",
  ): Promise<void> {
    if (this.view.sending || this.disposed) return;
    if (!text.trim()) return;
    this.publish({ sending: true, message: null });
    const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
    try {
      const prepared = await this.bridge.request({
        kind: "prepare",
        threadId: this.threadId,
        submissionId,
        traceId: crypto.randomUUID(),
        revision: 0,
        text,
        delivery,
      });
      this.accept(prepared);
      if (prepared.kind !== "receipt" || prepared.receipt.state !== "prepared")
        return;
      this.accept(
        await this.bridge.request({
          kind: "dispatch",
          threadId: this.threadId,
          submissionId,
        }),
      );
    } catch {
      this.publish({
        message: "追发结果无法确认。原文与提交记录保留，不会自动重发。",
      });
    } finally {
      this.publish({ sending: false });
    }
  }
  async resend(originalId: SubmissionReceipt["submissionId"]): Promise<void> {
    if (this.view.sending || this.disposed) return;
    this.publish({ sending: true, message: null });
    try {
      this.accept(
        await this.bridge.request({
          kind: "resend",
          threadId: this.threadId,
          submissionId: SubmissionIdSchema.parse(crypto.randomUUID()),
          traceId: crypto.randomUUID(),
          originalId,
        }),
      );
    } catch {
      this.publish({ message: "再次发送的结果未知，原文保留，不自动重发。" });
    } finally {
      this.publish({ sending: false });
    }
  }
  async continuePrepared(
    submissionId: SubmissionReceipt["submissionId"],
  ): Promise<void> {
    if (this.view.sending || this.disposed) return;
    const receipt = this.view.receipts.find(
      (value) => value.submissionId === submissionId,
    );
    if (receipt?.state !== "prepared") return;
    this.publish({ sending: true, message: null });
    // The explicit action sends the persisted original. Only reattach draft
    // consumption when it still denotes that exact saved edit; later B is independent.
    const captured = receipt.retryOf
      ? null
      : this.draft.restorePreparedSubmission({
          submissionId,
          revision: receipt.revision,
          text: receipt.text,
        });
    if (captured) this.captured = captured;
    try {
      this.accept(
        await this.bridge.request({
          kind: "dispatch",
          threadId: this.threadId,
          submissionId,
        }),
      );
    } catch {
      this.publish({
        message: "继续发送的结果无法确认，请核对提交状态；不会自动重发。",
      });
    } finally {
      this.publish({ sending: false });
    }
  }
  dispose(): void {
    this.disposed = true;
    this.remove();
    this.listeners.clear();
    this.replace = null;
  }
}
