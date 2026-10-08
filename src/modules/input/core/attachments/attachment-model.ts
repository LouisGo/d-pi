import { createStore } from "zustand/vanilla";
import { createId, type ThreadId } from "../../../../shared/identity";
import type {
  Attachment,
  AttachmentBridge,
  AttachmentFailureReason,
  AttachmentReply,
  AttachmentRequest,
} from "../../contracts/public";

type Intent<
  T = Exclude<
    AttachmentRequest,
    { kind: "history-open" | "history-update" | "history-release" }
  >,
> = T extends AttachmentRequest ? Omit<T, "threadId" | "traceId"> : never;
export type AttachmentIntent = Intent;
export type AttachmentRange = {
  from: number;
  to: number;
  expectedSource?: string;
  valid?: boolean;
};
export interface AttachmentEditorPort {
  insert(item: Attachment, range?: AttachmentRange): boolean;
}
export type AttachmentRequestFailure = {
  command: AttachmentIntent;
  reason: AttachmentFailureReason | null;
  range?: AttachmentRange;
};
type Insertion = { item: Attachment; range?: AttachmentRange };
type State = {
  acceptingSources: boolean;
  pending: number;
  failed: AttachmentRequestFailure | null;
  feedback: AttachmentRequestFailure | null;
  insertions: readonly Insertion[];
  completion: number;
};
const createAttachmentStore = () =>
  createStore<State>(() => ({
    acceptingSources: true,
    pending: 0,
    failed: null,
    feedback: null,
    insertions: [],
    completion: 0,
  }));
export type AttachmentReadiness =
  | { kind: "ready" }
  | {
      kind: "blocked";
      reason: "pending" | "failed-source" | "uninserted-source" | "disposed";
    };

/** Thread-owned operation coordinator. View bindings never own source failures. */
export class AttachmentModel {
  private readonly store = createAttachmentStore();
  readonly stateStore: Pick<
    ReturnType<typeof createAttachmentStore>,
    "getState" | "getInitialState" | "subscribe"
  > = this.store;
  private editor: AttachmentEditorPort | null = null;
  // Bounded read projection of Main operation replies; unknown/restored assets
  // still pass through the authoritative Main preparation gate.
  private readonly assetReadiness = new Map<string, boolean>();
  private disposed = false;
  private readonly cleanupFailures = new Map<
    string,
    AttachmentRequestFailure
  >();
  private sourceFreezes = 0;
  constructor(
    private readonly bridge: AttachmentBridge,
    readonly threadId: ThreadId,
    private readonly createTraceId: () => string = createId,
  ) {}

