import { createStore } from "zustand/vanilla";
import { createId, type ThreadId } from "../../../../shared/identity";
import { uiMessage } from "../../../../shared/messages/contracts";
import type {
  AttachmentBridge,
  AttachmentReply,
  AttachmentRequest,
  Failure,
} from "../../contracts/public";

class HistoryRequestError extends Error {
  constructor(readonly failure: Failure) {
    super(failure.causeCode);
  }
}

type Cleanup = {
  leaseId?: string;
  ids: Set<string>;
  revision: number;
  queued: boolean;
  failed: boolean;
  error?: Failure;
};
type State = { pending: boolean; failed: boolean; limited: boolean };
/** Headless editor epoch. It stores dependency IDs, never a second draft body. */
export class EditorHistoryModel {
  private readonly store = createStore<State>(() => ({
    pending: false,
    failed: false,
    limited: false,
  }));
  readonly stateStore: Pick<
    typeof this.store,
    "getState" | "getInitialState" | "subscribe"
  > = this.store;
  private epoch = createId();
  private ids = new Set<string>();
  // Cleanup candidates/current-body projection, never another editable body.
  private cleanupIds = new Set<string>();
  private currentIds = new Set<string>();
  private readonly cleanups = new Map<string, Cleanup>();
  private updateFailed = false;
  private updateError: Failure | undefined;
  private pending = 0;
  private leaseId: string | null = null;
  private version = 0;
  private generation = 0;
  private tail: Promise<void> = Promise.resolve();
  private disposed = false;
  private completed = false;
  constructor(
    private readonly bridge: AttachmentBridge,
    readonly threadId: ThreadId,
    private readonly clearHistory: () => void,
    private readonly readCurrentIds?: () => Iterable<string>,
  ) {}
  failure(): Failure | undefined {
    return (
      this.updateError ??
      [...this.cleanups.values()].find((cleanup) => cleanup.failed)?.error
    );
  }
  private async request(
    command: AttachmentRequest,
    expected: AttachmentReply["kind"],
  ): Promise<AttachmentReply> {
    let reason = "attachment-transport-unavailable";
    let observedAt: Failure["observedAt"] = "renderer";
    try {
      const reply = await this.bridge.request(command);
      if (reply.kind === "history-limit") return reply;
      if (
        reply.kind === expected &&
        !(
          command.kind === "history-update" &&
          reply.kind === "history-lease" &&
          (reply.version < command.version || reply.leaseId !== command.leaseId)
        )
      )
        return reply;
      observedAt = "main";
      reason =
        reply.kind === "unavailable"
          ? reply.reason
          : "attachment-invalid-reply";
    } catch {
      // The operation's trace was created before IPC, so transport failure also
      // keeps its actual request identity instead of a synthetic save trace.
    }
    throw new HistoryRequestError({
      errorId: createId(),
      traceId: command.traceId,
      code:
        observedAt === "main" ? "storage-unavailable" : "transport-unavailable",
      category:
        reason === "reference-denied"
          ? "permission"
          : observedAt === "main"
            ? "storage"
            : "transport",
      observedAt,
      reportedBy: observedAt === "main" ? "app" : "unknown",
      attribution: "unknown",
      handlingOwner: "draft",
      recovery: "retry_safe",
      causeCode: reason,
      message: uiMessage("attachment.historyLeaseFailed"),
    });
  }
  private publish(): void {
    this.store.setState({
      pending: this.pending > 0,
      failed:
        this.updateFailed ||
        [...this.cleanups.values()].some((cleanup) => cleanup.failed),
    });
  }
  ready(): boolean {
    const state = this.store.getState();
    return (
      (!this.disposed || this.completed) && !state.pending && !state.failed
    );
  }
  observe(ids: Iterable<string>): void {
    if (this.disposed) return;
    let changed = false;
    for (const id of ids)
      if (!this.ids.has(id)) {
        this.ids.add(id);
        this.cleanupIds.add(id);
        changed = true;
      }
    if (!changed) return;
    if (this.ids.size > 128) {
      this.limit();
      return;
    }
    this.enqueue();
  }
  removeDependencies(ids: Iterable<string>): void {
    if (this.disposed) return;
    let changed = false;
    for (const id of ids) if (this.ids.delete(id)) changed = true;
    if (changed) this.enqueue();
  }
  private limit(): void {
    this.clearHistory();
    this.store.setState({ limited: true });
  }
  private enqueue(): void {
    const generation = this.generation;
    const version = ++this.version;
    const ids = [...this.ids];
    this.pending++;
    this.publish();
    this.tail = this.tail.then(async () => {
      try {
        if (this.disposed || generation !== this.generation) return;
        if (!this.leaseId) {
          const opened = await this.request(
            {
              kind: "history-open",
              threadId: this.threadId,
              traceId: createId(),
              epoch: this.epoch,
            },
            "history-lease",
          );
          if (this.disposed || generation !== this.generation) {
            if (opened.kind === "history-lease")
              this.addCleanup(opened.leaseId, ids);
            return;
          }
          if (opened.kind === "history-lease") this.leaseId = opened.leaseId;
          else if (opened.kind === "history-limit") {
            this.limit();
            return;
          } else throw Error("Editor history unavailable");
        }
        const reply = await this.request(
          {
            kind: "history-update",
            threadId: this.threadId,
            traceId: createId(),
            leaseId: this.leaseId,
            version,
            ids,
          },
          "history-lease",
        );
        if (this.disposed || generation !== this.generation) return;
        if (reply.kind === "history-limit") {
          this.limit();
          return;
        }
        if (reply.kind !== "history-lease" || reply.version < version)
          throw Error("Editor history not protected");
        this.updateFailed = false;
        this.updateError = undefined;
      } catch (error) {
        if (!this.disposed && generation === this.generation) {
          this.updateFailed = true;
          if (error instanceof HistoryRequestError) {
            this.updateError = error.failure;
            if (
              error.failure.causeCode === "history-lease-expired" ||
              error.failure.causeCode === "reference-denied"
            )
              this.leaseId = null;
          }
        }
      } finally {
        this.pending--;
        this.publish();
      }
    });
  }
  async ensure(): Promise<boolean> {
    for (;;) {
      const pending = this.tail;
      await pending;
      if (pending === this.tail) return this.ready();
    }
  }
  async retry(): Promise<boolean> {
    await this.ensure();
    // Retire the dependency on Main before releasing its cleanup candidate.
    if (this.updateFailed) this.enqueue();
    for (const [key, cleanup] of this.cleanups)
      this.enqueueCleanup(key, cleanup);
    return this.ensure();
  }
  private protectedIds(): Set<string> {
    // Latest current body plus this epoch's conservative Undo/Redo superset,
    // including IDs whose Main update is still pending or failed.
    return new Set([
      ...(this.readCurrentIds?.() ?? this.currentIds),
      ...this.ids,
    ]);
  }
  private addCleanup(leaseId: string | undefined, ids: Iterable<string>): void {
    const key = leaseId ?? "candidates";
    const cleanup = this.cleanups.get(key) ?? {
      ...(leaseId ? { leaseId } : {}),
      ids: new Set<string>(),
      revision: 0,
      queued: false,
      failed: false,
    };
    for (const id of ids) cleanup.ids.add(id);
    cleanup.revision++;
    this.cleanups.set(key, cleanup);
    this.enqueueCleanup(key, cleanup);
  }
  private enqueueCleanup(key: string, cleanup: Cleanup): void {
    if (cleanup.queued) return;
    cleanup.queued = true;
    this.pending++;
    this.publish();
    this.tail = this.tail.then(async () => {
      try {
        for (;;) {
          if (this.updateError) throw new HistoryRequestError(this.updateError);
          if (this.updateFailed)
            throw Error("Editor history update not acknowledged");
          const revision = cleanup.revision;
          const ids = [...cleanup.ids];
          for (let start = 0; start < Math.max(1, ids.length); start += 80000) {
            const reply = await this.request(
              {
                kind: "history-release",
                threadId: this.threadId,
                traceId: createId(),
                ...(start === 0 && cleanup.leaseId
                  ? { leaseId: cleanup.leaseId }
                  : {}),
                releaseIds: ids.slice(start, start + 80000),
                retainIds: [...this.protectedIds()],
              },
              "history-released",
            );
            if (reply.kind !== "history-released")
              throw Error("Editor history release unavailable");
          }
          // A reset while IPC awaited may have added another cleanup intent.
          // Replay idempotently with its latest dependencies before clearing it.
          if (revision !== cleanup.revision) continue;
          const retained = this.protectedIds();
          for (const id of ids)
            if (!retained.has(id)) this.cleanupIds.delete(id);
          this.cleanups.delete(key);
          break;
        }
      } catch (error) {
        cleanup.failed = true;
        if (error instanceof HistoryRequestError) cleanup.error = error.failure;
      } finally {
        cleanup.queued = false;
        this.pending--;
        this.publish();
      }
    });
  }
  reset(retainIds: Iterable<string> = []): void {
    this.generation++;
    this.epoch = createId();
    this.version = 0;
    this.ids = new Set();
    this.currentIds = new Set(retainIds);
    for (const id of this.currentIds) this.cleanupIds.add(id);
    const leaseId = this.leaseId ?? undefined;
    this.leaseId = null;
    // The ended epoch needs no update retry. Unfinished cleanups, including its
    // real Main lease ID, remain independent until Main actually releases them.
    this.updateFailed = false;
    this.updateError = undefined;
    if (leaseId || this.cleanupIds.size)
      this.addCleanup(leaseId, this.cleanupIds);
    for (const [key, cleanup] of this.cleanups)
      this.enqueueCleanup(key, cleanup);
    this.publish();
  }
  adopt(
    candidates: Iterable<string>,
    currentIds: Iterable<string>,
    epochIds: Iterable<string>,
  ): void {
    this.currentIds = new Set(currentIds);
    for (const id of candidates) this.cleanupIds.add(id);
    this.observe(epochIds);
    if (this.cleanupIds.size) this.addCleanup(undefined, this.cleanupIds);
  }
  finish(): boolean {
    if (this.pending || this.cleanups.size || this.leaseId || this.ids.size)
      return false;
    this.completed = true;
    this.disposed = true;
    return true;
  }
  dispose(retainIds: Iterable<string> = []): void {
    if (this.disposed) return;
    this.reset(retainIds);
    this.disposed = true;
  }
}
