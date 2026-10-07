import { z } from "zod";
import { ThreadIdSchema, TraceIdSchema } from "../../../shared/identity";
import { ProjectReferenceEntrySchema } from "../../files/contracts/public";
import {
  AttachmentFailureReasonSchema,
  AttachmentSchema,
  AttachmentStorageReportSchema,
} from "./attachment";

import { ClipboardFailureSchema, ClipboardTicketSchema } from "./clipboard";

const identity = { threadId: ThreadIdSchema, traceId: TraceIdSchema };
export const AttachmentRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...identity, kind: z.literal("clipboard-reserve") }),
  z.strictObject({
    ...identity,
    kind: z.literal("clipboard-export"),
    ticket: ClipboardTicketSchema,
    text: z.string().max(1048576),
    ids: z.array(z.uuid()).max(32),
  }),
  z.strictObject({
    ...identity,
    kind: z.literal("clipboard-import"),
    ticket: ClipboardTicketSchema,
  }),
  z.strictObject({
    ...identity,
    kind: z.literal("clipboard-release"),
    tickets: z.array(ClipboardTicketSchema).max(8),
  }),
  z.strictObject({
    ...identity,
    kind: z.literal("clipboard-discard"),
    ids: z.array(z.uuid()).max(32),
  }),
  z.strictObject({
    ...identity,
    kind: z.literal("history-open"),
    epoch: z.uuid(),
  }),
  z.strictObject({
    ...identity,
    kind: z.literal("history-update"),
    leaseId: z.uuid(),
    version: z.number().int().positive(),
    ids: z.array(z.uuid()).max(128),
  }),
  z.strictObject({
    ...identity,
    kind: z.literal("history-release"),
    leaseId: z.uuid(),
  }),
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
    kind: z.literal("clipboard-tickets"),
    tickets: z.array(ClipboardTicketSchema).max(2),
  }),
  z.strictObject({
    kind: z.literal("clipboard-exported"),
    degraded: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("clipboard-imported"),
    text: z.string().max(1048576),
    items: z.array(AttachmentSchema).max(32),
    degraded: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("clipboard-unavailable"),
    reason: ClipboardFailureSchema,
  }),
  z.strictObject({
    kind: z.literal("history-lease"),
    leaseId: z.uuid(),
    version: z.number().int().nonnegative(),
  }),
  z.strictObject({ kind: z.literal("history-released") }),
  z.strictObject({ kind: z.literal("history-limit") }),
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
