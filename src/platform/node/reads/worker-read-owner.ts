import { Worker, type WorkerOptions } from "node:worker_threads";
import {
  ReadCancelledError,
  ReadOperationError,
  throwIfReadCancelled,
} from "../../../shared/read-operation";

export interface ReadWorkerPort {
  on(event: "message", listener: (value: unknown) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  removeAllListeners(): unknown;
  terminate(): Promise<number>;
}
export interface WorkerReadOptions {
  maxActive?: number;
  timeoutMs?: number;
  spawn?: (entry: URL, options: WorkerOptions) => ReadWorkerPort;
}

/** Physical worker permits; cancellation and timeout retain them through exit. */
export class WorkerReadOwner {
  private readonly active = new Map<
    ReadWorkerPort,
    { stop: () => void; completion: Promise<unknown> }
  >();
  private readonly spawn: NonNullable<WorkerReadOptions["spawn"]>;
  private readonly maxActive: number;
  private closed = false;
  private closing: Promise<void> | undefined;
  private peakActive = 0;
  private spawned = 0;
  constructor(
    private readonly entry: URL,
    private readonly options: WorkerReadOptions = {},
  ) {
    this.maxActive = options.maxActive ?? 2;
    this.spawn =
      options.spawn ?? ((entry, options) => new Worker(entry, options));
  }
  snapshot() {
    return {
      active: this.active.size,
      peakActive: this.peakActive,
      spawned: this.spawned,
      maxActive: this.maxActive,
    };
  }
  async run<T>(
    task: unknown,
    decode: (raw: unknown) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    throwIfReadCancelled(signal);
    if (this.closed) throw new ReadOperationError("owner-released");
    if (this.active.size >= this.maxActive)
      throw new ReadOperationError("busy", true);
    let worker: ReadWorkerPort;
    try {
      worker = this.spawn(this.entry, {
        workerData: task,
        trackUnmanagedFds: true,
        execArgv: [],
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 32,
          stackSizeMb: 4,
        },
      });
    } catch (cause) {
      throw new ReadOperationError("process-spawn", true, { cause });
    }
    let resolve: (reply: T) => void = () => {};
    let reject: (error: unknown) => void = () => {};
    const completion = new Promise<T>((accept, fail) => {
      resolve = accept;
      reject = fail;
    });
    let stopping = false;
    let timedOut = false;
    let received = false;
    let reply: unknown;
    let failure: unknown;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      void worker.terminate().catch((error: unknown) => {
        failure = error;
      });
    };
    const timer =
      this.options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            if (stopping) return;
            timedOut = true;
            stop();
          }, this.options.timeoutMs);
    timer?.unref();
    this.active.set(worker, { stop, completion });
    this.spawned++;
    this.peakActive = Math.max(this.peakActive, this.active.size);
    worker.on("message", (value) => {
      if (received) {
        failure = new ReadOperationError("malformed-output");
        stop();
        return;
      }
      received = true;
      reply = value;
    });
    worker.on("error", (error) => {
      failure = error;
    });
    worker.on("exit", (code) => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      worker.removeAllListeners();
      this.active.delete(worker);
      if (failure instanceof ReadOperationError) {
        reject(failure);
        return;
      }
      if (timedOut) {
        reject(new ReadOperationError("timeout", true));
        return;
      }
      if (stopping || signal?.aborted) {
        reject(new ReadCancelledError());
        return;
      }
      if (failure || code !== 0) {
        reject(new ReadOperationError("process-exit", true));
        return;
      }
      if (!received) {
        reject(new ReadOperationError("malformed-output"));
        return;
      }
      try {
        resolve(decode(reply));
      } catch {
        reject(new ReadOperationError("malformed-output"));
      }
    });
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
    return completion;
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    const workers = [...this.active.values()];
    for (const worker of workers) worker.stop();
    this.closing = Promise.allSettled(
      workers.map((worker) => worker.completion),
    ).then(() => {});
    return this.closing;
  }
}
