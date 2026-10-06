import { randomUUID } from "node:crypto";
import type {
  RuntimeView,
  SubmissionReceipt,
} from "../../../modules/execution/contracts/public";
import type { NotificationPreferences } from "../../../modules/preferences/contracts/public";
import type { ThreadId } from "../../../shared/identity";
import type {
  AttentionEntry,
  AttentionSnapshot,
} from "../../contracts/attention";
import type { SystemNotifications } from "../lifecycle/system-notifications";

type Context = {
  readPreferences: () => NotificationPreferences;
  savePreferences: (value: NotificationPreferences) => void;
  systemNotifications: SystemNotifications;
  getText: (
    kind: AttentionEntry["kind"],
    threadShortId: string,
  ) => { title: string; body: string };
  openWindow: () => void;
  onFailure?: (entry: AttentionEntry) => void;
};
type RuntimeCursor = {
  revision: number;
  generation: string | undefined;
  pending: string[];
  phase: RuntimeView["phase"];
  traceId: string;
};
/** App attention is a bounded, ephemeral projection; execution facts stay in OMP/receipts. */
export class ThreadAttention {
  private readonly instanceId = randomUUID();
  private revision = 0;
  private readonly entries = new Map<ThreadId, AttentionEntry>();
  private readonly runtime = new Map<ThreadId, RuntimeCursor>();
  private readonly latestSubmission = new Map<
    ThreadId,
    { id: string; createdAt: number; order: number }
  >();
  private readonly receiptOrder = new Map<string, number>();
  private receiptSequence = 0;
  private readonly receipts = new Map<string, string>();
  private readonly releases = new Map<ThreadId, () => void>();
  private readonly listeners = new Set<(snapshot: AttentionSnapshot) => void>();
  private preferences: NotificationPreferences = {
    system: false,
    completion: false,
  };
  private system: AttentionSnapshot["system"] = "disabled";
  private coverageGap = false;
  private openRequest: AttentionSnapshot["openRequest"] = null;
  private foreground = false;
  private visibleThread: ThreadId | null = null;
  private disposed = false;
  constructor(private readonly context: Context) {
    try {
      this.preferences = context.readPreferences();
    } catch {
      /* Startup remains owned by storage. */
    }
    this.refreshCapability();
  }
  snapshot(): AttentionSnapshot {
    return {
      instanceId: this.instanceId,
      revision: this.revision,
      entries: [...this.entries.values()].map((entry) => ({ ...entry })),
      preferences: { ...this.preferences },
      system: this.system,
      coverageGap: this.coverageGap,
      openRequest: this.openRequest ? { ...this.openRequest } : null,
    };
  }
  subscribe(listener: (snapshot: AttentionSnapshot) => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private publish(): void {
    if (this.disposed) return;
    this.revision++;
    const snapshot = this.snapshot();
    for (const listener of this.listeners)
      try {
        listener(snapshot);
      } catch {
        /* A failed delivery does not change facts. */
      }
  }
  private refreshCapability(): void {
    if (!this.preferences.system) {
      this.system = "disabled";
      return;
    }
    try {
      this.system = this.context.systemNotifications.supported()
        ? "available"
        : "unavailable";
    } catch {
      this.system = "unavailable";
    }
  }
  reloadPreferences(): void {
    if (this.disposed) return;
    try {
      this.preferences = { ...this.context.readPreferences() };
      this.refreshCapability();
      this.publish();
    } catch {
      /* Startup/retry failure remains owned by storage. */
    }
  }
  setPreferences(value: NotificationPreferences): void {
    if (this.disposed) return;
    this.context.savePreferences(value);
    this.preferences = { ...value };
    this.refreshCapability();
    if (!value.system) {
      for (const release of this.releases.values()) release();
      this.releases.clear();
    }
    this.publish();
  }
  setForeground(value: boolean): void {
    if (this.disposed) return;
    this.foreground = value;
    if (value) this.clearCurrentUnread();
  }
  clearVisible(): void {
    this.visibleThread = null;
  }
  visible(threadId: ThreadId | null): void {
    if (this.disposed) return;
    this.visibleThread = threadId;
    this.clearCurrentUnread();
  }
  private clearCurrentUnread(): void {
    if (!this.foreground || !this.visibleThread) return;
    const entry = this.entries.get(this.visibleThread);
    if (entry?.unread) {
      entry.unread = false;
      this.publish();
    }
  }
  seen(threadId: ThreadId, eventId: string): boolean {
    const entry = this.entries.get(threadId);
    if (
      this.disposed ||
      !this.foreground ||
      this.visibleThread !== threadId ||
      entry?.eventId !== eventId
    )
      return false;
    if (entry.unread) {
      entry.unread = false;
      this.publish();
    }
    return true;
  }
  opened(id: string): void {
    if (this.openRequest?.id !== id || this.disposed) return;
    this.openRequest = null;
    this.publish();
  }
  observeRuntime(view: RuntimeView): void {
    if (this.disposed) return;
    const prior = this.runtime.get(view.threadId);
    if (prior && view.revision <= prior.revision) return;
    const generation = view.connectionGeneration;
    const pending =
      view.interactions && view.interactions.connectionGeneration === generation
        ? view.interactions.items
            .filter((item) => item.status === "pending")
            .map((item) => item.id)
        : [];
    this.runtime.set(view.threadId, {
      revision: view.revision,
      generation,
      pending,
      phase: view.phase,
      traceId: view.traceId,
    });
    this.bound(this.runtime);
    if (
      pending.length &&
      (generation !== prior?.generation ||
        pending.some((id) => !prior?.pending.includes(id)))
    )
      this.add(view.threadId, view.traceId, "needs-answer");
    else if (
      !pending.length &&
      this.entries.get(view.threadId)?.kind === "needs-answer"
    )
      this.remove(view.threadId);
    if (
      (view.phase === "failed" || view.phase === "interrupted") &&
      (prior?.phase !== view.phase ||
        prior.traceId !== view.traceId ||
        prior.generation !== generation)
    )
      this.add(view.threadId, view.traceId, view.phase);
  }
  observeReceipt(receipt: SubmissionReceipt): void {
    if (this.disposed) return;
    const runtime = this.runtime.get(receipt.threadId);
    if (
      runtime?.generation &&
      runtime.generation !== receipt.target.connectionGeneration
    )
      return;
    const createdAt = Date.parse(receipt.createdAt);
    const latest = this.latestSubmission.get(receipt.threadId);
    let order = this.receiptOrder.get(receipt.submissionId);
    const terminal = ["completed", "failed", "aborted"].includes(
      receipt.outcome,
    );
    if (order === undefined) {
      if (
        latest &&
        latest.id !== receipt.submissionId &&
        createdAt === latest.createdAt &&
        terminal
      ) {
        this.coverageGap = true;
        this.publish();
        return;
      }
      order = ++this.receiptSequence;
      this.receiptOrder.set(receipt.submissionId, order);
      this.bound(this.receiptOrder);
    }
    if (
      latest &&
      latest.id !== receipt.submissionId &&
      (!Number.isFinite(createdAt) ||
        createdAt < latest.createdAt ||
        (createdAt === latest.createdAt && order < latest.order))
    )
      return;
    if (!latest || latest.id !== receipt.submissionId) {
      this.latestSubmission.set(receipt.threadId, {
        id: receipt.submissionId,
        createdAt: Number.isFinite(createdAt) ? createdAt : 0,
        order,
      });
      this.bound(this.latestSubmission);
    }
    const outcome = receipt.outcome;
    if (
      outcome !== "completed" &&
      outcome !== "failed" &&
      outcome !== "aborted"
    )
      return;
    const key = `${receipt.threadId}:${receipt.target.connectionGeneration}:${receipt.submissionId}`;
    if (this.receipts.has(key)) return;
    this.receipts.set(key, outcome);
    this.bound(this.receipts);
    if (
      runtime?.pending.length ||
      (outcome === "completed" && runtime && runtime.phase !== "ready")
    )
      return;
    this.add(
      receipt.threadId,
      receipt.traceId,
      outcome === "aborted" ? "interrupted" : outcome,
    );
  }
  private bound<T>(map: Map<string, T>): void {
    if (map.size <= 512) return;
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
    this.coverageGap = true;
  }
  private remove(threadId: ThreadId): void {
    this.releases.get(threadId)?.();
    this.releases.delete(threadId);
    if (this.entries.delete(threadId)) this.publish();
  }
  private nativeFailure(entry: AttentionEntry): void {
    if (this.disposed) return;
    this.system = "failed";
    try {
      this.context.onFailure?.({ ...entry });
    } catch {
      /* Logging is independent. */
    }
    this.publish();
  }
  private add(
    threadId: ThreadId,
    traceId: AttentionEntry["traceId"],
    kind: AttentionEntry["kind"],
  ): void {
    const prior = this.entries.get(threadId);
    if (prior?.kind === kind && prior.traceId === traceId) return;
    this.releases.get(threadId)?.();
    this.releases.delete(threadId);
    const entry: AttentionEntry = {
      threadId,
      traceId,
      kind,
      eventId: randomUUID(),
      unread: !(this.foreground && this.visibleThread === threadId),
    };
    this.entries.delete(threadId);
    this.entries.set(threadId, entry);
    if (this.entries.size > 512) {
      const oldest = this.entries.keys().next().value;
      if (oldest) {
        this.releases.get(oldest)?.();
        this.releases.delete(oldest);
        this.entries.delete(oldest);
      }
      this.coverageGap = true;
    }
    this.publish();
    if (
      this.foreground ||
      !this.preferences.system ||
      (kind === "completed" && !this.preferences.completion) ||
      this.system === "unavailable"
    )
      return;
    try {
      const release = this.context.systemNotifications.show(
        this.context.getText(kind, threadId.slice(0, 6)),
        {
          click: () => {
            if (this.disposed) return;
            const latest = this.entries.get(threadId);
            this.openRequest = {
              id: randomUUID(),
              threadId,
              eventId: latest?.eventId ?? entry.eventId,
            };
            this.publish();
            try {
              this.context.openWindow();
            } catch {
              this.nativeFailure(entry);
            }
          },
          failed: () => this.nativeFailure(entry),
          closed: () => {
            this.releases.delete(threadId);
          },
        },
      );
      this.releases.set(threadId, release);
    } catch {
      this.nativeFailure(entry);
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const release of this.releases.values()) release();
    this.releases.clear();
    this.listeners.clear();
    this.entries.clear();
    this.runtime.clear();
    this.receipts.clear();
    this.receiptOrder.clear();
    this.latestSubmission.clear();
    this.openRequest = null;
    this.visibleThread = null;
  }
}
