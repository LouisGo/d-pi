import { createStore, type StoreApi } from "zustand/vanilla";
import type { NotificationPreferences } from "../../../modules/preferences/contracts/public";
import type { ThreadContext } from "../../../modules/threads/contracts/public";
import type {
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
  private readonly location = createStore<{ target: AttentionEntry | null }>(
    () => ({ target: null }),
  );
  readonly locationStore: Pick<
    StoreApi<{ target: AttentionEntry | null }>,
    "getState" | "getInitialState" | "subscribe"
  > = this.location;
  private disposed = false;
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
  private async command(command: AttentionCommand): Promise<void> {
    if (this.disposed || !this.bridge) return;
    const streamRevision = this.streamRevision;
    try {
      const reply = await this.bridge.request(command);
      if (this.disposed) return;
      if (reply.kind === "failed") this.store.setState({ failed: true });
      else if (
        streamRevision === this.streamRevision ||
        reply.snapshot.instanceId ===
          this.stateStore.getState().snapshot?.instanceId
      )
        this.accept(reply.snapshot);
    } catch {
      if (!this.disposed) this.store.setState({ failed: true });
    }
  }
  refresh() {
    return this.command({ kind: "snapshot", traceId: crypto.randomUUID() });
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
  opened(id: string) {
    return this.command({ kind: "opened", traceId: crypto.randomUUID(), id });
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
  locate(entry: AttentionEntry) {
    if (!this.disposed) this.location.setState({ target: { ...entry } });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop?.();
    this.stop = null;
  }
}
