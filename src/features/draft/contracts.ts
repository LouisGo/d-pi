import { z } from "zod";
import { DRAFT_MAX_BYTES, draftByteLength } from "../../shared/draft-text";
import { ThreadIdSchema, TraceIdSchema } from "../../shared/identity";
import { UiMessageSchema } from "../localization/contracts";
import { ThreadContextSchema } from "../threads/contracts";
export const DraftTextSchema = z
  .string()
  .refine(
    (text) => draftByteLength(text) <= DRAFT_MAX_BYTES,
    "content-too-large",
  );
export const DraftSchema = ThreadContextSchema.extend({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  text: z.string(),
  consumedBy: z.uuid().optional(),
});
export type Draft = z.infer<typeof DraftSchema>;
export const FailureSchema = z.strictObject({
  errorId: z.uuid(),
  traceId: TraceIdSchema,
  code: z.enum([
    "storage-unavailable",
    "invalid-request",
    "directory-unavailable",
    "revision-conflict",
    "transport-unavailable",
    "content-too-large",
  ]),
  category: z.enum(["storage", "validation", "permission", "transport"]),
  observedAt: z.enum(["main", "renderer"]),
  reportedBy: z.enum(["app", "unknown"]),
  attribution: z.literal("unknown"),
  handlingOwner: z.literal("draft"),
  recovery: z.enum(["retry_safe", "reconcile_first", "user_action"]),
  message: UiMessageSchema,
  causeCode: z.string().max(80).optional(),
});
export type Failure = z.infer<typeof FailureSchema>;
export const SavedDraftSchema = z.strictObject({
  kind: z.literal("saved"),
  threadId: ThreadIdSchema,
  revision: z.number().int().nonnegative(),
});
export const DraftFailureReplySchema = z.strictObject({
  kind: z.literal("failed"),
  error: FailureSchema,
});
export const SaveReplySchema = z.discriminatedUnion("kind", [
  SavedDraftSchema,
  DraftFailureReplySchema,
]);
export type SaveReply = z.infer<typeof SaveReplySchema>;
