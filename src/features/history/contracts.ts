import { z } from "zod";
export const HistoryCursorSchema = z.strictObject({
  threadId: z.uuid(),
  source: z.string(),
  offset: z.number().int().nonnegative(),
});
export type HistoryCursor = z.infer<typeof HistoryCursorSchema>;
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
  read(threadId: string, cursor: HistoryCursor | null): Promise<HistoryPage>;
}
