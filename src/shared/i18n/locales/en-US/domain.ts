export const domain = {
  "subagents.observationLimit":
    "Showing the first 128 tasks. The list is incomplete.",
  "subagents.unhandledEvent":
    "{eventType} isn't supported in this view. Some activity may be missing.",

  "subagents.reconnect": "Reconnect",
  "subagents.heading": "Subagent",
  "subagents.pending": "Pending",
  "subagents.running": "Running",
  "subagents.completed": "Completed",
  "subagents.failed": "Failed",
  "subagents.aborted": "Stopped",
  "subagents.unknown": "Status unknown",
  "subagents.copy": "Copy result",
  "subagents.task": "View task",
  "subagents.model": "Model",
  "subagents.currentTool": "Current tool",
  "subagents.progress": "Progress excerpt",
  "subagents.result": "View result",
  "subagents.noResult": "No readable result yet.",
  "subagents.coverage":
    "Shows tasks received on this connection. Tasks finished before a restart may be missing; their status is separate from the main task.",
  "subagents.transcriptUnavailable":
    "Can't read the full result. Previously received content remains.",
  "subagents.transcriptTooLarge":
    "The result is too large to load in full. Previously received content remains.",
  "subagents.transcriptEmpty":
    "No full result yet. Shown content may be incomplete.",
  "subagents.transcriptReset":
    "The result record was reset. Content may be incomplete.",
  "subagents.truncated":
    "Showing part of the result. The original is unchanged.",
  "subagents.identityAmbiguous":
    "Some events couldn't be matched to a task and weren't merged.",
  "subagents.missingLifecycle":
    "The task's start wasn't recorded. Activity may be incomplete.",
  "subagents.observationUnavailable":
    "Subagent updates are unavailable. Shown content remains readable; statuses may be out of date.",

  "submission.contentNotReady":
    "Attachments aren't ready. Resolve them before sending. Your input remains.",
  "submission.imageUnsupported":
    "This model or connection can't send the image input. Choose a compatible model. Your input remains.",

  "runtime.evidenceGap":
    "Some records couldn't be saved or linked. Outcomes remain unknown; nothing is resent automatically.",
  "runtime.processingInput": "Processing message…",
  "runtime.resourceUnknown": "Couldn't verify runtime files.",
  "runtime.readyToSend": "Ready to send.",
  "runtime.noModel": "No model available. Connect a provider in Settings.",
  "runtime.disconnected": "Connection interrupted. Your draft is retained.",
  "runtime.controlFailed":
    "The action didn't complete. Check task status; no automatic retry.",
  "runtime.queuePaused":
    "Queued messages are paused. Resume the queue to continue. Background work may still be running.",
  "runtime.controlUpdated": "Status updated.",
  "runtime.pendingInteraction": "Waiting for your answer.",
  "runtime.processing": "Generating…",
  "runtime.idle": "Ready for your next message.",
  "runtime.statusUnknown":
    "Thread status is unknown. Check details. Nothing is resent or stopped automatically.",
  "runtime.configDefault":
    "Uses OMP defaults and the app's launch environment.",
  "runtime.previousSessionReadOnly":
    "Exclusive access to this session can't be verified. It is read-only. Closing another terminal still requires checking again.",
  "runtime.preStartTrust":
    "The folder is checked again before starting. Execution uses your system account permissions and can access files outside this project.",
  "runtime.controlDispatched":
    "Request sent, awaiting status. No automatic retry.",
  "runtime.directoryChanged":
    "The project folder changed. New messages are blocked; current work isn't stopped.",
  "runtime.grantSaveFailed":
    "Couldn't save execution permission. Check the folder and local storage.",
  "runtime.revokedStopRequested":
    "New actions are blocked and a stop was requested. Stopping isn't confirmed yet.",
  "runtime.browseOnly": "This project is browse-only.",
  "runtime.starting": "Preparing and connecting Thread…",
  "runtime.recoveryBindingChanged":
    "The original session record, project, or settings changed. Check them before retrying. Your draft remains.",
  "runtime.recoveryOccupied":
    "Another window or terminal is using this session or project. End that work, then retry. Your draft remains.",
  "runtime.recoveryOwnerUnknown":
    "Couldn't verify the previous session process. Check again.",
  "runtime.recoveryShutdownUnconfirmed":
    "The previous process hasn't been confirmed stopped. Check again.",
  "runtime.recoveryLeaseUnavailable":
    "Couldn't obtain session access. Check again; if this persists, open diagnostics.",
  "runtime.notReady":
    "This Thread isn't ready. Check project permissions and model settings.",
  "runtime.grantInvalid":
    "The project folder or execution permission couldn't be verified. Sending is blocked.",
  "runtime.connectionUnknown":
    "Connection status unknown. Check again. Your draft remains; nothing sends automatically.",
  "runtime.configUnknown": "Settings source unknown",
  "runtime.controlUnknown":
    "Outcome unknown. Check status; no automatic retry.",
  "runtime.answerUnknown":
    "Answer outcome unknown. Check answer records; no automatic resend.",
  "runtime.dismissUnknown":
    "Couldn't dismiss the prompt. Check its status before retrying.",
  "runtime.resourceMissing":
    "Runtime files are missing. In development, run pnpm runtime:fetch. For an installed app, get the complete app again.",
  "runtime.resourceUnreadable":
    "Can't start the runtime. Check permissions on the app's files.",
  "runtime.resourceIncompatible":
    "Runtime files failed verification. In development, check managed resources. For an installed app, get the complete app again.",
  "runtime.sdkResourcesUnavailable":
    "Runtime support files are missing or invalid. In development, run pnpm runtime:sdk. For an installed app, get the complete app again.",
  "runtime.configProfile": "OMP profile: {profile}",
  "runtime.configDirectory": "OMP settings folder: {directory}",
  "submission.storageUnavailable":
    "Can't save message log. Copy your input and check status before sending again.",
  "submission.notReady": "This Thread isn't ready. Your input remains.",
  "submission.unsupportedNativeCommand":
    "Not sent: this command can't move or delete app-managed Threads. Your input remains.",
  "submission.contentTooLarge":
    "The message exceeds the send limit. Your full input remains.",
  "submission.unknownSubmission": "This message record couldn't be found.",
  "submission.staleEvent": "Confirmation from an older connection was ignored.",
  "submission.revisionConflict":
    "The message or draft version changed. Check your current input.",
  "submission.queueFull":
    "The queue is full (20 messages). Wait for a message to be processed. Your input remains; no automatic resend.",
  "submission.stateUnverified":
    "Send status is unconfirmed. Keep your input and check before resending.",
  "submission.unsentDraft": "Not sent. Check your message and save status.",
  "submission.sendUnknown":
    "Send outcome unknown. Your input and record remain; no automatic resend.",
  "submission.followUpPending": "Sending follow-up…",
  "submission.followUpUnknown":
    "Follow-up outcome unknown. Your input and record remain; no automatic resend.",
  "submission.resendUnknown":
    "Resend outcome unknown. Your input remains; no automatic resend.",
  "submission.continueUnknown":
    "Send outcome unknown. Check message log; no automatic resend.",
  "draft.alreadyActive": "A draft already exists. Continue in this project.",
  "draft.directoryUnavailable":
    "The folder is missing or unreadable. Choose it again.",
  "draft.identityMismatch":
    "The draft doesn't match. Saving is blocked; check the current Thread.",
  "draft.revisionConflict":
    "Draft versions differ. Your input remains. Check and choose which version to keep.",
  "draft.storageUnavailable":
    "Can't read or save local data. Copy your current input before retrying.",
  "draft.contentTooLarge":
    "Text exceeds 4 MiB and isn't saved. Copy a backup, then shorten it.",
  "draft.invalidSource": "This request couldn't be accepted.",
  "draft.invalidRequest":
    "Unsupported request format. Your full input remains.",
  "draft.storageOpenFailed":
    "Can't open local data. Nothing was reset. Check logs and backups.",
  "draft.transportUnknown":
    "Connection lost; saving is unconfirmed. Check save status. Your input remains.",
  "conversation.toolResult": "Tool result",
  "conversation.nativeInput": "You",
  "conversation.nativeEvent": "Session event",
  "conversation.truncated":
    "Showing part of the content. Open native history from Thread tools for the full text.",
  "conversation.unsupportedNativeEvent":
    "Full display of {eventType} isn't supported yet.",
  "conversation.retrying": "The connection was interrupted. Retrying…",
  "conversation.retryCompleted": "Reconnected. You can continue reading.",
  "conversation.retryFailed": "Couldn't reconnect.",
} as const;
