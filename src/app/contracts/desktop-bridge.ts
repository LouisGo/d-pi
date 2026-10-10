import { match } from "ts-pattern";
import { z } from "zod";
import type { GitBridge } from "../../modules/changes/contracts/public";
import type { ConfigurationBridge } from "../../modules/configuration/contracts/public";
import type {
  ConversationPort,
  HistoryBridge,
} from "../../modules/conversation/contracts/public";
import type {
  RuntimeBridge,
  SubmissionBridge,
} from "../../modules/execution/contracts/public";
import type { FileBridge } from "../../modules/files/contracts/public";
import {
  DraftFailureReplySchema,
  DraftSchema,
  DraftTextSchema,
  SavedDraftSchema,
} from "../../modules/input/contracts/public";
import type {
  LocaleBridge,
  ModelPickerPreferences,
} from "../../modules/preferences/contracts/public";
import {
  PreferencesSchema,
  SidebarChangeSchema,
  SidebarSnapshotSchema,
} from "../../modules/preferences/contracts/public";
import {
  ProjectContextSchema,
  ThreadContextSchema,
  ThreadMutationSchema,
} from "../../modules/threads/contracts/public";
import type { DiagnosticBridge } from "../../shared/diagnostics";
import { ThreadIdSchema, TraceIdSchema } from "../../shared/identity";
import type { AttachmentBridge } from "./attachments";
import type { AttentionBridge } from "./attention";

export {
  type LocaleBridge,
  type LocaleSetResult,
  LocaleSetResultSchema,
} from "../../modules/preferences/contracts/public";
export const CommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("thread-command"),
    traceId: TraceIdSchema,
    threadId: ThreadIdSchema,
    mutation: ThreadMutationSchema,
  }),
  z.strictObject({ kind: z.literal("sidebar-read"), traceId: TraceIdSchema }),
  z.strictObject({
    kind: z.literal("sidebar-change"),
    traceId: TraceIdSchema,
    change: SidebarChangeSchema,
  }),
  z.strictObject({ kind: z.literal("restore"), traceId: TraceIdSchema }),
  z.strictObject({ kind: z.literal("choose-project"), traceId: TraceIdSchema }),
  z.strictObject({ kind: z.literal("list-threads"), traceId: TraceIdSchema }),
  z.strictObject({
    kind: z.literal("new-thread"),
    threadId: ThreadIdSchema,
    traceId: TraceIdSchema,
  }),
  z.strictObject({
    kind: z.literal("select-thread"),
    threadId: ThreadIdSchema,
    traceId: TraceIdSchema,
  }),
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
    kind: z.literal("thread-command-result"),
    traceId: TraceIdSchema,
    threadId: ThreadIdSchema,
    thread: ThreadContextSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal("sidebar"),
    traceId: TraceIdSchema,
    snapshot: SidebarSnapshotSchema,
  }),
  z.strictObject({
    kind: z.literal("threads"),
    threads: z.array(ThreadContextSchema),
    projects: z.array(ProjectContextSchema).optional(),
    sidebar: SidebarSnapshotSchema.optional(),
    nativeIndex: z
      .enum(["ready", "indexing", "partial", "unavailable"])
      .optional(),
  }),
  z.strictObject({
    kind: z.literal("ready"),
    draft: DraftSchema.nullable(),
    directoryAvailable: z.boolean(),
    nativeIndex: z
      .enum(["ready", "indexing", "partial", "unavailable"])
      .optional(),
    preferences: PreferencesSchema,
  }),
  SavedDraftSchema,
  z.strictObject({
    kind: z.literal("preferences-saved"),
    value: PreferencesSchema,
  }),
  z.strictObject({ kind: z.literal("cancelled") }),
  DraftFailureReplySchema,
]);
export type Reply = z.infer<typeof ReplySchema>;
type SuccessKind = {
  "thread-command": "thread-command-result";
  "sidebar-read": "sidebar";
  "sidebar-change": "sidebar";
  restore: "ready";
  "new-thread": "ready";
  "select-thread": "ready";
  "list-threads": "threads";
  "choose-project": "ready" | "cancelled";
  save: "saved";
  preferences: "preferences-saved";
};
export type ReplyFor<C extends Command> = Extract<
  Reply,
  { kind: SuccessKind[C["kind"]] | "failed" }
