import { createStore } from "zustand/vanilla";
import type {
  SidebarChange,
  SidebarSnapshot,
} from "../../../modules/preferences/contracts/public";
import type { DesktopBridge } from "../../contracts/desktop-bridge";

// Owns only the confirmed Main projection and command lane, never an independent
// writable preferences copy. Uncertain writes are reconciled by reading.
export class SidebarModel {
  readonly stateStore = createStore<{
    snapshot: SidebarSnapshot | null;
    pending: boolean;
    failed: boolean;
  }>(() => ({ snapshot: null, pending: false, failed: false }));
  private lane: Promise<void> = Promise.resolve();
  private operations = 0;
  private disposed = false;
  constructor(private readonly bridge: Pick<DesktopBridge, "request">) {}
  accept(snapshot: SidebarSnapshot): void {
    if (this.disposed) return;
    const previous = this.stateStore.getState().snapshot;
    if (previous && snapshot.revision < previous.revision) return;
    this.stateStore.setState({ snapshot });
  }
  private enqueue(operation: () => Promise<void>): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.operations++;
    this.stateStore.setState({ pending: true });
    const next = this.lane
      .then(async () => {
        if (!this.disposed) await operation();
      })
      .finally(() => {
        this.operations--;
        if (!this.disposed)
          this.stateStore.setState({ pending: this.operations > 0 });
      });
    this.lane = next;
    return next;
  }
  refresh(): Promise<void> {
    return this.enqueue(() => this.read());
  }
  private async read(): Promise<void> {
    try {
      const reply = await this.bridge.request({
        kind: "sidebar-read",
        traceId: crypto.randomUUID(),
      });
      if (this.disposed) return;
      if (reply.kind === "sidebar") {
        this.accept(reply.snapshot);
        this.stateStore.setState({ failed: false });
      } else this.stateStore.setState({ failed: true });
    } catch {
      if (!this.disposed) this.stateStore.setState({ failed: true });
    }
  }
  change(change: SidebarChange): Promise<void> {
    return this.enqueue(async () => {
      try {
        const reply = await this.bridge.request({
          kind: "sidebar-change",
          traceId: crypto.randomUUID(),
          change,
        });
        if (this.disposed) return;
        if (reply.kind === "sidebar") {
          this.accept(reply.snapshot);
          this.stateStore.setState({ failed: false });
          return;
        }
      } catch {
        /* A lost acknowledgement may follow a committed write. */
      }
      await this.read();
      if (!this.disposed) this.stateStore.setState({ failed: true });
    });
  }
  dispose(): void {
    this.disposed = true;
  }
}
