import type {
  NativeCooldownResult,
  NativeResidency,
  NativeRetentionReason,
} from "../../../modules/execution/contracts/public";

interface NativeRuntime {
  nativeResidency(): NativeResidency;
  coolIfIdle(stillOwned: () => boolean): Promise<NativeCooldownResult>;
}
export interface NativeWarmBudget {
  maxWarm: number;
  idleMs: number;
}
export function nativeWarmBudget(
  environment: NodeJS.ProcessEnv,
): NativeWarmBudget {
  const bounded = (
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ) => {
    if (!value || !/^\d+$/.test(value)) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
      ? parsed
      : fallback;
  };
  return {
    maxWarm: bounded(environment.D_PI_NATIVE_WARM_LIMIT, 2, 0, 8),
    idleMs: bounded(environment.D_PI_NATIVE_IDLE_MS, 60_000, 1000, 30 * 60_000),
  };
}
interface ResidencyRecord {
  runtime: NativeRuntime;
  idleSince: number | null;
  retryAt: number;
  retained?: NativeRetentionReason;
}

/** App-owned residency policy. Execution and physical release stay with Runtime/Host. */
export class NativeRuntimeSupervisor {
  private readonly records = new Map<string, ResidencyRecord>();
  private readonly attempts = new Set<NativeRuntime>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  constructor(
    private readonly runtimes: ReadonlyMap<string, NativeRuntime>,
    private readonly selected: () => string | null,
    readonly budget: NativeWarmBudget,
    private readonly now: () => number = Date.now,
  ) {}
  start(): void {
    if (this.closed || this.timer) return;
    this.timer = setInterval(
      () => {
        void this.sweep();
      },
      Math.min(1000, this.budget.idleMs),
    );
    this.timer.unref();
  }
  private currentSelection(): string | null | undefined {
    try {
      return this.selected();
    } catch {
      return undefined;
    }
  }
  private collect() {
    const selected = this.currentSelection();
    const now = this.now();
    for (const runtime of this.attempts)
      if (runtime.nativeResidency().kind === "cold")
        this.attempts.delete(runtime);
    for (const id of this.records.keys())
      if (!this.runtimes.has(id)) this.records.delete(id);
    const items = [];
    for (const [threadId, runtime] of this.runtimes) {
      let record = this.records.get(threadId);
      if (record?.runtime !== runtime) {
        record = { runtime, idleSince: null, retryAt: 0 };
        this.records.set(threadId, record);
      }
      const actual = runtime.nativeResidency();
      const residency: NativeResidency =
        actual.kind === "warm" &&
        (selected === undefined || selected === threadId)
          ? {
              kind: "protected",
              reason: selected === undefined ? "unknown" : "selected",
            }
          : actual;
      if (residency.kind === "warm") record.idleSince ??= now;
      else if (residency.kind !== "cooling") {
        record.idleSince = null;
        delete record.retained;
      }
      items.push({ threadId, record, residency });
    }
    return items;
  }
  snapshot() {
    const items = this.collect();
    return {
      budget: { ...this.budget },
      warm: items.filter(
        (item) => item.residency.kind === "warm" && !item.record.retained,
      ).length,
      protected: items.filter(
        (item) => item.residency.kind === "protected" || item.record.retained,
      ).length,
      cooling: items.filter((item) => item.residency.kind === "cooling").length,
      cold: items.filter((item) => item.residency.kind === "cold").length,
      total: items.length,
      cooldownSlots: this.attempts.size,
      truncated: items.length > 128,
      items: items.slice(0, 128).map(({ threadId, record, residency }) => ({
        threadId,
        residency,
        idleSince: record.idleSince,
        ...(record.retained ? { retained: record.retained } : {}),
      })),
    };
  }
  async sweep(): Promise<void> {
    if (this.closed) return;
    const now = this.now();
    const warm = this.collect()
      .filter((item) => item.residency.kind === "warm")
      .sort(
        (a, b) => (a.record.idleSince ?? now) - (b.record.idleSince ?? now),
      );
    const idle = warm.filter((item) => !item.record.retained);
    const excess = Math.max(0, idle.length - this.budget.maxWarm);
    const overBudget = new Set(
      idle.slice(0, excess).map((item) => item.record),
    );
    const candidates = warm
      .filter(
        (item) =>
          overBudget.has(item.record) ||
          now - (item.record.idleSince ?? now) >= this.budget.idleMs,
      )
      // Pending physical work still owns the two slots. Among eligible probes,
      // serve previously unattempted/least recently attempted instances first.
      .sort((a, b) => a.record.retryAt - b.record.retryAt);
    await Promise.allSettled(
      candidates.map(async ({ threadId, record }) => {
        if (
          this.closed ||
          this.attempts.size >= 2 ||
          this.attempts.has(record.runtime) ||
          now < record.retryAt
        )
          return;
        this.attempts.add(record.runtime);
        try {
          const result = await record.runtime.coolIfIdle(() => {
            const selected = this.currentSelection();
            return (
              !this.closed &&
              this.runtimes.get(threadId) === record.runtime &&
              selected !== undefined &&
              selected !== threadId
            );
          });
          if (result.kind === "retained") record.retained = result.reason;
          else {
            record.idleSince = null;
            delete record.retained;
          }
          record.retryAt = this.now() + 1000;
        } catch {
          record.retained = "unknown";
          record.retryAt = this.now() + 1000;
        } finally {
          const final = record.runtime.nativeResidency();
          if (!(final.kind === "protected" && final.reason === "unconfirmed"))
            this.attempts.delete(record.runtime);
        }
      }),
    );
  }
  close(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
