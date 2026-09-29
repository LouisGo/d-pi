import { z } from "zod";
import { TraceIdSchema } from "../../shared/identity";
import { ProjectPathSchema } from "../files/contracts";

export const ChangeScopeSchema = z.enum([
  "head-index",
  "index-worktree",
  "untracked",
]);
export type ChangeScope = z.infer<typeof ChangeScopeSchema>;
export const GitRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("list"),
    traceId: TraceIdSchema,
    threadId: z.uuid(),
  }),
  z.strictObject({
    kind: z.literal("diff"),
    traceId: TraceIdSchema,
    threadId: z.uuid(),
    scope: ChangeScopeSchema,
    path: ProjectPathSchema,
  }),
]);
export type GitRequest = z.infer<typeof GitRequestSchema>;
export const GitEntrySchema = z.strictObject({
  scope: ChangeScopeSchema,
  path: ProjectPathSchema,
  previousPath: ProjectPathSchema.optional(),
  status: z.enum([
    "added",
    "modified",
    "deleted",
    "renamed",
    "unmerged",
    "other",
  ]),
});
export const GitSideSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("text"),
    text: z.string(),
    source: z.string(),
    version: z.string(),
    coverage: z.literal("complete"),
  }),
  z.strictObject({ kind: z.literal("absent"), source: z.string() }),
]);
export const GitReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("unavailable"),
    reason: z.enum([
      "not-git",
      "git-unavailable",
      "missing",
      "denied",
      "binary",
      "too-large",
      "changed",
      "unmerged",
      "unsupported",
      "failed",
    ]),
  }),
  z.strictObject({
    kind: z.literal("changes"),
    repository: z.string(),
    head: z.string().nullable(),
    capturedAt: z.string(),
    coverage: z.literal("project-paths-current-sample"),
    entries: z.array(GitEntrySchema),
    truncated: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("diff"),
    repository: z.string(),
    head: z.string().nullable(),
    path: ProjectPathSchema,
    previousPath: ProjectPathSchema.optional(),
    scope: ChangeScopeSchema,
    capturedAt: z.string(),
    coverage: z.literal("single-file-current-sample"),
    left: GitSideSchema,
    right: GitSideSchema,
  }),
]);
export type GitReply = z.infer<typeof GitReplySchema>;
export interface GitBridge {
  request(command: GitRequest): Promise<GitReply>;
}
