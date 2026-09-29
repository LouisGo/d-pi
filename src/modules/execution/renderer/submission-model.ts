import { match } from "ts-pattern";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore, type StateCreator } from "zustand/vanilla";
import type { ThreadId } from "../../../shared/identity";
import { type UiMessage, uiMessage } from "../../../shared/messages/contracts";
import type { CapturedDraft, DraftController } from "../../input/core/public";
import {
  type SubmissionBridge,
  SubmissionIdSchema,
  type SubmissionReceipt,
  type SubmissionReply,
} from "../contracts/public";

export interface SubmissionView {
  sending: boolean;
  sendingText: boolean;
  receipts: SubmissionReceipt[];
  message: UiMessage | null;
}
// The published view is the whole store state: every publication is a partial
// update that zustand shallow merges into the current view (see `publish`).
const submissionInitial: StateCreator<
  SubmissionView,
  [],
  [["zustand/subscribeWithSelector", never]]
> = () => ({
  sending: false,
  sendingText: false,
  receipts: [],
  message: null,
});
const createSubmissionStore = () =>
  createStore<SubmissionView>()(subscribeWithSelector(submissionInitial));
export type SubmissionStore = ReturnType<typeof createSubmissionStore>;
export type SubmissionStateStore = Pick<
  SubmissionStore,
  "getState" | "getInitialState" | "subscribe"
>;
// Receipt facts advance independently: a late ACK can resolve call confirmation,
// but cannot erase an observed failure/uncertain outcome. Millisecond wall-clock
// timestamps are display metadata, not a causal ordering of IPC replies/events.
// Exported for the monotonic transition lock (A3 audit rebuttal).
export function mergeReceipt(
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
  // Vanilla store, no React binding. React receives the read-only store API
  // through `stateStore` and binds it with Zustand's official `useStore` hook.
  private readonly store: SubmissionStore = createSubmissionStore();
  readonly stateStore: SubmissionStateStore = this.store;
  private captured: CapturedDraft | null = null;
  private remove: () => void;
  private disposed = false;
  private editorAdapter: { replace: () => boolean } | null = null;
  constructor(
    private readonly bridge: SubmissionBridge,
    private readonly threadId: ThreadId,
    private readonly draft: DraftController,
  ) {
    this.remove = bridge.subscribe((reply) => this.accept(reply));
    void this.refresh();
  }
  /**
   * Live read of the published view. Every former `this.view` read resolves to
   * the current store value at the same point in time as before.
   */
  private get view(): SubmissionView {
    return this.store.getState();
  }
  getSnapshot = (): SubmissionView => this.store.getState();
  subscribe = (listener: () => void): (() => void) =>
    this.store.subscribe(
      (state) => state,
      () => listener(),
    );
  /**
   * Fine grained subscription for one projection of the view, e.g. a single
   * receipt. Plain `subscribe` still fires for every published change.
   */
  subscribeTo<Selection>(
    selector: (state: SubmissionView) => Selection,
    listener: () => void,
  ): () => void {
    return this.store.subscribe(selector, () => listener());
  }
  private publish(change: Partial<SubmissionView>): void {
    if (this.disposed) return;
    // Default shallow merge keeps the former partial update: the fields not
    // named in `change` stay as they are.
    this.store.setState(change);
  }
  private accept(reply: SubmissionReply): void {
    if (this.disposed) return;
    if (reply.kind === "failed") {
      this.publish({ message: reply.error.message });
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
  attachEditor(replace: () => boolean): () => void {
    if (this.disposed) return () => {};
    const adapter = { replace };
    this.editorAdapter = adapter;
    this.consume();
    return () => {
      if (this.editorAdapter === adapter) this.editorAdapter = null;
    };
  }
  consume(): void {
    if (this.disposed) return;
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
    const replace = this.editorAdapter?.replace;
    if (
      receipt?.acknowledgedAt &&
      replace &&
      this.draft.consumeSubmission(captured, replace)
    )
      this.captured = null;
  }
  async refresh(): Promise<void> {
    if (this.disposed) return;
    try {
      this.accept(
        await this.bridge.request({ kind: "list", threadId: this.threadId }),
      );
    } catch {
      this.publish({ message: uiMessage("submission.stateUnverified") });
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
          this.publish({ message: uiMessage("submission.unsentDraft") });
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
        message: uiMessage("submission.sendUnknown"),
      });
    } finally {
      this.publish({ sending: false });
    }
  }
  // Follow-up text that does not come from the draft (e.g. a late answer to
  // an already default-answered dialog). It travels the same prepare/dispatch
  // pipeline and command policy, but never captures the draft: origin "free"
  // marks the non-draft provenance (no draft/revision gate, no editor
  // consumption on ACK). The result is reported honestly so the caller can
  // distinguish "queued for dispatch" from queue-full/not-ready/unknown.
  async sendText(
    text: string,
    delivery: "followUp" | "steer" = "followUp",
  ): Promise<{
    ok: boolean;
    message: UiMessage | null;
    submissionId: string | null;
  }> {
    // Free-text channel has its own in-flight flag so a draft send does not
    // misleadingly fail a card follow-up (and vice versa). Different
    // submissionIds are independent in Main/Host; the queue cap still gates.
    if (this.view.sendingText || this.disposed)
      return {
        ok: false,
        message: uiMessage("submission.followUpPending"),
        submissionId: null,
      };
    if (!text.trim()) return { ok: false, message: null, submissionId: null };
    this.publish({ sendingText: true, message: null });
    const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
    let preparedOk = false;
    try {
      const prepared = await this.bridge.request({
        kind: "prepare",
        threadId: this.threadId,
        submissionId,
        traceId: crypto.randomUUID(),
        revision: 0,
        text,
        delivery,
        origin: "free",
      });
      this.accept(prepared);
      if (prepared.kind !== "receipt" || prepared.receipt.state !== "prepared")
        return { ok: false, message: this.view.message, submissionId: null };
      preparedOk = true;
      const dispatched = await this.bridge.request({
        kind: "dispatch",
        threadId: this.threadId,
        submissionId,
      });
      this.accept(dispatched);
      const ok =
        dispatched.kind === "receipt" &&
        dispatched.receipt.state === "dispatching";
      // The receipt identity is returned whenever prepare succeeded so the
      // caller renders the formal pipeline (dispatching/acknowledged/
      // rejected/unknown) instead of a local boolean. dispatching is not
      // acceptance; late Host events update the same receipt via subscription.
      // Only prepare-stage failures (no receipt) return null.
      return {
        ok,
        message: ok ? null : this.view.message,
        submissionId,
      };
    } catch {
      this.publish({
        message: uiMessage("submission.followUpUnknown"),
      });
      return {
        ok: false,
        message: this.view.message,
        submissionId: preparedOk ? submissionId : null,
      };
    } finally {
      this.publish({ sendingText: false });
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
      this.publish({ message: uiMessage("submission.resendUnknown") });
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
        message: uiMessage("submission.continueUnknown"),
      });
    } finally {
      this.publish({ sending: false });
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.remove();
    this.remove = () => {};
    this.editorAdapter = null;
  }
}
