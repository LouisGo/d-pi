import { z } from "zod";
import { ProjectReferenceEntrySchema } from "../../modules/files/contracts/public";
import {
  AttachmentFailureReasonSchema,
  AttachmentSchema,
  AttachmentStorageReportSchema,
} from "../../modules/input/contracts/public";
import { ThreadIdSchema, TraceIdSchema } from "../../shared/identity";

const identity = { threadId: ThreadIdSchema, traceId: TraceIdSchema };
export const AttachmentRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...identity,
    kind: z.enum(["list", "choose-import", "check-storage", "clean-storage"]),
  }),
  z.strictObject({
    ...identity,
    kind: z.literal("import-bytes"),
    name: z.string().min(1).max(512),
    mimeType: z.string().max(128),
    dataBase64: z.string().max(34952536),
    source: z.enum(["paste", "drop"]),
  }),
  z.strictObject({
    ...identity,
    kind: z.literal("add-reference"),
    path: z.string().min(1).max(4096),
    referenceKind: z.enum(["file", "directory"]).optional(),
  }),
  z.strictObject({
    ...identity,
    kind: z.literal("search-reference"),
    query: z.string().max(4096),
    refresh: z.boolean().optional(),
  }),
  z.strictObject({
    ...identity,
    kind: z.enum(["preview", "retry"]),
    id: z.uuid(),
  }),
  z.strictObject({
    ...identity,
    kind: z.literal("set-text-only"),
    id: z.uuid(),
    value: z.boolean(),
  }),
]);
export type AttachmentRequest = z.infer<typeof AttachmentRequestSchema>;
export const AttachmentReplySchema = z.discriminatedUnion("kind", [
  AttachmentStorageReportSchema,
  z.strictObject({
    kind: z.literal("attachments"),
    items: z.array(AttachmentSchema),
  }),
  z.strictObject({ kind: z.literal("cancelled") }),
  z.strictObject({
    kind: z.literal("search"),
    entries: z.array(ProjectReferenceEntrySchema).max(100),
    truncated: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("image"),
    dataUrl: z.string().max(34952700),
  }),
  z.strictObject({
    kind: z.literal("text"),
    text: z.string().max(1048576),
    truncated: z.boolean().optional(),
  }),
  z.strictObject({
    kind: z.literal("unavailable"),
    reason: AttachmentFailureReasonSchema,
  }),
]);
export type AttachmentReply = z.infer<typeof AttachmentReplySchema>;
export interface AttachmentBridge {
  request(command: AttachmentRequest): Promise<AttachmentReply>;
}
