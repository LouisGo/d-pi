import { z } from "zod";

const text = z.string().max(2048);
const path = z.string().max(4096);
const line = z.number().int().positive();
const base = {
  transportTool: z.string().max(120),
  effectiveTool: z.string().max(120),
  phase: z.enum(["intent", "progress", "result"]),
  partial: z.boolean(),
  truncated: z.boolean(),
};
export const ToolChangeSchema = z.strictObject({
  path,
  patch: text.optional(),
  firstChangedLine: line.optional(),
  operation: z.enum(["create", "delete", "update"]).optional(),
  sourcePath: path.optional(),
  failed: z.boolean(),
  snapshotsPruned: z.boolean(),
});
export const ToolSearchHitSchema = z.strictObject({
  path,
  count: z.number().int().nonnegative().optional(),
  ranges: z
    .array(z.strictObject({ start: line, end: line, snippet: text }))
    .max(8),
});
/** Bounded semantic evidence; paths are provenance, never filesystem authority. */
export const ToolSemanticSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("command"),
    command: text,
    cwd: path.optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("resource-read"),
    path,
    resourceType: z.enum(["file", "directory", "image", "internal"]),
    excerpt: text,
    startLine: line.optional(),
    lineNumbers: z.array(line.nullable()).max(64).optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("search"),
    query: text,
    scope: path,
    cwd: path.optional(),
    hits: z.array(ToolSearchHitSchema).max(8),
    excerpt: text,
    matchCount: z.number().int().nonnegative().optional(),
    fileCount: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("file-change"),
    changes: z.array(ToolChangeSchema).max(8),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("web-research"),
    url: path,
    finalUrl: path.optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("generic"),
    reason: z.enum(["unsupported", "invalid", "non-file", "help", "budget"]),
    internalSource: path.optional(),
  }),
]);
export type ToolSemantic = z.infer<typeof ToolSemanticSchema>;
export type ToolChange = z.infer<typeof ToolChangeSchema>;
export type ToolSearchHit = z.infer<typeof ToolSearchHitSchema>;
