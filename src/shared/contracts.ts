import { z } from "zod";
import type { HistoryBridge } from "../features/history/contracts";
import type { RuntimeBridge } from "../features/runtime/contracts";
import type { SubmissionBridge } from "../features/submission/contracts";
import { DRAFT_MAX_BYTES, draftByteLength } from "./draft-text";
export const DraftTextSchema = z
  .string()
  .refine(
    (text) => draftByteLength(text) <= DRAFT_MAX_BYTES,
    "草稿正文超过 UTF-8 4 MiB",
  );
export const ThreadIdSchema = z.uuid().brand<"ThreadId">();
export const WorkspaceIdSchema = z.uuid().brand<"WorkspaceId">();
export const TraceIdSchema = z.uuid();
export const PreferencesSchema = z.strictObject({
  theme: z.enum(["light", "dark"]),
  density: z.enum(["normal", "compact"]),
  sendKey: z.enum(["enter-send", "enter-newline"]).optional(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;
export const DraftSchema = z.strictObject({
  schemaVersion: z.literal(1),
  threadId: ThreadIdSchema,
  workspaceId: WorkspaceIdSchema,
  directory: z.string().min(1),
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
  safeMessage: z.string(),
  causeCode: z.string().max(80).optional(),
});
export type Failure = z.infer<typeof FailureSchema>;
export const CommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("restore"), traceId: TraceIdSchema }),
  z.strictObject({ kind: z.literal("choose-project"), traceId: TraceIdSchema }),
  z.strictObject({
    kind: z.literal("save"),
    traceId: TraceIdSchema,
    threadId: ThreadIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    text: DraftTextSchema,
  }),
  z.strictObject({
    kind: z.literal("preferences"),
    traceId: TraceIdSchema,
    value: PreferencesSchema,
  }),
]);
export type Command = z.infer<typeof CommandSchema>;
export const ReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("ready"),
    draft: DraftSchema.nullable(),
    directoryAvailable: z.boolean(),
    preferences: PreferencesSchema,
  }),
  z.strictObject({
    kind: z.literal("saved"),
    threadId: ThreadIdSchema,
    revision: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal("preferences-saved"),
    value: PreferencesSchema,
  }),
  z.strictObject({ kind: z.literal("cancelled") }),
  z.strictObject({ kind: z.literal("failed"), error: FailureSchema }),
]);
export type Reply = z.infer<typeof ReplySchema>;
export type SaveReply = Extract<Reply, { kind: "saved" | "failed" }>;
export interface DesktopBridge {
  history?: HistoryBridge;
  submission?: SubmissionBridge;
  runtime?: RuntimeBridge;
  request(command: Command): Promise<Reply>;
  onCloseRequest(listener: (token: string) => void): () => void;
  onCloseCancelled(listener: () => void): () => void;
  completeClose(token: string, saved: boolean): void;
}
export const EnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  connectionId: z.uuid(),
  requestId: z.uuid(),
  command: CommandSchema,
});
export const BridgeDiagnosticSchema = z.strictObject({
  traceId: TraceIdSchema,
  requestId: z.uuid(),
  connectionId: z.uuid(),
  operation: z.enum(["restore", "choose-project", "save", "preferences"]),
  stage: z.enum(["initiated", "confirmed", "acknowledgement-failed"]),
  code: z.enum(["invalid-reply", "transport-unavailable"]).optional(),
});
export type BridgeDiagnostic = z.infer<typeof BridgeDiagnosticSchema>;
