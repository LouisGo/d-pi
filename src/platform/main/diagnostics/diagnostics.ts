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
import { BUILD_INFO } from "../../../shared/build-info";
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
}
export class Diagnostics {
  readonly processInstanceId = randomUUID();
  private queue: string[] = [];
  private bytes = 0;
  private timer: ReturnType<typeof setInterval>;
  private writing: Promise<void> | null = null;
  private size = 0;
  dropped = 0;
  degraded = false;
  constructor(
    private readonly directory: string,
    private readonly onFailure?: () => void,
  ) {
    this.timer = setInterval(() => {
      void this.flush();
    }, 100);
    this.timer.unref();
  }
  record(event: DiagnosticEvent): void {
    const line =
      JSON.stringify({
        schemaVersion: 1,
        time: new Date().toISOString(),
        process: "main",
        processInstanceId: this.processInstanceId,
        build: BUILD_INFO,
        ...event,
      }) + "\n";
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
    this.writing = this.writeBatch().finally(() => {
      this.writing = null;
    });
    return this.writing;
  }
  private async writeBatch(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, 100).join("");
    this.bytes -= Buffer.byteLength(batch);
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const file = join(this.directory, "main.jsonl");
      if (this.size === 0) {
        try {
          this.size = (await stat(file)).size;
        } catch {
          this.size = 0;
        }
      }
      if (this.size + Buffer.byteLength(batch) > 10 * 1024 * 1024) {
        await rename(file, join(this.directory, `main-${Date.now()}.jsonl`));
        this.size = 0;
      }
      await appendFile(file, batch, { mode: 0o600 });
      this.size += Buffer.byteLength(batch);
      const names = (await readdir(this.directory))
        .filter((n) => /^main-\d+\.jsonl$/.test(n))
        .sort()
        .reverse();
      let total = this.size;
      for (const name of names) {
        const path = join(this.directory, name);
        const info = await stat(path);
        total += info.size;
        if (
          total > 100 * 1024 * 1024 ||
          Date.now() - info.mtimeMs > 7 * 86400000
        )
          await unlink(path);
      }
    } catch {
      const firstFailure = !this.degraded;
      this.degraded = true;
      this.dropped += batch.split("\n").length - 1;
      if (firstFailure) {
        try {
          this.onFailure?.();
        } catch {
          /* Reporting cannot affect business outcomes. */
        }
      }
    }
  }
  async close(): Promise<void> {
    clearInterval(this.timer);
    const drain = async () => {
      while (this.queue.length > 0 || this.writing) await this.flush();
    };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      drain(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 2000);
      }),
    ]);
    clearTimeout(timeout);
  }
}
