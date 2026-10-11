import { createStore, type StoreApi } from "zustand/vanilla";
import type { NotificationPreferences } from "../../../modules/preferences/contracts/public";
import type { ThreadContext } from "../../../modules/threads/contracts/public";
import type {
  ActivationOutcome,
  AttentionBridge,
  AttentionCommand,
  AttentionEntry,
  AttentionSnapshot,
} from "../../contracts/attention";

type AttentionState = {
  snapshot: AttentionSnapshot | null;
  byThread: ReadonlyMap<string, AttentionEntry>;
  failed: boolean;
  saving: boolean;
};
export type AttentionLocation = AttentionEntry & { activationId?: string };
/** Main owns all facts. This client mirrors the latest sample; it has no event derivation or retries. */
export class AttentionModel {
  private readonly store = createStore<AttentionState>(() => ({
    snapshot: null,
    byThread: new Map(),
    failed: false,
    saving: false,
  }));
  readonly stateStore: Pick<
    StoreApi<AttentionState>,
    "getState" | "getInitialState" | "subscribe"
  > = this.store;
  private readonly location = createStore<{
    target: AttentionLocation | null;
    completed: {
      threadId: AttentionEntry["threadId"];
      outcome: ActivationOutcome;
    } | null;
  }>(() => ({ target: null, completed: null }));
  readonly locationStore: Pick<
    StoreApi<{
      target: AttentionLocation | null;
      completed: {
        threadId: AttentionEntry["threadId"];
        outcome: ActivationOutcome;
      } | null;
    }>,
    "getState" | "getInitialState" | "subscribe"
  > = this.location;
  private disposed = false;
  private readonly rendererId = crypto.randomUUID();
  private readiness = Promise.resolve(true);
  private rendererReady = false;
  private desiredReady: boolean | null = null;
  private pendingCompletion: { id: string; outcome: ActivationOutcome } | null =
    null;
  private started = false;
  private stop: (() => void) | null = null;
  private streamRevision = 0;
  private readonly retiredInstances = new Set<string>();
  private visibleThread: ThreadContext["threadId"] | null | undefined;
  constructor(private readonly bridge?: AttentionBridge) {}
  get available() {
    return this.bridge !== undefined;
  }
  async start(): Promise<void> {
    if (this.started || this.disposed || !this.bridge) return;
    this.started = true;
    this.stop = this.bridge.subscribe((snapshot) => {
      if (this.disposed) return;
      this.streamRevision++;
      this.accept(snapshot);
    });
    await this.refresh();
  }
  private accept(snapshot: AttentionSnapshot) {
    if (this.disposed) return;
    const previous = this.stateStore.getState();
    if (this.retiredInstances.has(snapshot.instanceId)) return;
    if (
      previous.snapshot?.instanceId === snapshot.instanceId &&
      previous.snapshot.revision >= snapshot.revision
    ) {
      if (previous.snapshot.revision === snapshot.revision)
        this.store.setState({ failed: false });
      return;
    }
    if (
      previous.snapshot &&
      previous.snapshot.instanceId !== snapshot.instanceId
    )
      this.retiredInstances.add(previous.snapshot.instanceId);
    const byThread = new Map<string, AttentionEntry>();
    for (const entry of snapshot.entries) {
      const old = previous.byThread.get(entry.threadId);
      byThread.set(
        entry.threadId,
        old &&
          old.eventId === entry.eventId &&
          old.traceId === entry.traceId &&
          old.kind === entry.kind &&
          old.unread === entry.unread
          ? old
          : entry,
      );
    }
    this.store.setState({ snapshot, byThread, failed: false });
  }
  private async command(command: AttentionCommand): Promise<boolean> {
    if (this.disposed || !this.bridge) return false;
    const streamRevision = this.streamRevision;
    try {
      const reply = await this.bridge.request(command);
      if (this.disposed) return false;
      if (reply.kind === "failed") this.store.setState({ failed: true });
      else if (
        streamRevision === this.streamRevision ||
        reply.snapshot.instanceId ===
          this.stateStore.getState().snapshot?.instanceId
      )
        this.accept(reply.snapshot);
      return reply.kind === "snapshot";
    } catch {
      if (!this.disposed) this.store.setState({ failed: true });
      return false;
    }
  }
  async refresh() {
    if (
      !(await this.command({ kind: "snapshot", traceId: crypto.randomUUID() }))
    )
      return;
    if (
      this.desiredReady !== null &&
      this.desiredReady !== this.rendererReady
    ) {
      if (!(await this.activationReady(this.desiredReady))) return;
    }
    const completion = this.pendingCompletion;
    if (!completion || !this.rendererReady) return;
    if (this.stateStore.getState().snapshot?.openRequest?.id === completion.id)
      await this.opened(completion.id, completion.outcome);
    else this.pendingCompletion = null;
  }
  visible(threadId: ThreadContext["threadId"] | null, force = false) {
    if (!force && threadId === this.visibleThread) return Promise.resolve();
    this.visibleThread = threadId;
    return this.command({
      kind: "visible",
      traceId: crypto.randomUUID(),
      threadId,
    });
  }
  seen(entry: AttentionEntry) {
    return this.command({
      kind: "seen",
      traceId: crypto.randomUUID(),
      threadId: entry.threadId,
      eventId: entry.eventId,
    });
  }
  activationReady(ready: boolean) {
    this.desiredReady = ready;
    this.readiness = this.readiness.then(async () => {
      const accepted = await this.command({
        kind: "activation-ready",
        traceId: crypto.randomUUID(),
        rendererId: this.rendererId,
        ready,
      });
      if (accepted) this.rendererReady = ready;
      return accepted;
    });
    return this.readiness;
  }
  async opened(id: string, outcome: ActivationOutcome = "located") {
    this.pendingCompletion = { id, outcome };
    const accepted = await this.command({
      kind: "opened",
      traceId: crypto.randomUUID(),
      id,
      rendererId: this.rendererId,
      outcome,
    });
    if (accepted && this.pendingCompletion?.id === id)
      this.pendingCompletion = null;
  }
  async preferences(value: NotificationPreferences) {
    if (this.stateStore.getState().saving || this.disposed) return;
    this.store.setState({ saving: true });
    try {
      await this.command({
        kind: "preferences",
        traceId: crypto.randomUUID(),
        value,
      });
    } finally {
      if (!this.disposed) this.store.setState({ saving: false });
    }
  }
  locate(entry: AttentionEntry, activationId?: string) {
    if (!this.disposed) {
      const previous = this.location.getState().target;
      if (previous?.activationId && previous.activationId !== activationId)
        this.completeLocation(previous, "cancelled");
      this.location.setState({
        target: { ...entry, ...(activationId ? { activationId } : {}) },
        completed: null,
      });
    }
  }
  completeLocation(target: AttentionLocation, outcome: ActivationOutcome) {
    if (this.disposed || this.location.getState().target !== target) return;
    this.location.setState({
      target: null,
      completed: { threadId: target.threadId, outcome },
    });
    if (target.activationId) void this.opened(target.activationId, outcome);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop?.();
    this.stop = null;
  }
}
