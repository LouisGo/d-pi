import { randomUUID } from "node:crypto";
import {
  appendFile,
  mkdir,
  readdir,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { match } from "ts-pattern";
import { BUILD_INFO } from "../../../shared/build-info";
import {
  DiagnosticRecordSchema,
  type DiagnosticWriterGap,
  type DiagnosticWriterHealth,
} from "../../../shared/diagnostics";
import { sanitizeDiagnosticRecord } from "./metadata";

export interface DiagnosticEvent {
  traceId: string;
  requestId: string;
  connectionId: string;
  operation: string;
  submissionId?: string;
  threadId?: string;
  nativeProcessInstanceId?: string;
  receiptState?:
    | "prepared"
    | "dispatching"
    | "acknowledged"
    | "unknown"
    | "rejected";
  outcome?: "unobserved" | "failed" | "unknown" | "completed" | "aborted";
  stage:
    | "prepared"
    | "dispatching"
    | "acknowledged"
    | "unknown"
    | "received"
    | "completed"
    | "failed"
    | "renderer-gone"
    | "initiated"
    | "confirmed"
    | "acknowledgement-failed"
    | "disconnected"
    | "exited";
  observedAt?: "preload";
  durationMs?: number;
  errorId?: string;
  code?: string;
  causeCode?: string;
  processPid?: number | null;
  exitCode?: number | null;
  exitSignal?: string | null;
  terminationReason?: string | null;
  requestedExitCode?: number | null;
}
interface WriterIo {
  mkdir(
    path: string,
    options: { recursive: true; mode: number },
  ): Promise<unknown>;
  stat(path: string): Promise<{ size: number; mtimeMs: number }>;
  readdir(path: string): Promise<string[]>;
  rename(from: string, to: string): Promise<void>;
  appendFile(
    path: string,
    data: string,
    options: { mode: number },
  ): Promise<void>;
  unlink(path: string): Promise<void>;
}
const disk: WriterIo = { mkdir, stat, readdir, rename, appendFile, unlink };
type FailureStage = "prewrite" | "append" | "retention";
const eventFields = DiagnosticRecordSchema.keyof().options.filter(
  (key) =>
    ![
      "schemaVersion",
      "time",
      "process",
      "processInstanceId",
      "build",
      "writerGap",
    ].includes(key),
);
export class Diagnostics {
  readonly processInstanceId = randomUUID();
  private queue: string[] = [];
  private bytes = 0;
  private timer: ReturnType<typeof setInterval>;
  private writing: Promise<void> | null = null;
  private closing: Promise<void> | null = null;
  private accepting = true;
  private drainExpired = false;
  private size = 0;
  private inFlight = 0;
  private uncertain = 0;
  private retentionFailures = 0;
  private rejected = 0;
  private drainTimedOut = 0;
  private episode:
    | {
        startedAt: string;
        reason: FailureStage;
        dropped: number;
        uncertain: number;
        retentionFailures: number;
      }
    | undefined;
  private lastRecovery: DiagnosticWriterGap | undefined;
  private readonly io: WriterIo;
  dropped = 0;
  degraded = false;
  constructor(
    private readonly directory: string,
    private readonly onFailure?: () => void,
    io: Partial<WriterIo> = {},
  ) {
    this.io = { ...disk, ...io };
    this.timer = setInterval(() => {
      void this.flush();
    }, 100);
    this.timer.unref();
  }
  health(): DiagnosticWriterHealth {
    return {
      degraded: this.degraded,
      dropped: this.dropped,
      uncertain: this.uncertain,
      retentionFailures: this.retentionFailures,
      rejected: this.rejected,
      drainTimedOut: this.drainTimedOut,
      inFlight: this.inFlight,
      ...(this.episode
        ? {
            episode: {
              startedAt: this.episode.startedAt,
              reason: this.episode.reason,
            },
          }
        : {}),
      ...(this.lastRecovery ? { lastRecovery: { ...this.lastRecovery } } : {}),
    };
  }
  private serialize(
    event: DiagnosticEvent,
    writerGap?: DiagnosticWriterGap,
  ): string | undefined {
    try {
      const selected: Record<string, unknown> = {};
      for (const key of eventFields) {
        const field = Object.getOwnPropertyDescriptor(event, key);
        if (field && "value" in field) selected[key] = field.value;
      }
      const { record } = sanitizeDiagnosticRecord(
        {
          ...selected,
          schemaVersion: 1,
          time: new Date().toISOString(),
          process: "main",
          processInstanceId: this.processInstanceId,
          build: BUILD_INFO,
          ...(writerGap ? { writerGap } : {}),
        },
        false,
      );
      return record ? JSON.stringify(record) + "\n" : undefined;
    } catch {
      return undefined;
    }
  }
  record(event: DiagnosticEvent): void {
    if (!this.accepting) {
      this.rejected++;
      return;
    }
    const line = this.serialize(event);
    if (!line) {
      this.rejected++;
      return;
    }
    if (
      this.queue.length >= 1000 ||
      this.bytes + Buffer.byteLength(line) > 1024 * 1024
    ) {
      this.dropped++;
      return;
    }
    this.queue.push(line);
    this.bytes += Buffer.byteLength(line);
  }
  flush(): Promise<void> {
    if (this.writing) return this.writing;
    if (this.drainExpired) return Promise.resolve();
    this.writing = this.writeBatch().finally(() => {
      this.writing = null;
    });
    return this.writing;
  }
  private fail(stage: FailureStage, count: number): void {
    this.degraded = true;
    if (!this.episode) {
      this.episode = {
        startedAt: new Date().toISOString(),
        reason: stage,
        dropped: this.dropped,
        uncertain: this.uncertain,
        retentionFailures: this.retentionFailures,
      };
      try {
        this.onFailure?.();
      } catch {
        /* Never affect business outcomes. */
      }
    }
    match(stage)
      .with("prewrite", () => {
        this.dropped += count;
      })
      .with("append", () => {
        this.uncertain += count;
      })
      .with("retention", () => {
        this.retentionFailures++;
      })
      .exhaustive();
  }
  private async persist(batch: string, count: number): Promise<boolean> {
    const file = join(this.directory, "main.jsonl");
    try {
      await this.io.mkdir(this.directory, { recursive: true, mode: 0o700 });
      if (this.size === 0) {
        try {
          this.size = (await this.io.stat(file)).size;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !("code" in error) ||
            error.code !== "ENOENT"
          )
            throw error;
        }
      }
      if (
        this.size > 0 &&
        this.size + Buffer.byteLength(batch) > 10 * 1024 * 1024
      ) {
        await this.io.rename(
          file,
          join(this.directory, `main-${Date.now()}.jsonl`),
        );
        this.size = 0;
      }
    } catch {
      this.fail("prewrite", count);
      return false;
    }
    try {
      await this.io.appendFile(file, batch, { mode: 0o600 });
      this.size += Buffer.byteLength(batch);
    } catch {
      // The next successful attempt samples the physical size again.
      this.size = 0;
      this.fail("append", count);
      return false;
    }
    try {
      const names = (await this.io.readdir(this.directory))
        .filter((n) => /^main-\d+\.jsonl$/.test(n))
        .sort()
        .reverse();
      let total = this.size;
      for (const name of names) {
        const path = join(this.directory, name);
        const info = await this.io.stat(path);
        total += info.size;
        if (
          total > 100 * 1024 * 1024 ||
          Date.now() - info.mtimeMs > 7 * 86400000
        )
          await this.io.unlink(path);
      }
    } catch {
      this.fail("retention", 0);
      return false;
    }
    return true;
  }
  private async writeBatch(): Promise<void> {
    if (this.queue.length === 0) return;
    const lines = this.queue.splice(0, 100);
    const batch = lines.join("");
    this.bytes -= Buffer.byteLength(batch);
    this.inFlight = lines.length;
    try {
      if (!(await this.persist(batch, lines.length))) return;
      const episode = this.episode;
      if (!episode) return;
      const gap: DiagnosticWriterGap = {
        startedAt: episode.startedAt,
        recoveredAt: new Date().toISOString(),
        dropped: this.dropped - episode.dropped,
        uncertain: this.uncertain - episode.uncertain,
        retentionFailures: this.retentionFailures - episode.retentionFailures,
      };
      this.episode = undefined;
      this.degraded = false;
      this.lastRecovery = gap;
      // One direct bounded summary attempt; never recursively record/flush itself.
      const summary = this.serialize(
        {
          traceId: randomUUID(),
          requestId: randomUUID(),
          connectionId: this.processInstanceId,
          operation: "diagnostics:writer",
          stage: "completed",
        },
        gap,
      );
      if (summary && !this.drainExpired) {
        this.inFlight = 1;
        await this.persist(summary, 1);
      }
    } finally {
      this.inFlight = 0;
    }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.accepting = false;
    clearInterval(this.timer);
    this.closing = this.closeWithinBudget();
    return this.closing;
  }
  private async closeWithinBudget(): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const drain = async () => {
      while (!this.drainExpired && (this.queue.length > 0 || this.writing))
        await this.flush();
    };
    await Promise.race([
      drain(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          this.drainExpired = true;
          this.drainTimedOut++;
          this.dropped += this.queue.length;
          this.queue = [];
          this.bytes = 0;
          resolve();
        }, 2000);
      }),
    ]);
    clearTimeout(timeout);
    this.drainExpired = true;
  }
}
