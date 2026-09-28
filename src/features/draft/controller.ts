import { match } from "ts-pattern";
import { DRAFT_MAX_BYTES, draftByteLength } from "../../shared/draft-text";
import type { Draft, Failure, SaveReply } from "./contracts";
export type SaveState =
  | { kind: "saved" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "checking" }
  | { kind: "conflict"; stored: Draft; localText: string }
  | { kind: "failed"; error: Failure };
export interface CapturedDraft {
  submissionId: string;
  sequence: number;
  revision: number;
  text: string;
}
type SavePort = (expectedRevision: number, text: string) => Promise<SaveReply>;
// Only pending immutable snapshots live here. Tiptap remains the editable-body owner.
export class DraftController {
  private state: SaveState = { kind: "saved" };
  private readonly listeners = new Set<() => void>();
  private revision: number;
  private sequence = 0;
  private confirmed = 0;
  private pending: { sequence: number; text: string } | null = null;
  private flight: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private baselineText: string;
  private capture: {
    submissionId: string;
    sequence: number;
    text: string;
    prepare: (value: CapturedDraft) => Promise<boolean>;
    finish: (value: CapturedDraft | null) => void;
  } | null = null;
  private captured: CapturedDraft | null = null;
  private attempted: {
    revision: number;
    sequence: number;
    text: string;
  } | null = null;
  constructor(
    private readonly draft: Draft,
    private readonly save: SavePort,
    private readonly onTransportError: () => Failure,
  ) {
    this.revision = draft.revision;
    this.baselineText = draft.text;
  }
  getSnapshot = (): SaveState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(state: SaveState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  edit(text: string): void {
    if (this.disposed) return;
    this.pending = { sequence: ++this.sequence, text };
    if (this.state.kind === "checking") return;
    if (this.state.kind === "conflict") {
      this.publish({ ...this.state, localText: text });
      return;
    }
    // A failure requires explicit retry; editing must not hide it or retry unknown writes.
    if (
      this.state.kind === "failed" &&
      this.state.error.code !== "content-too-large"
    )
      return;
    if (!this.checkSize(text)) return;
    this.publish({ kind: "dirty" });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, 300);
  }
  retry(): Promise<boolean> {
    if (this.state.kind === "checking" || this.state.kind === "conflict")
      return Promise.resolve(false);
    if (
      this.state.kind === "failed" &&
      this.state.error.recovery === "reconcile_first"
    )
      return Promise.resolve(false);
    this.publish({ kind: "dirty" });
    return this.flush();
  }
  flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.flight)
      return this.flight.then((saved) => {
        // A consumer may edit after drain returns but before its finally clears flight.
        // A close/submit flush must also cover that edit, not report an old success.
        return saved && this.pending && this.confirmed < this.sequence
          ? this.flush()
          : saved;
      });
    if (
      this.state.kind === "failed" ||
      this.state.kind === "checking" ||
      this.state.kind === "conflict"
    )
      return Promise.resolve(false);
    this.flight = this.drain().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  private async drain(): Promise<boolean> {
    while (this.capture || (this.pending && this.confirmed < this.sequence)) {
      const capture = this.capture;
      if (capture && this.confirmed === capture.sequence) {
        const value: CapturedDraft = {
          submissionId: capture.submissionId,
          sequence: capture.sequence,
          revision: this.revision,
          text: capture.text,
        };
        try {
          const prepared = await capture.prepare(value);
          if (prepared) this.captured = value;
          capture.finish(prepared ? value : null);
        } catch {
          capture.finish(null);
        }
        this.capture = null;
        continue;
      }
      const snapshot = capture ?? this.pending;
      if (!snapshot) break;
      if (!this.checkSize(snapshot.text)) return false;
      this.publish({ kind: "saving" });
      this.attempted = { ...snapshot, revision: this.revision };
      let result: SaveReply;
      try {
        result = await this.save(this.revision, snapshot.text);
      } catch {
        result = { kind: "failed", error: this.onTransportError() };
      }
      const saved = match(result)
        .with({ kind: "saved" }, ({ threadId, revision }) => {
          if (
            threadId !== this.draft.threadId ||
            revision !== this.revision + 1
          ) {
            this.publish({ kind: "failed", error: this.onTransportError() });
            return false;
          }
          this.revision = revision;
          this.baselineText = snapshot.text;
          this.attempted = null;
          this.confirmed = snapshot.sequence;
          return true;
        })
        .with({ kind: "failed" }, ({ error }) => {
          this.publish({ kind: "failed", error });
          return false;
        })
        .exhaustive();
      if (!saved) {
        this.capture?.finish(null);
        this.capture = null;
        return false;
      }
    }
    this.pending = null;
    this.publish({ kind: "saved" });
    return true;
  }
  async reconcile(
    read: () => Promise<
      { kind: "snapshot"; draft: Draft } | { kind: "failed"; error: Failure }
    >,
  ): Promise<void> {
    if (this.flight || this.disposed || this.state.kind !== "failed") return;
    const previous = this.state;
    clearTimeout(this.timer);
    this.publish({ kind: "checking" });
    try {
      const reply = await read();
      if (this.disposed) return;
      if (reply.kind === "failed") {
        this.publish({
          kind: "failed",
          error: { ...reply.error, recovery: "reconcile_first" },
        });
        return;
      }
      const stored = reply.draft;
      if (
        stored.threadId !== this.draft.threadId ||
        stored.workspaceId !== this.draft.workspaceId ||
        stored.directory !== this.draft.directory
      ) {
        this.publish(previous);
        return;
      }
      const attempt = this.attempted;
      const committed =
        attempt &&
        stored.revision === attempt.revision + 1 &&
        stored.text === attempt.text;
      const consumedBaseline =
        this.captured &&
        stored.consumedBy === this.captured.submissionId &&
        stored.revision === this.captured.revision &&
        stored.text === "" &&
        this.baselineText === this.captured.text;
      const unchanged =
        stored.revision === this.revision &&
        (stored.text === this.baselineText || consumedBaseline);
      if (!committed && !unchanged) {
        this.publish({
          kind: "conflict",
          stored,
          localText: this.pending?.text ?? this.baselineText,
        });
        return;
      }
      this.revision = stored.revision;
      this.baselineText = stored.text;
      if (committed) this.confirmed = attempt.sequence;
      this.attempted = null;
      this.publish({ kind: "dirty" });
      await this.flush();
    } catch {
      this.publish(previous);
    }
  }
  keepLocal(): Promise<boolean> {
    if (this.state.kind !== "conflict" || this.disposed)
      return Promise.resolve(false);
    this.revision = this.state.stored.revision;
    this.baselineText = this.state.stored.text;
    this.attempted = null;
    this.publish({ kind: "dirty" });
    return this.flush();
  }
  useStored(replace: (text: string) => boolean): boolean {
    if (this.state.kind !== "conflict" || this.disposed) return false;
    const stored = this.state.stored;
    if (!replace(stored.text)) return false;
    this.revision = stored.revision;
    this.baselineText = stored.text;
    this.attempted = null;
    this.pending = null;
    this.confirmed = this.sequence;
    this.publish({ kind: "saved" });
    return true;
  }
  private checkSize(text: string): boolean {
    if (draftByteLength(text) <= DRAFT_MAX_BYTES) return true;
    clearTimeout(this.timer);
    this.publish({
      kind: "failed",
      error: {
        errorId: crypto.randomUUID(),
        traceId: crypto.randomUUID(),
        code: "content-too-large",
        category: "validation",
        observedAt: "renderer",
        reportedBy: "app",
        attribution: "unknown",
        handlingOwner: "draft",
        recovery: "user_action",
        safeMessage:
          "正文超过 UTF-8 4 MiB，尚未保存。内容仍保留在编辑区，请复制备份或缩减后继续保存。",
      },
    });
    return false;
  }
  captureSubmission(
    id: string,
    prepare: (value: CapturedDraft) => Promise<boolean>,
  ): Promise<CapturedDraft | null> {
    if (
      this.disposed ||
      this.capture ||
      this.captured?.sequence === this.sequence ||
      this.state.kind === "failed" ||
      this.state.kind === "checking" ||
      this.state.kind === "conflict"
    )
      return Promise.resolve(null);
    const text = this.pending?.text ?? this.baselineText;
    if (!this.checkSize(text)) return Promise.resolve(null);
    const result = new Promise<CapturedDraft | null>((finish) => {
      this.capture = {
        submissionId: id,
        sequence: this.sequence,
        text,
        prepare,
        finish,
      };
    });
    // Join the same save lane. Preparing the frozen record is a barrier before B saves.
    void this.flush().then(() => {
      if (this.capture && !this.disposed) void this.flush();
    });
    return result;
  }
  releaseRejectedSubmission(submissionId: string): void {
    if (this.captured?.submissionId === submissionId) this.captured = null;
  }
  consumeSubmission(value: CapturedDraft, replace: () => boolean): boolean {
    if (
      this.disposed ||
      this.captured?.submissionId !== value.submissionId ||
      this.sequence !== this.captured.sequence
    )
      return false;
    // The editor adapter returns false while IME composition prevents replacement.
    if (!replace()) return false;
    this.edit("");
    return true;
  }
  dispose(): void {
    this.disposed = true;
    this.capture?.finish(null);
    this.capture = null;
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}
