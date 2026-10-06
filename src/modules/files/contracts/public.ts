import { z } from "zod";
import { TraceIdSchema } from "../../../shared/identity";

export const ProjectPathSchema = z.string().max(4096);
export const ProjectReferenceEntrySchema = z.strictObject({
  path: ProjectPathSchema,
  name: z.string().max(512),
  kind: z.enum(["file", "directory"]),
});
export type ProjectReferenceEntry = z.infer<typeof ProjectReferenceEntrySchema>;
export const FileRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("list"),
    traceId: TraceIdSchema,
    threadId: z.uuid(),
    path: ProjectPathSchema,
  }),
  z.strictObject({
    kind: z.literal("read"),
    traceId: TraceIdSchema,
    threadId: z.uuid(),
    path: ProjectPathSchema,
  }),
]);
export type FileRequest = z.infer<typeof FileRequestSchema>;
export const FileEntrySchema = z.strictObject({
  path: ProjectPathSchema,
  name: z.string(),
  kind: z.enum(["file", "directory", "symlink", "other"]),
});
export const FileUnavailableSchema = z.strictObject({
  kind: z.literal("unavailable"),
  reason: z.enum([
    "missing",
    "denied",
    "binary",
    "invalid-encoding",
    "too-large",
    "changed",
    "not-file",
    "failed",
  ]),
});
export const FileReplySchema = z.discriminatedUnion("kind", [
  FileUnavailableSchema,
  z.strictObject({
    kind: z.literal("entries"),
    path: ProjectPathSchema,
    entries: z.array(FileEntrySchema),
    truncated: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("text"),
    path: ProjectPathSchema,
    text: z.string(),
    bytes: z.number().int().nonnegative(),
    version: z.string(),
    capturedAt: z.string(),
    coverage: z.literal("complete"),
  }),
]);
export type FileReply = z.infer<typeof FileReplySchema>;
export interface FileBridge {
  request(command: FileRequest): Promise<FileReply>;
}