  freezeSources(): () => void {
    if (this.disposed) return () => {};
    this.sourceFreezes++;
    this.store.setState({ acceptingSources: false });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.sourceFreezes--;
      if (!this.disposed && this.sourceFreezes === 0)
        this.store.setState({ acceptingSources: true });
    };
  }
  getReadiness(ids: readonly string[] = []): AttachmentReadiness {
    const state = this.store.getState();
    if (this.disposed) return { kind: "blocked", reason: "disposed" };
    if (state.pending) return { kind: "blocked", reason: "pending" };
    if (state.failed) return { kind: "blocked", reason: "failed-source" };
    if (state.insertions.length)
      return { kind: "blocked", reason: "uninserted-source" };
    if (ids.some((id) => this.assetReadiness.get(id) === false))
      return { kind: "blocked", reason: "failed-source" };
    return { kind: "ready" };
  }
  attachEditor(editor: AttachmentEditorPort): () => void {
    if (this.disposed) return () => {};
    this.editor = editor;
    this.flushInsertions();
    return () => {
      if (this.editor === editor) this.editor = null;
    };
  }
  insert(item: Attachment, range?: AttachmentRange): void {
    if (
      this.disposed ||
      this.sourceFreezes > 0 ||
      item.threadId !== this.threadId
    )
      return;
    this.store.setState((state) => ({
      insertions: [
        ...state.insertions.filter((entry) => entry.item.id !== item.id),
        { item, ...(range ? { range } : {}) },
      ],
    }));
    this.flushInsertions();
  }
  removeInsertion(id: string): void {
    if (!this.disposed)
      this.store.setState((state) => ({
        insertions: state.insertions.filter((entry) => entry.item.id !== id),
      }));
  }
  flushInsertions(): void {
    if (!this.editor || this.disposed) return;
    const pending = this.store.getState().insertions;
    const remaining = pending.filter(
      ({ item, range }) => !this.editor?.insert(item, range),
    );
    if (remaining.length !== pending.length)
      this.store.setState({ insertions: remaining });
  }
  removeFailure(): void {
    if (
      this.disposed ||
      this.store.getState().failed?.command.kind === "clipboard-discard"
    )
      return;
    this.store.setState({
      failed: this.cleanupFailures.values().next().value ?? null,
    });
  }
  dismissFeedback(): void {
    if (!this.disposed) this.store.setState({ feedback: null });
  }
  retryFailure(): Promise<AttachmentReply | null> {
    const failed = this.store.getState().failed;
    return failed
      ? this.run(failed.command, true, failed.range, failed)
      : Promise.resolve(null);
  }
  async run(
    command: AttachmentIntent,
    add = false,
    range?: AttachmentRange,
    retryingFailure?: AttachmentRequestFailure,
  ): Promise<AttachmentReply | null> {
    const cleanup = command.kind === "clipboard-discard";
    const cleanupKey = cleanup ? [...command.ids].sort().join(",") : "";
    const blocking =
      command.kind === "choose-import" || command.kind === "add-reference";
    const state = this.store.getState();
    if (
      this.disposed ||
      (this.sourceFreezes > 0 && !cleanup) ||
      (command.kind === "clipboard-import" && this.cleanupFailures.size > 0) ||
      (blocking &&
        (state.pending > 0 ||
          (state.failed && state.failed !== retryingFailure)))
    )
      return null;
    this.store.setState({ pending: state.pending + 1, feedback: null });
    const reject = (reason: AttachmentFailureReason | null) => {
      const failure = { command, reason, ...(range ? { range } : {}) };
      // Byte imports retain the actual File for retry in their source adapter.
      if (command.kind === "import-bytes") return;
      if (cleanup) {
        this.cleanupFailures.set(cleanupKey, failure);
        const previous = this.store.getState().failed;
        if (!previous || previous === retryingFailure)
          this.store.setState({ failed: failure });
        return;
      }
      this.store.setState(
        blocking ? { failed: failure } : { feedback: failure },
      );
    };
    try {
      const reply = await this.bridge.request({
        ...command,
        threadId: this.threadId,
        traceId: this.createTraceId(),
      });
      if (this.disposed) {
        if (reply.kind === "clipboard-imported")
          void this.bridge
            .request({
              kind: "clipboard-discard",
              threadId: this.threadId,
              traceId: this.createTraceId(),
              ids: reply.items.map((item) => item.id),
            })
            .catch(() => {});
        return null;
      }
      if (cleanup) {
        if (reply.kind === "cancelled") {
          this.cleanupFailures.delete(cleanupKey);
          const previous = this.store.getState().failed;
          if (
            previous?.command.kind === "clipboard-discard" &&
            [...previous.command.ids].sort().join(",") === cleanupKey
          )
            this.store.setState({
              failed: this.cleanupFailures.values().next().value ?? null,
            });
        } else reject(reply.kind === "unavailable" ? reply.reason : null);
        return reply;
      }
      if (reply.kind === "attachments" || reply.kind === "clipboard-imported") {
        for (const item of reply.items) {
          if (item.threadId !== this.threadId) continue;
          this.assetReadiness.delete(item.id);
          this.assetReadiness.set(
            item.id,
            item.status === "ready" &&
              (item.coverageGaps.length === 0 || item.textOnly),
          );
          if (this.assetReadiness.size > 128) {
            const oldest = this.assetReadiness.keys().next().value;
            if (oldest) this.assetReadiness.delete(oldest);
          }
        }
        if (add) for (const item of reply.items) this.insert(item, range);
        if (retryingFailure && this.store.getState().failed === retryingFailure)
          this.store.setState({
            failed: this.cleanupFailures.values().next().value ?? null,
          });
        this.store.setState((current) => ({
          completion: current.completion + 1,
        }));
      } else if (reply.kind === "storage-report") {
        this.store.setState((current) => ({
          completion: current.completion + 1,
        }));
      } else if (reply.kind === "unavailable" && command.kind !== "preview")
        reject(reply.reason);
      return reply;
    } catch {
      if (!this.disposed) reject(null);
      return null;
    } finally {
      if (!this.disposed)
        this.store.setState((current) => ({ pending: current.pending - 1 }));
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.editor = null;
    this.assetReadiness.clear();
    this.cleanupFailures.clear();
  }
}
