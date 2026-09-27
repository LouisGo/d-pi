import { match } from "ts-pattern";
import type { Draft, Failure, SaveReply } from "../../shared/contracts";
export type SaveState =
  | { kind: "saved" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "failed"; error: Failure };
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
  constructor(
    private readonly draft: Draft,
    private readonly save: SavePort,
    private readonly onTransportError: () => Failure,
  ) {
    this.revision = draft.revision;
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
    // A failure requires explicit retry; editing must not hide it or retry unknown writes.
    if (this.state.kind === "failed") return;
    this.publish({ kind: "dirty" });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, 300);
  }
  retry(): Promise<boolean> {
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
    if (this.flight) return this.flight;
    if (this.state.kind === "failed") return Promise.resolve(false);
    this.flight = this.drain().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  private async drain(): Promise<boolean> {
    while (this.pending && this.confirmed < this.sequence) {
      const snapshot = this.pending;
      this.publish({ kind: "saving" });
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
          this.confirmed = snapshot.sequence;
          return true;
        })
        .with({ kind: "failed" }, ({ error }) => {
          this.publish({ kind: "failed", error });
          return false;
        })
        .exhaustive();
      if (!saved) return false;
    }
    this.pending = null;
    this.publish({ kind: "saved" });
    return true;
  }
  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}
