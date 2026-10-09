export const domain = {
  "subagents.observationLimit":
    "The active snapshot exceeds the observation budget. Only the first 128 tasks are shown; coverage is incomplete.",
  "subagents.unhandledEvent":
    "Subagent event {eventType} has no dedicated view yet. Process coverage is incomplete.",

  "subagents.reconnect": "Reconnect reading",
  "subagents.heading": "Subagent",
  "subagents.pending": "Pending",
  "subagents.running": "Running",
  "subagents.completed": "Completed",
  "subagents.failed": "Failed",
  "subagents.aborted": "Aborted",
  "subagents.unknown": "Status unknown",
  "subagents.copy": "Copy result",
  "subagents.task": "View task",
  "subagents.model": "Native model",
  "subagents.currentTool": "Current tool",
  "subagents.progress": "Progress excerpt",
  "subagents.result": "View available result",
  "subagents.noResult": "No readable result is available yet.",
  "subagents.coverage":
    "Only tasks observed in this native instance are shown. Completed tasks before a Host restart are absent from the active snapshot; their status is separate from the main submission.",
  "subagents.transcriptUnavailable":
    "The native result record is unreadable. Observed excerpts remain; the full result is unknown.",
  "subagents.transcriptTooLarge":
    "The native record exceeds the read budget. Observed excerpts remain; the full result was not read.",
  "subagents.transcriptEmpty":
    "The native record has no readable text yet. Observed excerpts do not prove a complete result.",
  "subagents.transcriptReset":
    "The native record was reset. Result coverage may be incomplete.",
  "subagents.truncated":
    "The displayed result is truncated; native content is unchanged.",
  "subagents.identityAmbiguous":
    "This native identity refers to multiple tasks. Unattributed events were not merged.",
  "subagents.missingLifecycle":
    "The start of this task was not observed. Process coverage is incomplete.",
  "subagents.observationUnavailable":
    "Subagent observation is unavailable. Previously observed execution status may be stale; results remain read-only.",

  "submission.contentNotReady":
    "Attachments are not ready. The entire original input is retained; resolve failed items before sending.",
  "submission.imageUnsupported":
    "The selected model or transport cannot preserve image input. Choose a compatible model; the entire original input is retained.",

  "runtime.evidenceGap":
    "Some native evidence could not be saved or correlated. Missing results remain unknown; prompts are never resent automatically.",
  "runtime.processingInput": "Processing input…",
  "runtime.resourceUnknown": "Cannot verify the Runtime resources.",
  "runtime.readyToSend": "OMP is ready. You can send text.",
  "runtime.noModel":
    "No model is available. Complete the native OMP configuration first.",
  "runtime.disconnected": "Connection interrupted. Your draft is retained.",
  "runtime.controlFailed":
    "The control request did not complete. Check the current native state; it will not be retried automatically.",
  "runtime.queuePaused":
    "The queue is paused. Consumption resumes only after you explicitly continue. Background activity still reflects its actual state.",
  "runtime.controlUpdated": "The native queue and control state were updated.",
  "runtime.pendingInteraction":
    "OMP is waiting for an interaction. Check the native interaction panel.",
  "runtime.processing": "OMP is processing…",
  "runtime.idle": "OMP is idle. You can continue sending.",
  "runtime.statusUnknown":
    "OMP's state cannot be verified. Check its native configuration. The app will not automatically resend input or forcibly end the task.",
  "runtime.configDefault":
    "Using OMP's default configuration discovery rules and the app launch environment",
  "runtime.previousSessionReadOnly":
    "This conversation is already linked to a native session. Exclusive control for its full lifetime cannot be verified, so history is read only; the app will neither take over nor create a replacement session. Closing an external CLI does not prove exclusive control.",
  "runtime.preStartTrust":
    "The directory will be checked again before starting. Project execution is not a file sandbox; OMP can use the current system user's permissions.",
  "runtime.controlDispatched":
    "The control request was dispatched. Awaiting native state; it will not be retried automatically.",
  "runtime.directoryChanged":
    "The directory identity changed, so this native instance cannot be reused. New submissions are blocked; existing work is not stopped by this check.",
  "runtime.grantSaveFailed":
    "Could not save execution permission. Check the directory and local storage.",
  "runtime.revokedStopRequested":
    "New operations are blocked and a stop was requested. The existing instance remains until native state is verified; do not treat it as stopped yet.",
  "runtime.browseOnly": "This project is browse only.",
  "runtime.starting":
    "Verifying the official Runtime and starting a native session…",
  "runtime.recoveryBindingChanged":
    "The original session file, identity, project or native configuration changed. Check the original session and retry here; your draft is retained.",
  "runtime.recoveryOccupied":
    "This session has an active writer, or OMP CLI is still open in this project. Close that execution and retry here; your draft is retained.",
  "runtime.recoveryOwnerUnknown":
    "The previous execution owner could not be verified. Check again.",
  "runtime.recoveryShutdownUnconfirmed":
    "The previous execution process has not been confirmed stopped. Check again.",
  "runtime.recoveryLeaseUnavailable":
    "Session execution access is unavailable. Check again; if this persists, inspect diagnostics.",
  "runtime.notReady":
    "OMP did not become ready. Check directory permission and native configuration; current evidence does not distinguish missing, unreadable, or incompatible configuration.",
  "runtime.grantInvalid":
    "Directory identity or execution permission could not be verified. Sending was blocked.",
  "runtime.connectionUnknown":
    "Connection state cannot be verified. The draft is retained. Check the state again; nothing will be sent automatically.",
  "runtime.configUnknown": "Configuration source has not been verified",
  "runtime.controlUnknown":
    "Control outcome is unknown. Check the state; the request will not be retried automatically.",
  "runtime.answerUnknown":
    "Answer outcome is unknown. Check the native interaction; the app will not answer again automatically.",
  "runtime.dismissUnknown":
    "Could not dismiss the unknown interaction. Check the native interaction before retrying.",
  "runtime.resourceMissing":
    "Official Runtime resources are missing. In development, run pnpm runtime:fetch; for a packaged app, obtain the complete app again.",
  "runtime.resourceUnreadable":
    "Cannot read or execute the official Runtime. Check permissions on the app resources.",
  "runtime.resourceIncompatible":
    "The official Runtime or SDK resources failed compatibility or integrity checks in this environment. In development, check the managed resources; for a packaged app, obtain the complete app again.",
  "runtime.sdkResourcesUnavailable":
    "Official SDK resources are missing or failed verification. In development, run pnpm runtime:sdk; for a packaged app, obtain the complete app again.",
  "runtime.configProfile":
    "OMP profile: {profile} (using native discovery rules)",
  "runtime.configDirectory": "Native configuration directory: {directory}",
  "submission.storageUnavailable":
    "Submission records cannot be saved right now. Keep the original input and check its state; do not send it again.",
  "submission.notReady":
    "The execution environment is not ready. The original input is retained.",
  "submission.unsupportedNativeCommand":
    "Not sent: moving or deleting an app-managed conversation through native commands is not supported. The original input is retained.",
  "submission.contentTooLarge":
    "The encoded text exceeds the sending limit. The original input was not truncated.",
  "submission.unknownSubmission": "This submission record could not be found.",
  "submission.staleEvent": "A receipt from a different instance was ignored.",
  "submission.revisionConflict":
    "The submission identity or draft revision changed. Check the current content.",
  "submission.queueFull":
    "The queue is full (20 items). Wait for consumption before sending again. The original input is retained and will not be resent automatically.",
  "submission.stateUnverified":
    "Submission state has not been verified. Keep the original input and do not send it again.",
  "submission.unsentDraft": "Not sent: check the text and draft save state.",
  "submission.sendUnknown":
    "Sending outcome cannot be verified. The original input and submission record are retained; nothing will be resent automatically.",
  "submission.followUpPending": "A follow-up is being sent. Please wait.",
  "submission.followUpUnknown":
    "Follow-up outcome cannot be verified. The original input and submission record are retained; nothing will be resent automatically.",
  "submission.resendUnknown":
    "The result of sending again is unknown. The original input is retained and will not be resent automatically.",
  "submission.continueUnknown":
    "The result of continuing the submission cannot be verified. Check its state; it will not be resent automatically.",
  "draft.alreadyActive":
    "A draft already exists. Continue with the current project.",
  "draft.directoryUnavailable":
    "The directory does not exist or cannot be read. Choose it again.",
  "draft.identityMismatch":
    "The draft identity does not match. The write was blocked.",
  "draft.revisionConflict":
    "The draft revision conflicts. The current input is retained; check the save state before choosing which content to keep.",
  "draft.storageUnavailable":
    "Local data could not be read or saved. The database was not deleted. Keep the current input before retrying.",
  "draft.contentTooLarge":
    "The text exceeds UTF-8 4 MiB and has not been saved. The input was not truncated; copy a backup or shorten it before saving again.",
  "draft.invalidSource": "The request source is invalid.",
  "draft.invalidRequest":
    "The request format is unsupported. The input was not truncated.",
  "draft.storageOpenFailed":
    "The local database could not be opened. No data was reset. Check the logs and database backup.",
  "draft.transportUnknown":
    "The connection was interrupted, so the save outcome is unknown. The current input is retained; check the save state before continuing.",
  "conversation.toolResult": "Tool result",
  "conversation.nativeInput": "Native input",
  "conversation.nativeEvent": "Native event",
  "conversation.truncated":
    "Display truncated; read the native record to verify the full content",
  "conversation.unsupportedNativeEvent":
    "Received {eventType}. Full interaction for this event is not yet supported.",
  "conversation.retrying":
    "The connection was interrupted. OMP is retrying automatically.",
  "conversation.retryCompleted":
    "OMP automatic retry has ended. Continue reading the reply.",
  "conversation.retryFailed": "OMP automatic retry did not succeed.",
} as const;
