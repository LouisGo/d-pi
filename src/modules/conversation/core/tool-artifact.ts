import { z } from "zod";
import type { ToolArtifact } from "../../resources/contracts/public";

const ReferenceSchema = z.object({
  artifactId: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
  totalBytes: z.number().int().nonnegative().optional(),
  artifactElidedBytes: z.number().int().nonnegative().optional(),
});
const PayloadSchema = z.object({
  details: z.object({
    meta: z.object({
      truncation: ReferenceSchema.optional(),
      limits: z
        .object({ columnTruncated: ReferenceSchema.optional() })
        .optional(),
      artifactError: z.unknown().optional(),
    }),
  }),
});

/** OMP18.8.9 structured evidence only; displayed artifact:// text grants no read. */
export function decodeToolArtifact(payload: unknown): ToolArtifact | undefined {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) return undefined;
  const meta = parsed.data.details.meta;
  if (meta.artifactError != null) return undefined;
  const truncation = meta.truncation;
  const column = meta.limits?.columnTruncated;
  if (
    truncation?.artifactId &&
    column?.artifactId &&
    truncation.artifactId !== column.artifactId
  )
    return undefined;
  const reference = truncation?.artifactId ? truncation : column;
  if (!reference?.artifactId) return undefined;
  return {
    key: reference.artifactId,
    coverage: reference.artifactElidedBytes
      ? "partial"
      : reference.totalBytes === undefined
        ? "unknown"
        : "complete",
    ...(reference.totalBytes === undefined
      ? {}
      : { expectedBytes: reference.totalBytes }),
    ...(reference.artifactElidedBytes === undefined
      ? {}
      : { elidedBytes: reference.artifactElidedBytes }),
  };
}
