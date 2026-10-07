import {
  type ChildProcess,
  type SpawnOptions,
  spawn,
} from "node:child_process";
import {
  ReadCancelledError,
  ReadOperationError,
  throwIfReadCancelled,
} from "../../../shared/read-operation";

export class GitOutputLimitError extends Error {
  constructor(
    readonly stream: "stdout" | "stderr",
    readonly maxBytes: number,
  ) {
    super("Git read output exceeded its byte budget");
  }
}
export type GitCommandResult =
  | { ok: true; data: Buffer }
  | {
      ok: false;
      data: Buffer;
      errorCode: string | null;
      stderr: string;
      failure: ReadOperationError;
    };
type RunInput = {
  cwd: string;
  args: string[];
  maxOutputBytes: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal | undefined;
  validate?: (() => void) | undefined;
};
type Pending = {
  input: RunInput;
  resolve: (value: GitCommandResult) => void;
  reject: (error: unknown) => void;
  removeAbort: () => void;
};

/** Main owns one instance. Permits represent live children, including stopping children. */
export class GitReadRunner {
  private readonly maxActive: number;
  private readonly maxQueued: number;
  private readonly spawnChild: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => ChildProcess;
  private readonly timeoutMs: number;
  private readonly stopGraceMs: number;
  private readonly queue: Pending[] = [];
  private readonly stops = new Map<ChildProcess, () => void>();
  private closed = false;
  private closePromise: Promise<void> | undefined;
  private readonly drains = new Set<() => void>();
  private counters = {
    active: 0,
    queued: 0,
    peakActive: 0,
    peakQueued: 0,
    spawned: 0,
  };

  constructor(
    options: {
      maxActive?: number;
      maxQueued?: number;
      timeoutMs?: number;
      stopGraceMs?: number;
      spawn?: (
        command: string,
        args: string[],
        options: SpawnOptions,
      ) => ChildProcess;
    } = {},
  ) {
    this.maxActive = options.maxActive ?? 4;
    this.maxQueued = options.maxQueued ?? 32;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.stopGraceMs = options.stopGraceMs ?? 500;
    this.spawnChild = options.spawn ?? spawn;
    if (
      ![this.maxActive, this.maxQueued, this.timeoutMs, this.stopGraceMs].every(
        Number.isSafeInteger,
      ) ||
      this.maxActive < 1 ||
      this.maxQueued < 0 ||
      this.timeoutMs < 1 ||
      this.stopGraceMs < 1
    )
      throw Error("Invalid Git read budget");
  }
  snapshot() {
    return { ...this.counters };
  }

  run(input: RunInput): Promise<GitCommandResult> {
    try {
      throwIfReadCancelled(input.signal);
    } catch (error) {
      return Promise.reject(error);
    }
    if (this.closed)
      return Promise.reject(new ReadOperationError("owner-released"));
    if (
      this.counters.active >= this.maxActive &&
      this.queue.length >= this.maxQueued
    )
      return Promise.reject(new ReadOperationError("busy"));
    return new Promise((resolve, reject) => {
      const entry: Pending = { input, resolve, reject, removeAbort: () => {} };
      if (this.counters.active < this.maxActive) this.start(entry);
      else {
        const abort = () => {
          const position = this.queue.indexOf(entry);
          if (position < 0) return;
          this.queue.splice(position, 1);
          this.counters.queued = this.queue.length;
          entry.removeAbort();
          reject(new ReadCancelledError());
        };
        entry.removeAbort = () =>
          input.signal?.removeEventListener("abort", abort);
        input.signal?.addEventListener("abort", abort, { once: true });
        this.queue.push(entry);
        this.counters.queued = this.queue.length;
        this.counters.peakQueued = Math.max(
          this.counters.peakQueued,
          this.queue.length,
        );
      }
    });
  }
  private start(entry: Pending): void {
    entry.removeAbort();
    if (entry.input.signal?.aborted) {
      entry.reject(new ReadCancelledError());
      this.pump();
      return;
    }
    try {
      entry.input.validate?.();
    } catch (error) {
      entry.reject(error);
      this.pump();
      return;
    }
    this.counters.active++;
    this.counters.peakActive = Math.max(
      this.counters.peakActive,
      this.counters.active,
    );
    let child: ChildProcess;
    try {
      child = this.spawnChild("git", entry.input.args, {
        cwd: entry.input.cwd,
        env: entry.input.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.counters.spawned++;
    } catch (cause) {
      this.counters.active--;
      entry.reject(new ReadOperationError("process-spawn", false, { cause }));
      this.pump();
      return;
    }
    const chunks = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
    const bytes = { stdout: 0, stderr: 0 };
    let failure: Error | undefined;
    let spawnCode: string | null = null;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), this.stopGraceMs);
      killTimer.unref();
    };
    const abort = () => stop(new ReadCancelledError());
    this.stops.set(child, abort);
    entry.input.signal?.addEventListener("abort", abort, { once: true });
    if (entry.input.signal?.aborted) abort();
    const timer = setTimeout(
      () => stop(new ReadOperationError("timeout", true)),
      this.timeoutMs,
    );
    timer.unref();
    for (const stream of ["stdout", "stderr"] as const) {
      child[stream]?.on("data", (value: Buffer) => {
        if (failure) return;
        const cap =
          stream === "stdout" ? entry.input.maxOutputBytes : 64 * 1024;
        if (value.length > cap - bytes[stream]) {
          stop(new GitOutputLimitError(stream, cap));
          return;
        }
        chunks[stream].push(value);
        bytes[stream] += value.length;
      });
      child[stream]?.on("error", (cause: unknown) =>
        stop(new ReadOperationError("output-read", true, { cause })),
      );
    }
    child.once("error", (cause: NodeJS.ErrnoException) => {
      spawnCode = cause.code ?? null;
      stop(new ReadOperationError("process-spawn", false, { cause }));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      entry.input.signal?.removeEventListener("abort", abort);
      this.stops.delete(child);
      this.counters.active--;
      const data = Buffer.concat(chunks.stdout, bytes.stdout);
      const stderr = Buffer.concat(chunks.stderr, bytes.stderr).toString(
        "utf8",
      );
      if (
        failure instanceof ReadCancelledError ||
        failure instanceof GitOutputLimitError
      )
        entry.reject(failure);
      else if (failure instanceof ReadOperationError)
        entry.resolve({
          ok: false,
          data,
          stderr,
          errorCode: spawnCode,
          failure,
        });
      else if (code !== 0)
        entry.resolve({
          ok: false,
          data,
          stderr,
          errorCode: null,
          failure: new ReadOperationError(
            "process-exit",
            /unable to create .*\.lock.*file exists|(?:unable to stat|lstat\(|error: open\().*no such file or directory/i.test(
              stderr,
            ),
          ),
        });
      else entry.resolve({ ok: true, data });
      this.pump();
    });
  }
  private pump(): void {
    while (
      !this.closed &&
      this.counters.active < this.maxActive &&
      this.queue.length
    ) {
      const next = this.queue.shift();
      this.counters.queued = this.queue.length;
      if (next) this.start(next);
    }
    if (this.counters.active === 0 && this.queue.length === 0) {
      for (const notify of this.drains) notify();
      this.drains.clear();
    }
  }
  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    for (const entry of this.queue.splice(0)) {
      entry.removeAbort();
      entry.reject(new ReadCancelledError());
    }
    this.counters.queued = 0;
    for (const stop of this.stops.values()) stop();
    this.closePromise =
      this.counters.active === 0
        ? Promise.resolve()
        : new Promise((resolve) => {
            this.drains.add(resolve);
          });
    return this.closePromise;
  }
}
