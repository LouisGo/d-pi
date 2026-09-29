import { z } from "zod";
import type { HistoryBridge } from "../../modules/conversation/contracts/public";
import type { RuntimeBridge } from "../../modules/execution/contracts/public";
import type { SubmissionBridge } from "../../modules/execution/contracts/public";
import type { GitBridge } from "../../modules/changes/contracts/public";
import type { FileBridge } from "../../modules/files/contracts/public";
import {
  DraftFailureReplySchema,
  DraftSchema,
  DraftTextSchema,
  SavedDraftSchema,
} from "../../modules/input/contracts/public";
import { ThreadIdSchema, TraceIdSchema } from "../../shared/identity";
import { PreferencesSchema } from "../../modules/preferences/contracts/public";
import type { LocaleBridge } from "../../modules/preferences/contracts/public";
export {
  LocaleSetResultSchema,
  type LocaleBridge,
  type LocaleSetResult,
} from "../../modules/preferences/contracts/public";
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
  SavedDraftSchema,
  z.strictObject({
    kind: z.literal("preferences-saved"),
    value: PreferencesSchema,
  }),
  z.strictObject({ kind: z.literal("cancelled") }),
  DraftFailureReplySchema,
]);
export type Reply = z.infer<typeof ReplySchema>;
export interface DesktopBridge {
  locale?: LocaleBridge;
  history?: HistoryBridge;
  files?: FileBridge;
  git?: GitBridge;
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
