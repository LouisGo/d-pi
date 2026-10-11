import { Worker, type WorkerOptions } from "node:worker_threads";
import { z } from "zod";
import {
  ReadCancelledError,
  ReadIdentitySchema,
  ReadOperationError,
  throwIfReadCancelled,
} from "../../../shared/read-operation";
import { NativeSessionBindingSchema } from "../../threads/contracts/public";
import {
  HistoryCursorSchema,
  type HistoryPage,
  HistoryPageSchema,
} from "../contracts/history";
import { readNativeHistory } from "./native-history";

/** Private Main-owned task. Renderer never supplies filesystem roots or bindings. */
const HistoryReadTaskSchema = ReadIdentitySchema.extend({
  root: z.string().min(1),
  binding: NativeSessionBindingSchema,
  cursor: HistoryCursorSchema.nullable(),
  projectDirectory: z.string().optional(),
  range: z.literal("tail").optional(),
});
export type HistoryReadTask = z.infer<typeof HistoryReadTaskSchema>;
interface WorkerPort {
  on(event: "message", listener: (value: unknown) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  removeAllListeners(): unknown;
  terminate(): Promise<number>;
}

/** Permits are live worker threads, including stopping threads; no unbounded queue. */
export class HistoryReadRunner {
  private readonly active = new Map<
    WorkerPort,
    { stop: () => void; completion: Promise<unknown> }
  >();
  private readonly spawn: (entry: URL, options: WorkerOptions) => WorkerPort;
  private readonly maxActive: number;
  private closed = false;
  private closing: Promise<void> | undefined;
  private peakActive = 0;
  private spawned = 0;
  constructor(
    private readonly entry: URL,
    options: {
      maxActive?: number;
      spawn?: (entry: URL, options: WorkerOptions) => WorkerPort;
    } = {},
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
    };
  }
  async read(
    input: HistoryReadTask,
    signal?: AbortSignal,
  ): Promise<HistoryPage> {
    throwIfReadCancelled(signal);
    if (this.closed) throw new ReadOperationError("owner-released");
    if (this.active.size >= this.maxActive)
      throw new ReadOperationError("busy", true);
    const task = HistoryReadTaskSchema.parse(input);
    let worker: WorkerPort;
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
    let resolve: (reply: HistoryPage) => void = () => {};
    let reject: (error: unknown) => void = () => {};
    const completion = new Promise<HistoryPage>((accept, fail) => {
      resolve = accept;
      reject = fail;
    });
    let stopping = false;
    let received = false;
    let reply: unknown;
    let failure: unknown;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      // Exit owns finalization. A terminate request/ACK cannot release the slot.
      void worker.terminate().catch((error: unknown) => {
        failure = error;
      });
    };
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
      signal?.removeEventListener("abort", stop);
      worker.removeAllListeners();
      this.active.delete(worker);
      if (failure instanceof ReadOperationError) {
        reject(failure);
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
      const parsed = HistoryPageSchema.safeParse(reply);
      if (!received || !parsed.success) {
        reject(new ReadOperationError("malformed-output"));
        return;
      }
      if (
        parsed.data.kind === "page" &&
        parsed.data.nativeSessionKey !== task.binding.sessionId
      ) {
        reject(new ReadOperationError("invalid-reply"));
        return;
      }
      resolve(parsed.data);
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

/** Standalone entry calls this once; no worker/process is created on import. */
export async function runNativeHistoryWorker(
  raw: unknown,
): Promise<HistoryPage> {
  const task = HistoryReadTaskSchema.parse(raw);
  return readNativeHistory(
    task.root,
    task.binding,
    task.cursor,
    undefined,
    task.projectDirectory,
    undefined,
    undefined,
    task.range,
  );
}
