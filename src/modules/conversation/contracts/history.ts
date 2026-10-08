import { z } from "zod";
export const HistoryCursorSchema = z.strictObject({
  threadId: z.uuid(),
  source: z.string(),
  offset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative().optional(),
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
export const HistoryEntrySchema = z.strictObject({
  id: z.string(),
  parentId: z.string().nullable(),
  role: z.string(),
  text: z.string(),
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
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export const HistoryPageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("page"),
    entries: z.array(HistoryEntrySchema),
    next: HistoryCursorSchema.nullable(),
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
  projectList(threadId: string): Promise<ProjectHistoryCatalog>;
  projectRead(
    threadId: string,
    key: string,
    cursor: HistoryCursor | null,
  ): Promise<HistoryPage>;
  read(threadId: string, cursor: HistoryCursor | null): Promise<HistoryPage>;
}

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
