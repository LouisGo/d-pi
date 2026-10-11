import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../../shared/identity";
import { utf8ByteLength } from "../../../shared/text/utf8";
import { AnswerSchema, DialogSchema, RequestKeySchema } from "./interactions";

export const AnswerSendStatusSchema = z.enum([
  "dispatching",
  "not-dispatched",
  "written",
  "unknown",
]);
const historyBase = {
  requestKey: RequestKeySchema,
  dialog: DialogSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};
export const AnswerHistoryEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...historyBase,
    kind: z.literal("request"),
    presence: z.enum(["observed", "ended", "unknown"]),
  }),
  z.strictObject({
    ...historyBase,
    kind: z.literal("answer"),
    operationId: TraceIdSchema,
    origin: z.enum(["user", "default"]),
    answer: AnswerSchema,
    status: AnswerSendStatusSchema,
    answerObservedAt: z.iso.datetime().optional(),
  }),
]);
export type AnswerHistoryEntry = z.infer<typeof AnswerHistoryEntrySchema>;
export const AnswerHistoryQuerySchema = z.strictObject({
  threadId: ThreadIdSchema,
  cursor: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable()
    .default(null),
});
export const AnswerHistoryPageSchema = z
  .strictObject({
    threadId: ThreadIdSchema,
    // This is durable App observation, not a reconstruction of older native asks.
    source: z.literal("app-observed"),
    entries: z.array(AnswerHistoryEntrySchema).max(20),
    cursor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  })
  .refine(
    (page) => utf8ByteLength(JSON.stringify(page)) <= 2 * 1024 * 1024,
    "Answer history page exceeds byte budget",
  );
export type AnswerHistoryPage = z.infer<typeof AnswerHistoryPageSchema>;
export const AnswerHistoryRequestSchema = AnswerHistoryQuerySchema.extend({
  traceId: TraceIdSchema,
});
export interface AnswerHistoryBridge {
  request(
    request: z.infer<typeof AnswerHistoryRequestSchema>,
  ): Promise<AnswerHistoryPage>;
}
