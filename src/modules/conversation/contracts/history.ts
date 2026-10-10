import { z } from "zod";
import { MessageTimestampSchema } from "./message-time";
import { ToolExecutionObservationSchema } from "./tool-observation";
export const HistoryCursorSchema = z.strictObject({
  threadId: z.uuid(),
  source: z.string(),
  offset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative().optional(),
  /** Extend a verified frozen snapshot from offset to the current EOF. */
  append: z.literal(true).optional(),
  prefixHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export type HistoryCursor = z.infer<typeof HistoryCursorSchema>;
export const HistoryToolEffectSchema = z.enum([
  "mutation",
  "no-mutation",
  "unknown",
]);
export type HistoryToolEffect = z.infer<typeof HistoryToolEffectSchema>;
export const HistoryImageSchema = z.strictObject({
  index: z.number().int().nonnegative().max(127),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().max(512).optional(),
});
export type HistoryImage = z.infer<typeof HistoryImageSchema>;
export const HistoryFileSchema = z.strictObject({
  contextKind: z.enum(["project", "external"]).optional(),
  referenceKind: z.enum(["file", "directory"]).optional(),
  name: z.string().max(512),
  byteLength: z.number().int().nonnegative(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
});
export type HistoryFile = z.infer<typeof HistoryFileSchema>;
export const HistoryEntrySchema = z.strictObject({
  id: z.string(),
  parentId: z.string().nullable(),
  role: z.string(),
  text: z.string(),
  thinking: z.string().optional(),
  timestamp: MessageTimestampSchema.optional(),
  displayText: z.string().optional(),
  /** Verified submitted draft order; indexes refer to frozen files, never live paths. */
  inputParts: z
    .array(
      z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("text"), text: z.string() }),
        z.strictObject({
          kind: z.literal("file"),
          index: z.number().int().nonnegative().max(127),
        }),
      ]),
    )
    .optional(),
  images: z.array(HistoryImageSchema).max(128).optional(),
  files: z.array(HistoryFileSchema).max(128).optional(),
  mediaCursor: HistoryCursorSchema.optional(),
  state: z.enum(["complete", "failed", "aborted"]).optional(),
  detail: z.string().max(4096).optional(),
  toolEvidence: z
    .strictObject({
      toolCallId: z.string().max(256),
      toolName: z.string().max(120),
      isError: z.boolean().nullable(),
      effect: HistoryToolEffectSchema,
      coverage: z.literal("text-parts-only"),
      nonTextParts: z.number().int().nonnegative(),
    })
    .optional(),
  tool: ToolExecutionObservationSchema.optional(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export const HistoryPageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("page"),
    entries: z.array(HistoryEntrySchema),
    next: HistoryCursorSchema.nullable(),
    /** Last committed newline, including when next is null or the tail is partial. */
    continuation: HistoryCursorSchema.optional(),
    source: z.string(),
    coverage: z.literal("append-order"),
    incompleteTail: z.boolean(),
    omitted: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal("unavailable"),
    reason: z.enum([
      "unbound",
      "missing",
      "denied",
      "changed",
      "unsupported",
      "invalid",
      "cancelled",
    ]),
  }),
]);
export type HistoryPage = z.infer<typeof HistoryPageSchema>;
export const HistoryRequestSchema = z.strictObject({
  threadId: z.uuid(),
  cursor: HistoryCursorSchema.nullable(),
});
export interface HistoryBridge {
  image?(
    threadId: string,
    cursor: HistoryCursor,
    recordId: string,
    index: number,
    traceId: string,
  ): Promise<HistoryImageReply>;
  projectList(threadId: string): Promise<ProjectHistoryCatalog>;
  projectRead(
    threadId: string,
    key: string,
    cursor: HistoryCursor | null,
  ): Promise<HistoryPage>;
  read(threadId: string, cursor: HistoryCursor | null): Promise<HistoryPage>;
}
export const HistoryImageRequestSchema = z.strictObject({
  traceId: z.uuid(),
  threadId: z.uuid(),
  cursor: HistoryCursorSchema,
  recordId: z.string().min(1).max(512),
  index: z.number().int().nonnegative().max(127),
});
export const HistoryImageReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("image"),
    dataUrl: z
      .string()
      .max(44739300)
      .regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/),
  }),
  z.strictObject({
    kind: z.literal("unavailable"),
    reason: z.enum([
      "missing",
      "denied",
      "changed",
      "unsupported",
      "invalid",
      "cancelled",
      "unbound",
    ]),
  }),
]);
export type HistoryImageReply = z.infer<typeof HistoryImageReplySchema>;

export const ProjectHistoryCatalogSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("catalog"),
    sessions: z.array(
      z.strictObject({
        key: z.string().regex(/^[a-f0-9]{64}$/),
        sessionId: z.string(),
        title: z.string(),
        modifiedAt: z.number(),
      }),
    ),
    partial: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("unavailable"),
    reason: z.enum(["missing", "denied", "invalid"]),
  }),
]);
export type ProjectHistoryCatalog = z.infer<typeof ProjectHistoryCatalogSchema>;
export const ProjectHistoryRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("list"),
    threadId: z.uuid(),
    traceId: z.uuid(),
  }),
  z.strictObject({
    kind: z.literal("read"),
    threadId: z.uuid(),
    traceId: z.uuid(),
    key: z.string().regex(/^[a-f0-9]{64}$/),
    cursor: HistoryCursorSchema.nullable(),
  }),
]);
