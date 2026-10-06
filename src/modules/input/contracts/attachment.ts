import { z } from "zod";

export const AttachmentFailureReasonSchema = z.enum([
  "invalid-token",
  "attachment-not-found",
  "source-too-large",
  "submission-too-large",
  "transport-too-large",
  "storage-full",
  "storage-unavailable",
  "content-corrupt",
  "content-missing",
  "unsupported-format",
  "invalid-encoding",
  "invalid-image",
  "image-decoder-unavailable",
  "pdf-conversion-unavailable",
  "pdf-conversion-failed",
  "pdf-coverage-gap",
  "pdf-too-many-pages",
  "reference-unavailable",
  "reference-denied",
]);
export type AttachmentFailureReason = z.infer<
  typeof AttachmentFailureReasonSchema
>;
export const AttachmentSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z.uuid(),
    threadId: z.uuid(),
    token: z.string().max(80),
    name: z.string().min(1).max(512),
    mimeType: z.string().max(128),
    byteLength: z.number().int().nonnegative(),
    capturedAt: z.string().datetime(),
    source: z.enum(["file", "paste", "drop", "reference"]),
    path: z.string().min(1).max(4096).optional(),
    referenceKind: z.enum(["file", "directory"]).optional(),
    status: z.enum(["preparing", "ready", "failed"]),
    reason: AttachmentFailureReasonSchema.optional(),
    representation: z.enum([
      "text",
      "image",
      "pdf-text",
      "reference",
      "unsupported",
    ]),
    coverageGaps: z.array(z.string().max(128)).max(101),
    textOnly: z.boolean(),
    inputDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    converterVersion: z.string().max(128).optional(),
  })
  .superRefine((attachment, ctx) => {
    if (attachment.token !== `[[dpi-attachment:${attachment.id}]]`)
      ctx.addIssue({
        code: "custom",
        message: "invalid-token",
        path: ["token"],
      });
    if (attachment.status === "failed" && !attachment.reason)
      ctx.addIssue({
        code: "custom",
        message: "failure-reason-required",
        path: ["reason"],
      });
    if (attachment.status !== "failed" && attachment.reason)
      ctx.addIssue({
        code: "custom",
        message: "unexpected-failure-reason",
        path: ["reason"],
      });
    if (attachment.source === "reference" && !attachment.path)
      ctx.addIssue({
        code: "custom",
        message: "reference-path-required",
        path: ["path"],
      });
  });
export type Attachment = z.infer<typeof AttachmentSchema>;
export const PreparedContentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  message: z.string(),
  images: z.array(
    z.strictObject({
      type: z.literal("image"),
      data: z.string(),
      mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    }),
  ),
  sources: z.array(
    z.strictObject({
      attachmentId: z.uuid(),
      inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
      derivedDigest: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      representation: AttachmentSchema.shape.representation,
      converterVersion: z.string().max(128),
      coverageGaps: z.array(z.string().max(128)),
      byteLength: z.number().int().nonnegative(),
      name: z.string().max(512),
      path: z.string().max(4096).optional(),
      referenceKind: z.enum(["file", "directory"]).optional(),
      version: z.string().max(256).optional(),
    }),
  ),
  rawBytes: z.number().int().nonnegative(),
});
export type PreparedContent = z.infer<typeof PreparedContentSchema>;
export type ContentPreparationResult =
  | { ok: true; content: PreparedContent }
  | { ok: false; reason: AttachmentFailureReason; attachmentId?: string };
export type AttachmentPreview =
  | { kind: "image"; dataUrl: string }
  | { kind: "text"; text: string; truncated?: boolean | undefined }
  | { kind: "unavailable"; reason: AttachmentFailureReason };

export const AttachmentStorageReportSchema = z.strictObject({
  kind: z.literal("storage-report"),
  checkedObjects: z.number().int().nonnegative(),
  remainingObjects: z.number().int().nonnegative(),
  retainedObjects: z.number().int().nonnegative(),
  unreferencedObjects: z.number().int().nonnegative(),
  deletedObjects: z.number().int().nonnegative(),
  deletedBytes: z.number().int().nonnegative(),
  issues: z
    .array(
      z.strictObject({
        attachmentId: z.uuid(),
        name: z.string().max(512),
        digest: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        object: z.enum(["original", "derived"]),
        reason: z.enum([
          "content-missing",
          "content-corrupt",
          "storage-unavailable",
        ]),
      }),
    )
    .max(128),
  issuesTruncated: z.boolean(),
  discoveryPending: z.boolean().optional(),
  manifestScanIncomplete: z.boolean().optional(),
  referenceScanIncomplete: z.boolean().optional(),
});
export type AttachmentStorageReport = z.infer<
  typeof AttachmentStorageReportSchema
>;
