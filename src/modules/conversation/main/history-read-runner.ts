import { match } from "ts-pattern";
import { z } from "zod";
import {
  type WorkerReadOptions,
  WorkerReadOwner,
} from "../../../platform/node/reads/public";
import {
  ReadIdentitySchema,
  ReadOperationError,
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
  artifactKey: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
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
/** History contracts remain here; physical reads share the Node worker owner. */
export class HistoryReadRunner {
  private readonly owner: WorkerReadOwner;
  constructor(entry: URL, options: WorkerReadOptions = {}) {
    this.owner = new WorkerReadOwner(entry, options);
  }
  snapshot() {
    return this.owner.snapshot();
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
    return this.owner.run(task, (raw) => replySchema.parse(raw), signal);
  }
  close(): Promise<void> {
    return this.owner.close();
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
        task.artifactKey,
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
