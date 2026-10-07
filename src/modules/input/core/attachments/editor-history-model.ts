import { createStore } from "zustand/vanilla";
import { createId, type ThreadId } from "../../../../shared/identity";
import type { AttachmentBridge } from "../../contracts/public";

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
  private leaseId: string | null = null;
  private version = 0;
  private generation = 0;
  private tail: Promise<void> = Promise.resolve();
  private disposed = false;
  constructor(
    private readonly bridge: AttachmentBridge,
    readonly threadId: ThreadId,
    private readonly clearHistory: () => void,
  ) {}
  ready(): boolean {
    const state = this.store.getState();
    return !this.disposed && !state.pending && !state.failed;
  }
  observe(ids: Iterable<string>): void {
    if (this.disposed) return;
    let changed = false;
    for (const id of ids)
      if (!this.ids.has(id)) {
        this.ids.add(id);
        changed = true;
      }
    if (!changed) return;
    if (this.ids.size > 128) {
      this.limit();
      return;
    }
    this.enqueue();
  }
  private limit(): void {
    this.clearHistory();
    this.store.setState({ limited: true });
  }
  private enqueue(): void {
    const generation = this.generation;
    const version = ++this.version;
    const ids = [...this.ids];
    this.store.setState({ pending: true, failed: false });
    this.tail = this.tail.then(async () => {
      if (this.disposed || generation !== this.generation) return;
      try {
        if (!this.leaseId) {
          const opened = await this.bridge.request({
            kind: "history-open",
            threadId: this.threadId,
            traceId: createId(),
            epoch: this.epoch,
          });
          if (opened.kind === "history-lease") {
            if (this.disposed || generation !== this.generation) {
              await this.release(opened.leaseId);
              return;
            }
            this.leaseId = opened.leaseId;
          } else if (opened.kind === "history-limit") {
            this.limit();
            return;
          } else throw Error("Editor history unavailable");
        }
        const reply = await this.bridge.request({
          kind: "history-update",
          threadId: this.threadId,
          traceId: createId(),
          leaseId: this.leaseId,
          version,
          ids,
        });
        if (this.disposed || generation !== this.generation) return;
        if (reply.kind === "history-limit") {
          this.limit();
          return;
        }
        if (reply.kind !== "history-lease" || reply.version < version)
          throw Error("Editor history not protected");
      } catch {
        if (!this.disposed && generation === this.generation)
          this.store.setState({ failed: true });
      } finally {
        if (
          !this.disposed &&
          generation === this.generation &&
          version === this.version
        )
          this.store.setState({ pending: false });
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
    if (this.store.getState().failed) this.enqueue();
    return this.ensure();
  }
  private async release(leaseId: string): Promise<void> {
    // Main also releases document leases on reload, process exit and disposal.
    // A transport failure cannot turn an old lease into a new authority.
    try {
      await this.bridge.request({
        kind: "history-release",
        threadId: this.threadId,
        traceId: createId(),
        leaseId,
      });
    } catch {}
  }
  reset(): void {
    this.generation++;
    this.epoch = createId();
    this.version = 0;
    this.ids = new Set();
    const leaseId = this.leaseId;
    this.leaseId = null;
    if (leaseId) this.tail = this.tail.then(() => this.release(leaseId));
    this.store.setState({ pending: false, failed: false });
  }
  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
  }
}
