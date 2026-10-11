import { Worker, type WorkerOptions } from "node:worker_threads";
import { match } from "ts-pattern";
import { z } from "zod";
import {
  ReadCancelledError,
  ReadIdentitySchema,
  ReadOperationError,
  throwIfReadCancelled,
} from "../../../shared/read-operation";
import {
  SourceRefSchema,
  type ToolDetailReply,
  ToolDetailReplySchema,
} from "../../resources/contracts/public";
import { NativeSessionBindingSchema } from "../../threads/contracts/public";
import {
  HistoryCursorSchema,
  type HistoryImageReply,
  HistoryImageReplySchema,
  type HistoryPage,
  HistoryPageSchema,
  type ProjectHistoryCatalog,
  ProjectHistoryCatalogSchema,
} from "../contracts/history";
import {
  readNativeHistory,
  readNativeImage,
  readNativeTool,
} from "./native-history";
import {
  listProjectNativeHistory,
  readProjectNativeHistory,
} from "./project-history";

/** Private Main-owned task. Renderer never supplies filesystem roots or bindings. */
const HistoryReadTaskSchema = ReadIdentitySchema.extend({
  root: z.string().min(1),
  binding: NativeSessionBindingSchema,
  cursor: HistoryCursorSchema.nullable(),
  projectDirectory: z.string().optional(),
  range: z.literal("tail").optional(),
});
export type HistoryReadTask = z.infer<typeof HistoryReadTaskSchema>;
const HistoryToolTaskSchema = HistoryReadTaskSchema.omit({
  range: true,
}).extend({
  source: SourceRefSchema,
  recordId: z.string().min(1).max(512),
  readerId: z.uuid(),
});
const HistoryImageTaskSchema = HistoryReadTaskSchema.omit({
  range: true,
  cursor: true,
}).extend({
  cursor: HistoryCursorSchema,
  recordId: z.string().min(1).max(512),
  index: z.number().int().nonnegative().max(127),
  blobsDirectory: z.string().optional(),
});
const ProjectListTaskSchema = ReadIdentitySchema.extend({
  root: z.string().min(1),
  directory: z.string().min(1),
  threadId: z.uuid(),
});
const ProjectPageTaskSchema = ProjectListTaskSchema.extend({
  key: z.string().regex(/^[a-f0-9]{64}$/),
  cursor: HistoryCursorSchema.nullable(),
});
const WorkerTaskSchema = z.discriminatedUnion("kind", [
  HistoryReadTaskSchema.extend({ kind: z.literal("page") }),
  HistoryToolTaskSchema.extend({ kind: z.literal("tool") }),
  HistoryImageTaskSchema.extend({ kind: z.literal("image") }),
  ProjectListTaskSchema.extend({ kind: z.literal("project-list") }),
  ProjectPageTaskSchema.extend({ kind: z.literal("project-page") }),
]);
type WorkerTask = z.infer<typeof WorkerTaskSchema>;
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
    const task = HistoryReadTaskSchema.parse(input);
    const page = await this.execute(
      { ...task, kind: "page" },
      HistoryPageSchema,
      signal,
    );
    if (
      page.kind === "page" &&
      page.nativeSessionKey !== task.binding.sessionId
    )
      throw new ReadOperationError("invalid-reply");
    return page;
  }
  tool(
    input: z.infer<typeof HistoryToolTaskSchema>,
    signal?: AbortSignal,
  ): Promise<ToolDetailReply> {
    return this.execute(
      { ...HistoryToolTaskSchema.parse(input), kind: "tool" },
      ToolDetailReplySchema,
      signal,
    );
  }
  image(
    input: z.infer<typeof HistoryImageTaskSchema>,
    signal?: AbortSignal,
  ): Promise<HistoryImageReply> {
    return this.execute(
      { ...HistoryImageTaskSchema.parse(input), kind: "image" },
      HistoryImageReplySchema,
      signal,
    );
  }
  projectList(
    input: z.infer<typeof ProjectListTaskSchema>,
    signal?: AbortSignal,
  ): Promise<ProjectHistoryCatalog> {
    return this.execute(
      { ...ProjectListTaskSchema.parse(input), kind: "project-list" },
      ProjectHistoryCatalogSchema,
      signal,
    );
  }
  projectRead(
    input: z.infer<typeof ProjectPageTaskSchema>,
    signal?: AbortSignal,
  ): Promise<HistoryPage> {
    return this.execute(
      { ...ProjectPageTaskSchema.parse(input), kind: "project-page" },
      HistoryPageSchema,
      signal,
    );
  }
  private async execute<T>(
    task: WorkerTask,
    replySchema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    throwIfReadCancelled(signal);
    if (this.closed) throw new ReadOperationError("owner-released");
    if (this.active.size >= this.maxActive)
      throw new ReadOperationError("busy", true);
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
    let resolve: (reply: T) => void = () => {};
    let reject: (error: unknown) => void = () => {};
    const completion = new Promise<T>((accept, fail) => {
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
      const parsed = replySchema.safeParse(reply);
      if (!received || !parsed.success) {
        reject(new ReadOperationError("malformed-output"));
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
): Promise<
  HistoryPage | HistoryImageReply | ToolDetailReply | ProjectHistoryCatalog
> {
  const task = WorkerTaskSchema.parse(raw);
  return match(task)
    .with({ kind: "page" }, (task) =>
      readNativeHistory(
        task.root,
        task.binding,
        task.cursor,
        undefined,
        task.projectDirectory,
        undefined,
        undefined,
        task.range,
      ),
    )
    .with({ kind: "tool" }, (task) =>
      readNativeTool(
        task.root,
        task.binding,
        task.source,
        task.cursor,
        task.recordId,
        task.readerId,
        task.projectDirectory,
      ),
    )
    .with({ kind: "image" }, (task) =>
      readNativeImage(
        task.root,
        task.binding,
        task.cursor,
        task.recordId,
        task.index,
        task.projectDirectory,
        task.blobsDirectory,
      ),
    )
    .with({ kind: "project-list" }, (task) =>
      listProjectNativeHistory(task.root, task.directory),
    )
    .with({ kind: "project-page" }, (task) =>
      readProjectNativeHistory(
        task.root,
        task.directory,
        task.threadId,
        task.key,
        task.cursor,
      ),
    )
    .exhaustive();
}
