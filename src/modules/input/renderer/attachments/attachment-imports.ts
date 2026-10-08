import { match } from "ts-pattern";
import { createStore } from "zustand/vanilla";
import type {
  Attachment,
  AttachmentFailureReason,
} from "../../contracts/public";

type Source = "paste" | "drop";
export type ImportPhase =
  | "queued"
  | "reading"
  | "preparing"
  | "ready"
  | "failed"
  | "cancelling"
  | "cancelled";
export type ImportReason = AttachmentFailureReason | "read-or-transport-failed";
export class AttachmentImportError extends Error {
  constructor(readonly reason: ImportReason) {
    super(reason);
  }
}
export type ImportFailure = {
  id: string;
  file: File;
  source: Source;
  reason: ImportReason;
};
export type AttachmentImportInput = {
  name: string;
  mimeType: string;
  dataBase64: string;
  source: Source;
  operationId: string;
};
export interface AttachmentImportTarget {
  apply(items: Attachment[]): boolean;
  invalidate?(): void;
}
export interface AttachmentImportEditor {
  applyBatch(items: Attachment[]): boolean;
}
export interface ImportJobView {
  readonly id: string;
  readonly phase: ImportPhase;
  readonly name: string;
  readonly bytes: number;
  readonly loaded: number;
  readonly total: number;
  readonly reason: ImportReason | null;
  readonly adoption: "pending" | "applied" | "settling" | "settled";
}
export interface ImportBatchView {
  readonly id: string;
  readonly source: Source;
  readonly jobs: readonly ImportJobView[];
}
function inProgress(phase: ImportPhase): boolean {
  return match(phase)
    .with("queued", "reading", "preparing", "cancelling", () => true)
    .with("ready", "failed", "cancelled", () => false)
    .exhaustive();
}
/** One window owns this budget; every Thread reserves before its first await. */
export class AttachmentImportBudget {
  private bytes = 0;
  private jobs = 0;
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  constructor(
    private readonly limits = { active: 2, bytes: 100 * 1024 * 1024, jobs: 64 },
  ) {}
  reserve(bytes: number, jobs: number): (() => void) | null {
    if (
      this.bytes + bytes > this.limits.bytes ||
      this.jobs + jobs > this.limits.jobs
    )
      return null;
    this.bytes += bytes;
    this.jobs += jobs;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.bytes -= bytes;
      this.jobs -= jobs;
    };
  }
  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const start = () => {
        this.active++;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.active--;
          this.waiters.shift()?.();
        });
      };
      if (this.active < this.limits.active) start();
      else this.waiters.push(start);
    });
  }
}
const windowBudget = new AttachmentImportBudget();
const unpersistedImports = new Set<AttachmentImports>();
export function hasUnpersistedAttachmentSources(): boolean {
  return unpersistedImports.size > 0;
}
type Job = {
  view: ImportJobView;
  file: File | null;
  items: Attachment[];
  operationId: string | null;
  releaseSource: () => void;
  reader: FileReader | null;
  settling: Promise<boolean> | null;
  removing: boolean;
  activeAttempt: boolean;
  intent: string;
  retrying: boolean;
};
type Batch = {
  id: string;
  source: Source;
  jobs: Job[];
  target: AttachmentImportTarget | null;
  automatic: boolean;
};
type Options = {
  budget?: AttachmentImportBudget;
  /** Main owns any accepted operation after Renderer disposal/reload. */
  settle?: (
    operationId: string,
    disposition: "release" | "adopt",
  ) => Promise<void>;
};
/** Thread-owned source jobs. PM targets remain in the Renderer adapter. */
export class AttachmentImports {
  private disposed = false;
  private sourceFreezes = 0;
  private running = false;
  private editor: AttachmentImportEditor | null = null;
  private readonly batches: Batch[] = [];
  private readonly budget: AttachmentImportBudget;
  private readonly store = createStore(() => ({
    acceptingSources: true,
    pending: 0,
    failures: [] as ImportFailure[],
    batches: [] as readonly ImportBatchView[],
    completion: 0,
    ready: true,
    admissionFailure: null as "budget-exceeded" | null,
  }));
  readonly stateStore: Pick<
    typeof this.store,
    "getState" | "getInitialState" | "subscribe"
  > = this.store;
  private readonly listeners = new Set<(items: Attachment[]) => void>();
  constructor(
    private readonly prepare: (
      input: AttachmentImportInput,
    ) => Promise<Attachment[]>,
    private readonly options: Options = {},
  ) {
    this.budget = options.budget ?? windowBudget;
  }
  subscribeCompleted(listener: (items: Attachment[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  attachEditor(editor: AttachmentImportEditor): () => void {
    if (this.disposed) return () => {};
    this.editor = editor;
    return () => {
      if (this.editor === editor) {
        this.editor = null;
        this.invalidateTargets();
      }
    };
  }
  invalidateTargets(): void {
    for (const batch of this.batches) {
      batch.target?.invalidate?.();
      batch.target = null;
      batch.automatic = false;
    }
  }
  /** Retry only the original still-valid automatic intent after IME/admission. */
  flushInsertions(): void {
    for (const batch of this.batches) this.tryAutomatic(batch);
  }
  freezeSources(): () => void {
    if (this.disposed) return () => {};
    this.sourceFreezes++;
    this.publish();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.sourceFreezes--;
      this.publish();
    };
  }
  importFiles(
    files: File[],
    source: Source,
    target?: AttachmentImportTarget,
  ): string | null {
    if (this.disposed || this.sourceFreezes || !files.length) {
      target?.invalidate?.();
      return null;
    }
    const bytes = files.reduce((sum, file) => sum + file.size, 0);
    for (let index = this.batches.length - 1; index >= 0; index--) {
      const batch = this.batches[index];
      if (batch?.jobs.every((job) => job.view.adoption === "settled")) {
        batch.target?.invalidate?.();
        this.batches.splice(index, 1);
      }
    }
    // Keep rejected events out of the retained File set as well as the reader queue.
    if (files.length > 32 || this.batches.length >= 32) {
      this.store.setState({ admissionFailure: "budget-exceeded" });
      target?.invalidate?.();
      return null;
    }
    const reservation = this.budget.reserve(bytes, files.length);
    if (!reservation) {
      this.store.setState({ admissionFailure: "budget-exceeded" });
      target?.invalidate?.();
      return null;
    }
    let retained = files.length;
    const jobs = files.map((file): Job => {
      let released = false;
      return {
        view: {
          id: crypto.randomUUID(),
          phase: file.size > 25 * 1024 * 1024 ? "failed" : "queued",
          name: file.name || "clipboard.png",
          bytes: file.size,
          loaded: 0,
          total: file.size,
          reason: file.size > 25 * 1024 * 1024 ? "source-too-large" : null,
          adoption: "pending",
        },
        file,
        items: [],
        operationId: null,
        reader: null,
        settling: null,
        removing: false,
        activeAttempt: false,
        intent: crypto.randomUUID(),
        retrying: false,
        releaseSource: () => {
          if (released) return;
          released = true;
          if (--retained === 0) reservation();
        },
      };
    });
    const batch: Batch = {
      id: crypto.randomUUID(),
      source,
      jobs,
      target: target ?? null,
      automatic: true,
    };
    this.batches.push(batch);
    this.store.setState({ admissionFailure: null });
    this.publish();
    void this.pump();
    return batch.id;
  }
  removeFailure(id: string): void {
    this.cancel(id, true);
  }
  retry(id: string): void {
    if (this.disposed || this.sourceFreezes) return;
    const found = this.find(id);
    if (
      found?.job.view.phase === "ready" &&
      found.job.view.adoption === "settling" &&
      !found.job.settling
    ) {
      void this.settle(found.job, "adopt");
      return;
    }
    if (
      !found ||
      !found.job.file ||
      found.job.settling ||
      found.job.retrying ||
      found.job.activeAttempt ||
      !["failed", "cancelled"].includes(found.job.view.phase)
    )
      return;
    const { job, batch } = found;
    job.retrying = true;
    const intent = crypto.randomUUID();
    job.intent = intent;
    // The previous attempt must settle before a new identity can own the source.
    void (async () => {
      try {
        if (job.operationId && !(await this.settle(job, "release"))) return;
        if (
          this.disposed ||
          this.sourceFreezes ||
          job.removing ||
          job.intent !== intent ||
          !job.file
        )
          return;
        job.items = [];
        job.operationId = null;
        job.view = {
          ...job.view,
          phase: job.file.size > 25 * 1024 * 1024 ? "failed" : "queued",
          reason: job.file.size > 25 * 1024 * 1024 ? "source-too-large" : null,
          loaded: 0,
          adoption: "pending",
        };
        batch.automatic = false;
        this.publish();
        void this.pump();
      } finally {
        job.retrying = false;
      }
    })();
  }
  cancel(id: string, remove = false): void {
    const batch = this.batches.find((batch) => batch.id === id);
    const jobs = batch?.jobs ?? (this.find(id) ? [this.find(id)?.job] : []);
    for (const job of jobs) {
      if (
        !job ||
        (job.view.phase === "ready" && job.view.adoption !== "pending")
      )
        continue;
      job.removing ||= remove;
      job.intent = crypto.randomUUID();
      const owner = this.batches.find((batch) => batch.jobs.includes(job));
      if (owner) {
        owner.automatic = false;
        owner.target?.invalidate?.();
        owner.target = null;
      }
      if (job.view.phase === "preparing" || job.view.phase === "cancelling") {
        job.view = { ...job.view, phase: "cancelling", adoption: "settling" };
        if (!job.activeAttempt) void this.finishCancellation(job);
      } else if (job.view.phase === "reading") {
        job.view = { ...job.view, phase: "cancelling", adoption: "settling" };
        job.reader?.abort();
      } else if (job.operationId) {
        job.view = { ...job.view, phase: "cancelling", adoption: "settling" };
        void this.finishCancellation(job);
      } else this.cancelled(job);
    }
    this.publish();
  }
  insertReady(id: string): boolean {
    if (this.disposed || this.sourceFreezes || !this.editor) return false;
    const batch = this.batches.find((batch) => batch.id === id);
    if (!batch || batch.jobs.some((job) => inProgress(job.view.phase)))
      return false;
    batch.automatic = false;
    batch.target?.invalidate?.();
    batch.target = null;
    return this.apply(
      batch,
      (items) => this.editor?.applyBatch(items) ?? false,
    );
  }
  dismissSettled(id: string): void {
    const index = this.batches.findIndex((batch) => batch.id === id);
    const batch = this.batches[index];
    if (!batch || batch.jobs.some((job) => job.view.adoption !== "settled"))
      return;
    batch.target?.invalidate?.();
    this.batches.splice(index, 1);
    this.publish();
  }
  private find(id: string): { batch: Batch; job: Job } | null {
    for (const batch of this.batches) {
      const job = batch.jobs.find((job) => job.view.id === id);
      if (job) return { batch, job };
    }
    return null;
  }
  private async pump(): Promise<void> {
    if (this.running || this.disposed) return;
    this.running = true;
    try {
      for (;;) {
        const found = this.batches
          .flatMap((batch) => batch.jobs.map((job) => ({ batch, job })))
          .find(({ job }) => job.view.phase === "queued");
        if (!found || this.disposed) break;
        const { batch, job } = found;
        const release = await this.budget.acquire();
        try {
          if (this.disposed || job.view.phase !== "queued" || !job.file)
            continue;
          job.activeAttempt = true;
          job.view = { ...job.view, phase: "reading" };
          this.publish();
          const dataBase64 = await this.read(job);
          if (this.disposed || job.view.phase === "cancelling") {
            this.cancelled(job);
            continue;
          }
          job.operationId = crypto.randomUUID();
          job.view = { ...job.view, phase: "preparing" };
          this.publish();
          const items = await this.prepare({
            name: job.view.name,
            mimeType: job.file.type,
            dataBase64,
            source: batch.source,
            operationId: job.operationId,
          });
          job.items = items;
          if (this.disposed || job.view.phase === "cancelling") {
            await this.finishCancellation(job);
            continue;
          }
          const failed = items.find(
            (item) =>
              item.status !== "ready" ||
              (item.coverageGaps.length > 0 && !item.textOnly),
          );
          job.view = {
            ...job.view,
            phase: failed ? "failed" : "ready",
            reason: failed ? (failed.reason ?? "pdf-coverage-gap") : null,
          };
          this.store.setState((state) => ({
            completion: state.completion + 1,
          }));
          for (const listener of this.listeners) listener(items);
        } catch (error) {
          if (this.disposed || job.view.phase === "cancelling")
            await this.finishCancellation(job);
          else {
            job.view = {
              ...job.view,
              phase: "failed",
              reason:
                error instanceof AttachmentImportError
                  ? error.reason
                  : "read-or-transport-failed",
            };
          }
        } finally {
          job.activeAttempt = false;
          job.reader = null;
          release();
          this.publish();
        }
        this.tryAutomatic(batch);
      }
    } finally {
      this.running = false;
      this.publish();
    }
  }
  private read(job: Job): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      job.reader = reader;
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result.slice(reader.result.indexOf(",") + 1))
          : reject(Error("File read failed"));
      reader.onerror = () => reject(reader.error);
      reader.onabort = () => reject(Error("File read aborted"));
      reader.onprogress = (event) => {
        job.view = { ...job.view, loaded: event.loaded, total: event.total };
        this.publish();
      };
      if (job.file) reader.readAsDataURL(job.file);
      else reject(Error("Source removed"));
    });
  }
  private tryAutomatic(batch: Batch): void {
    if (
      !batch.automatic ||
      !batch.target ||
      this.disposed ||
      this.sourceFreezes > 0 ||
      batch.jobs.some((job) => job.view.phase !== "ready")
    )
      return;
    this.apply(batch, (items) => batch.target?.apply(items) ?? false);
  }
  private apply(
    batch: Batch,
    apply: (items: Attachment[]) => boolean,
  ): boolean {
    const jobs = batch.jobs.filter(
      (job) => job.view.phase === "ready" && job.view.adoption === "pending",
    );
    const items = jobs.flatMap((job) => job.items);
    if (!jobs.length || !items.length || !apply(items)) return false;
    batch.automatic = false;
    batch.target?.invalidate?.();
    batch.target = null;
    for (const job of jobs) {
      job.view = { ...job.view, adoption: "applied" };
      this.releaseSource(job);
      void this.settle(job, "adopt");
    }
    this.publish();
    return true;
  }
  private settle(job: Job, disposition: "release" | "adopt"): Promise<boolean> {
    if (job.settling) return job.settling;
    const operationId = job.operationId;
    if (!operationId) {
      job.view = { ...job.view, adoption: "settled" };
      return Promise.resolve(true);
    }
    job.view = { ...job.view, adoption: "settling" };
    this.publish();
    const task = (async () => {
      try {
        await this.options.settle?.(operationId, disposition);
        job.operationId = null;
        job.view = { ...job.view, adoption: "settled", reason: null };
        return true;
      } catch {
        job.view = { ...job.view, reason: "read-or-transport-failed" };
        return false;
      } finally {
        job.settling = null;
        this.publish();
      }
    })();
    job.settling = task;
    return task;
  }
  private async finishCancellation(job: Job): Promise<void> {
    if (await this.settle(job, "release")) this.cancelled(job);
    this.publish();
  }
  private releaseSource(job: Job): void {
    job.file = null;
    job.releaseSource();
  }
  private cancelled(job: Job): void {
    job.items = [];
    job.view = {
      ...job.view,
      phase: "cancelled",
      adoption: "settled",
      reason: null,
    };
    this.releaseSource(job);
  }
  private publish(): void {
    if (this.disposed) return;
    const jobs = this.batches.flatMap((batch) => batch.jobs);
    const pending = jobs.filter(
      (job) => inProgress(job.view.phase) || job.view.adoption === "settling",
    ).length;
    const previousFailures = this.store.getState().failures;
    const failures = jobs.flatMap((job): ImportFailure[] => {
      if (job.view.phase !== "failed" || !job.file || !job.view.reason)
        return [];
      const previous = previousFailures.find(
        (item) =>
          item.id === job.view.id &&
          item.file === job.file &&
          item.reason === job.view.reason,
      );
      return [
        previous ?? {
          id: job.view.id,
          file: job.file,
          source:
            this.batches.find((batch) => batch.jobs.includes(job))?.source ??
            "paste",
          reason: job.view.reason,
        },
      ];
    });
    const ready = jobs.every((job) => job.view.adoption === "settled");
    this.store.setState({
      acceptingSources: this.sourceFreezes === 0,
      pending,
      failures,
      ready,
      batches: this.batches.map((batch) => ({
        id: batch.id,
        source: batch.source,
        jobs: batch.jobs.map((job) => job.view),
      })),
    });
    if (ready) unpersistedImports.delete(this);
    else unpersistedImports.add(this);
  }
  dispose(): void {
    if (this.disposed) return;
    this.invalidateTargets();
    this.editor = null;
    this.listeners.clear();
    // Main's operation handles own late prepare cleanup, including reload teardown.
    for (const batch of this.batches)
      for (const job of batch.jobs) {
        if (job.view.adoption === "settled") {
          this.releaseSource(job);
          continue;
        }
        if (
          job.view.phase === "ready" &&
          ["applied", "settling"].includes(job.view.adoption)
        ) {
          void this.settle(job, "adopt");
          continue;
        }
        if (job.view.phase === "preparing" || job.view.phase === "reading") {
          if (job.operationId) this.releaseSource(job);
          job.view = { ...job.view, phase: "cancelling" };
          job.reader?.abort();
        } else if (job.operationId) {
          this.releaseSource(job);
          void this.finishCancellation(job);
        } else this.cancelled(job);
      }
    this.disposed = true;
    this.store.setState({ acceptingSources: false });
    unpersistedImports.delete(this);
  }
}
