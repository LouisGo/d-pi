import { match } from "ts-pattern";
import { z } from "zod";
import { utf8ByteLength } from "../../../shared/text/utf8";

// Provenance only: no read authority, paths, App objects or view dependencies.
const identity = {
  threadId: z.uuid(),
  nativeSessionKey: z.string().min(1).max(512),
};
export const SourceRefSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("live-tool"),
    ...identity,
    connectionGeneration: z.uuid(),
    toolCallId: z.string().min(1).max(512),
  }),
  z.strictObject({
    kind: z.literal("native-record"),
    ...identity,
    recordId: z.string().min(1).max(512),
    revision: z.string().min(1).max(256),
  }),
  z.strictObject({
    kind: z.literal("native-artifact"),
    ...identity,
    recordId: z.string().min(1).max(512),
    recordRevision: z.string().min(1).max(256),
    artifactKey: z.string().regex(/^\d{1,20}$/),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);
export type SourceRef = z.infer<typeof SourceRefSchema>;
export function sourceKey(source: SourceRef): string {
  return JSON.stringify(
    match(source)
      .with({ kind: "live-tool" }, (source) => [
        source.kind,
        source.threadId,
        source.nativeSessionKey,
        source.connectionGeneration,
        source.toolCallId,
      ])
      .with({ kind: "native-record" }, (source) => [
        source.kind,
        source.threadId,
        source.nativeSessionKey,
        source.recordId,
        source.revision,
      ])
      .with({ kind: "native-artifact" }, (source) => [
        source.kind,
        source.threadId,
        source.nativeSessionKey,
        source.recordId,
        source.recordRevision,
        source.artifactKey,
        source.revision,
      ])
      .exhaustive(),
  );
}
export const FrozenContextSchema = z
  .strictObject({
    source: SourceRefSchema,
    contentRevision: z.string().min(1).max(256),
    title: z.string().min(1).max(512),
    text: z.string().min(1).max(65536),
    range: z
      .strictObject({
        start: z.number().int().nonnegative(),
        end: z.number().int().positive(),
      })
      .optional(),
    coverage: z.enum(["observed", "partial"]),
  })
  .superRefine((value, context) => {
    if (utf8ByteLength(value.text) > 65536)
      context.addIssue({
        code: "custom",
        message: "Context exceeds byte budget",
      });
    if (
      value.range &&
      (value.range.end <= value.range.start ||
        value.range.end - value.range.start !== value.text.length)
    )
      context.addIssue({
        code: "custom",
        message: "Invalid frozen UTF-16 range",
      });
  });
export type FrozenContext = z.infer<typeof FrozenContextSchema>;

export const ToolArtifactSchema = z.strictObject({
  key: z.string().regex(/^\d{1,20}$/),
  coverage: z.enum(["complete", "partial", "unknown"]),
  expectedBytes: z.number().int().nonnegative().optional(),
  elidedBytes: z.number().int().nonnegative().optional(),
});
export type ToolArtifact = z.infer<typeof ToolArtifactSchema>;

export const ToolDetailSchema = z
  .strictObject({
    source: SourceRefSchema,
    contentRevision: z.string().min(1).max(256),
    toolName: z.string().max(512),
    argumentsText: z.string().max(32768),
    text: z.string().max(16 * 1024 * 1024),
    lifecycle: z.enum(["running", "completed", "failed", "aborted", "unknown"]),
    coverage: z.enum(["observed", "partial"]),
    truncated: z.boolean(),
    nativeRecordId: z.string().min(1).max(512).optional(),
    artifact: ToolArtifactSchema.optional(),
  })
  .superRefine((detail, context) => {
    if (detail.source.kind !== "native-artifact" && detail.text.length > 262144)
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "Tool preview exceeds its body allowance",
      });
  });
export type ToolDetail = z.infer<typeof ToolDetailSchema>;
export const ToolDetailReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("tool-detail"),
    readerId: z.uuid(),
    detail: ToolDetailSchema,
  }),
  z.strictObject({
    kind: z.literal("tool-unavailable"),
    readerId: z.uuid(),
    reason: z.enum(["missing", "identity-changed", "limit", "transport"]),
  }),
]);
export type ToolDetailReply = z.infer<typeof ToolDetailReplySchema>;
export const ToolReadCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("watch-tool"),
    readerId: z.uuid(),
    source: SourceRefSchema,
  }),
  z.strictObject({ kind: z.literal("release-tool"), readerId: z.uuid() }),
]);
export interface ToolDetailPort {
  watchTool(
    source: SourceRef,
    listener: (event: ToolDetailReply) => void,
  ): () => void;
}
