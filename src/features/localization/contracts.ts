import { z } from "zod";

// Product-owned copy crosses process boundaries as semantic data. Native and
// user-authored text stays in its original fields and is never translated.
export const PlainUiMessageCodeSchema = z.enum([
  "runtime.processingInput",
  "runtime.resourceUnknown",
  "runtime.readyToSend",
  "runtime.noModel",
  "runtime.disconnected",
  "runtime.controlFailed",
  "runtime.queuePaused",
  "runtime.controlUpdated",
  "runtime.pendingInteraction",
  "runtime.processing",
  "runtime.idle",
  "runtime.statusUnknown",
  "runtime.configDefault",
  "runtime.previousSessionReadOnly",
  "runtime.preStartTrust",
  "runtime.controlDispatched",
  "runtime.directoryChanged",
  "runtime.grantSaveFailed",
  "runtime.revokedStopRequested",
  "runtime.browseOnly",
  "runtime.starting",
  "runtime.notReady",
  "runtime.grantInvalid",
  "runtime.connectionUnknown",
  "runtime.configUnknown",
  "runtime.controlUnknown",
  "runtime.answerUnknown",
  "runtime.dismissUnknown",
  "runtime.resourceMissing",
  "runtime.resourceUnreadable",
  "runtime.resourceIncompatible",
  "submission.storageUnavailable",
  "submission.notReady",
  "submission.unsupportedNativeCommand",
  "submission.contentTooLarge",
  "submission.unknownSubmission",
  "submission.staleEvent",
  "submission.revisionConflict",
  "submission.queueFull",
  "submission.stateUnverified",
  "submission.unsentDraft",
  "submission.sendUnknown",
  "submission.followUpPending",
  "submission.followUpUnknown",
  "submission.resendUnknown",
  "submission.continueUnknown",
  "draft.alreadyActive",
  "draft.directoryUnavailable",
  "draft.identityMismatch",
  "draft.revisionConflict",
  "draft.storageUnavailable",
  "draft.contentTooLarge",
  "draft.invalidSource",
  "draft.invalidRequest",
  "draft.storageOpenFailed",
  "draft.transportUnknown",
  "conversation.toolResult",
  "conversation.nativeInput",
  "conversation.nativeEvent",
  "conversation.truncated",
]);
export type PlainUiMessageCode = z.infer<typeof PlainUiMessageCodeSchema>;

export const UiMessageSchema = z.union([
  z.strictObject({ code: PlainUiMessageCodeSchema }),
  z.strictObject({
    code: z.literal("runtime.configProfile"),
    params: z.strictObject({ profile: z.string().max(120) }),
  }),
  z.strictObject({
    code: z.literal("runtime.configDirectory"),
    params: z.strictObject({ directory: z.string().max(2048) }),
  }),
  z.strictObject({
    code: z.literal("conversation.unsupportedNativeEvent"),
    params: z.strictObject({ eventType: z.string().max(120) }),
  }),
]);
export type UiMessage = z.infer<typeof UiMessageSchema>;

export function uiMessage(code: PlainUiMessageCode): UiMessage {
  return { code };
}
