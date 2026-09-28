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
        // A delayed request reply cannot roll an observed ACK or failure backwards.
        if (
          old &&
          (old.updatedAt > receipt.updatedAt ||
            (old.acknowledgedAt && !receipt.acknowledgedAt))
        )
          continue;
        values.set(receipt.submissionId, receipt);
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
    if (!captured || !this.replace) return;
    const receipt = this.view.receipts.find(
      (r) => r.submissionId === captured.submissionId,
    );
    if (
      receipt?.acknowledgedAt &&
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
  async send(): Promise<void> {
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
  dispose(): void {
    this.disposed = true;
    this.remove();
    this.listeners.clear();
    this.replace = null;
  }
}