>;

export class DesktopRequestError extends Error {
  constructor(
    readonly code: "invalid-reply" | "transport-unavailable",
    readonly traceId: string,
    options?: ErrorOptions,
  ) {
    super(
      code === "invalid-reply"
        ? "Invalid desktop reply"
        : "Desktop transport unavailable",
      options,
    );
    this.name = "DesktopRequestError";
  }
}

// Validate the response and its relation to this request once at the boundary.
export function parseDesktopReply<C extends Command>(
  command: C,
  raw: unknown,
): ReplyFor<C>;
export function parseDesktopReply(command: Command, raw: unknown): Reply {
  const parsed = ReplySchema.safeParse(raw);
  if (!parsed.success)
    throw new DesktopRequestError("invalid-reply", command.traceId, {
      cause: parsed.error,
    });
  const reply = parsed.data;
  const matches =
    reply.kind === "failed"
      ? reply.error.traceId === command.traceId
      : match(command)
          .with(
            { kind: "thread-command" },
            ({ threadId }) =>
              reply.kind === "thread-command-result" &&
              reply.traceId === command.traceId &&
              reply.threadId === threadId,
          )
          .with(
            { kind: "sidebar-read" },
            { kind: "sidebar-change" },
            () => reply.kind === "sidebar" && reply.traceId === command.traceId,
          )
          .with(
            { kind: "restore" },
            { kind: "new-thread" },
            () => reply.kind === "ready",
          )
          .with(
            { kind: "select-thread" },
            ({ threadId }) =>
              reply.kind === "ready" && reply.draft?.threadId === threadId,
          )
          .with({ kind: "list-threads" }, () => reply.kind === "threads")
          .with(
            { kind: "choose-project" },
            () => reply.kind === "ready" || reply.kind === "cancelled",
          )
          .with(
            { kind: "save" },
            ({ threadId, expectedRevision }) =>
              reply.kind === "saved" &&
              reply.threadId === threadId &&
              reply.revision === expectedRevision + 1,
          )
          .with(
            { kind: "preferences" },
            ({ value }) =>
              reply.kind === "preferences-saved" &&
              reply.value.theme === value.theme &&
              reply.value.sendKey === value.sendKey &&
              (value.modelPicker === undefined ||
                sameModelPickerPreferences(
                  reply.value.modelPicker,
                  value.modelPicker,
                )),
          )
          .exhaustive();
  if (!matches) throw new DesktopRequestError("invalid-reply", command.traceId);
  return reply;
}

function sameModelPickerPreferences(
  actual: ModelPickerPreferences | undefined,
  expected: ModelPickerPreferences,
): boolean {
  if (actual === undefined) return false;
  return (["favorites", "hidden", "order"] as const).every(
    (key) =>
      actual[key].length === expected[key].length &&
      actual[key].every((value, index) => value === expected[key][index]),
  );
}
export interface DesktopBridge {
  attention?: AttentionBridge;
  diagnostics?: DiagnosticBridge;
  attachments?: AttachmentBridge;
  configuration?: ConfigurationBridge;
  locale?: LocaleBridge;
  history?: HistoryBridge;
  files?: FileBridge;
  git?: GitBridge;
  submission?: SubmissionBridge;
  conversation?: ConversationPort;
  runtime?: RuntimeBridge;
  request<C extends Command>(command: C): Promise<ReplyFor<C>>;
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
  operation: z.enum([
    "restore",
    "choose-project",
    "new-thread",
    "select-thread",
    "list-threads",
    "thread-command",
    "sidebar-read",
    "sidebar-change",
    "save",
    "preferences",
  ]),
  stage: z.enum(["initiated", "confirmed", "acknowledgement-failed"]),
  code: z.enum(["invalid-reply", "transport-unavailable"]).optional(),
});
export type BridgeDiagnostic = z.infer<typeof BridgeDiagnosticSchema>;
