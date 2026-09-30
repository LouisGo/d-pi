export const ui = {
  "config.heading": "Configuration & sign in",
  "config.description":
    "Reuse native OMP configuration. Sign in, choose a model, then allow project execution and start the session.",
  "config.loading": "Reading native configuration…",
  "config.failed":
    "Native configuration operation was not confirmed. Check configuration, network and resources, then retry. Existing credentials are preserved.",
  "config.source": "Configuration directory",
  "config.openaiReady": "OpenAI account configured",
  "config.openaiMissing": "OpenAI account needs sign in",
  "config.deepseekReady": "DeepSeek credential configured",
  "config.deepseekMissing": "DeepSeek API key needed",
  "config.openaiLogin": "Sign in to OpenAI",
  "config.refresh": "Refresh",
  "config.deepseekKey": "DeepSeek API key",
  "config.saveKey": "Save in native credential store",
  "config.keyNotice":
    "OMP validates with the model-list endpoint before saving. No billed generation request; failures preserve the previous credential.",
  "config.saved": "Saved. Select a model and send to verify availability.",
  "config.openBrowser": "Sign in using system browser",
  "config.authWorking": "Waiting for native authentication…",
  "config.answer": "Submit sign-in input",
  "config.cancel": "Cancel sign in",
  "config.auth.saved": "Native authentication saved",
  "config.auth.cancelled": "Cancelled. You can sign in again.",
  "config.auth.failed":
    "Authentication failed. Retry is available; existing credentials are preserved.",
  "config.auth.timed-out": "Authentication timed out. Retry is available.",
  "model.showUnavailable":
    "Include models requiring authentication or unavailable",
  "model.reason.authentication-required": "Authentication required",
  "model.reason.disabled": "Unavailable in current configuration",
  "app.thread.listFailed":
    "Thread list could not be read. The current draft is retained.",
  "model.heading": "Model",
  "model.search": "Search available models",
  "model.active": "Active native model",
  "model.none": "Not started or not ready",
  "model.next": "Use on start",
  "model.choose": "Choose a configured model",
  "model.thinking": "Thinking level",
  "model.apply": "Apply to this Thread",
  "model.noAvailable":
    "No matching configured model. Sign in or save a key in configuration, then refresh.",
  "model.notice":
    "Applies only to this Thread. Finish execution, queue and interactions before changing. Configuration availability does not prove requests work. Native thinking level is authoritative. Search shows up to 200 matches.",

  "app.loading": "Restoring the local draft…",
  "app.failure.title": "Local data is temporarily unavailable",
  "app.trace": "Trace: {traceId}",
  "app.build": "Build {buildId}",
  "app.retry": "Check again",
  "app.sidebar.projects": "Projects",
  "app.sidebar.noProject": "No project selected",
  "app.sidebar.localDraft": "Local draft",
  "app.executionNeedsApproval": "Project execution requires approval",
  "app.thread.label": "Thread {number}",
  "app.toolbar.newThread": "New Thread",
  "app.toolbar.start": "Start",
  "app.toolbar.darkTheme": "Switch to dark theme",
  "app.toolbar.lightTheme": "Switch to light theme",
  "app.toolbar.compactDensity": "Compact density",
  "app.toolbar.normalDensity": "Normal density",
  "app.toolbar.language": "Interface language",
  "app.toolbar.systemLanguage": "System",
  "app.toolbar.chinese": "简体中文",
  "app.toolbar.english": "English",
  "app.language.saveFailed":
    "The language changed for this session, but saving failed. The previous setting may return next time.",
  "app.draft.title": "Start with an idea",
  "app.draft.description":
    "Your text is saved on this device so you can continue editing next time.",
  "app.draft.directoryUnavailable":
    "The project directory is unavailable. You can still edit the draft; the app will not switch directories automatically.",
  "app.empty.title": "Write your first step in a project",
  "app.empty.description":
    "Choose a directory and create a recoverable text draft.",
  "app.empty.choose": "Choose a project and create a draft",
  "app.empty.note":
    "Directories are browse only by default; project code does not run.",
  "composer.editorLabel": "Draft body",
  "composer.sectionLabel": "Persistent text draft",
  "composer.heading": "Draft",
  "composer.status.saved": "Saved on this device",
  "composer.status.dirty": "Waiting to save…",
  "composer.status.saving": "Saving…",
  "composer.status.checking": "Checking the saved version…",
  "composer.status.conflict": "Versions differ; choose which content to keep",
  "composer.status.failed": "Not saved",
  "composer.shortcut.newline": "Enter for a new line · ⌘Enter to send",
  "composer.shortcut.send": "Enter to send · Shift+Enter for a new line",
  "composer.shortcut.undo": "· ⌘Z to undo",
  "composer.collapse": "Collapse editor",
  "composer.expand": "Expand editor",
  "composer.switchShortcut": "Switch send shortcut",
  "composer.conflict.description":
    "The saved version differs from your current input. Neither will be overwritten until you choose; you can copy a backup first.",
  "composer.conflict.compare": "Compare both versions",
  "composer.conflict.current": "Current input",
  "composer.conflict.saved": "Saved text",
  "composer.conflict.keepCurrent": "Keep current input and save",
  "composer.conflict.loadSaved": "Load saved version",
  "composer.conflict.loadWarning":
    "Loading replaces the editor text. You can undo with ⌘Z. Finish selecting any input method candidate first.",
  "composer.retrySave": "Retry save",
  "composer.checkSave": "Check save status",
  "composer.selectAll": "Select all to copy",
  "composer.queueSend": "Queue to send",
  "composer.send": "Send",
  "composer.steer": "Steer current execution",
  "composer.queueFull":
    "Queue full ({queued}/{cap}). Wait for an item to be processed before sending; your draft is preserved.",
  "ui.conversation.image": "[Image: {alt}]",
  "ui.conversation.imageNotLoaded": "not loaded",
  "ui.conversation.sectionLabel": "Native session reader",
  "ui.conversation.heading": "Conversation",
  "ui.conversation.empty":
    "OMP responses and tool results will appear here after you send.",
  "ui.conversation.gap":
    "Some content is missing from this view. Read the native history below to check it.",
  "ui.conversation.streaming": "In progress",
  "ui.conversation.failed": "Failed",
  "ui.conversation.copy": "Copy",
  "ui.conversation.toolOutput": "View tool output",
  "ui.conversation.waitingResult": "Waiting for result…",
  "ui.submissions.sectionLabel": "Submission records",
  "ui.submissions.summary":
    "Local submissions ({count}; showing up to the 100 most recent)",
  "ui.submissions.warning":
    "A call receipt does not mean the request was accepted or the task is complete. Check an unknown result before sending again.",
  "ui.submissions.checkStatus": "Check submission status",
  "ui.submissions.rejected":
    "Not dispatched to OMP; original text preserved. Resolve the blocker before resending.",
  "ui.submissions.rejected.notReady":
    "Not dispatched to OMP: the session has no ready model. Original text preserved; check the runtime status first.",
  "ui.submissions.rejected.nativeUnavailable":
    "Not dispatched to OMP: the native session is not connected. Original text preserved; check the runtime status first.",
  "ui.submissions.rejected.unsupportedNativeCommand":
    "Not dispatched to OMP: this text is a managed native command and cannot go through the composer. Original text preserved.",
  "ui.submissions.rejected.paused":
    "Not dispatched to OMP: the native queue is paused. Original text preserved; explicitly continue before sending again.",
  "ui.submissions.rejected.interactionPending":
    "Not dispatched to OMP: a native dialog is waiting for an answer. Original text preserved; handle the pending question first.",
  "ui.submissions.rejected.staleTarget":
    "Not dispatched to OMP: the submission targeted an older session instance. Original text preserved; check the current runtime status before sending again.",
  "ui.submissions.rejected.correlationLimit":
    "Not dispatched to OMP: too many dispatches are still unconfirmed. Original text preserved; check the existing submission states first.",
  "ui.submissions.acknowledged": "Call receipt received",
  "ui.submissions.prepared": "Saved, not dispatched",
  "ui.submissions.dispatching": "Dispatched, awaiting receipt",
  "ui.submissions.unknown": "Result unknown",
  "ui.submissions.outcomeFailed": " · Native call failed",
  "ui.submissions.outcomeUnknown": " · Later result unknown",
  "ui.submissions.retryOf": "Explicit resend, source: {id}",
  "ui.submissions.preparedWarning":
    "This input has not been dispatched. Continuing uses the saved original above and checks execution approval again. Later text in the editor stays unchanged.",
  "ui.submissions.continue": "Continue sending",
  "ui.submissions.resendTitle": "Resend as a new submission",
  "ui.submissions.resendWarning":
    "The original submission may have executed. Sending it again can repeat operations. Check native history first; the new draft stays unchanged. Nothing is dispatched during read-only recovery or while the queue is paused.",
  "ui.submissions.resendConfirm": "Resend despite possible duplication",
  "ui.submissions.copyOriginal": "Copy original submission",
  "ui.history.sectionLabel": "Read-only native session history",
  "ui.history.description":
    "Text is paged in file append order, with branch identifiers preserved. This is not the current model context. Reading does not start OMP.",
  "ui.history.read": "Read native records",
  "ui.history.readFailed": "Read connection failed. You can try again.",
  "ui.history.unavailable":
    "Records are temporarily unavailable: {reason}. A failure is not shown as an empty list.",
  "ui.history.reason.missing": "records are missing",
  "ui.history.reason.denied": "access was denied",
  "ui.history.reason.changed": "records changed",
  "ui.history.reason.unsupported": "format is unsupported",
  "ui.history.reason.invalid": "records are invalid",
  "ui.history.reason.cancelled": "reading was cancelled",
  "ui.history.incompleteTail":
    "The file tail is incomplete; only complete records are shown.",
  "ui.history.omitted":
    "This page has {count, plural, one {# other non-message record} other {# other non-message records}} not shown as message text.",
  "ui.history.parent": "{id} ← {parentId}",
  "ui.history.root": "root",
  "ui.history.role.user": "User",
  "ui.history.role.assistant": "Assistant",
  "ui.history.role.tool": "Tool",
  "ui.history.next": "Next page",
  "ui.history.empty": "No complete text messages to display.",
  "ui.runtime.loading": "Reading project execution status…",
  "ui.runtime.phase.browse": "Browse only",
  "ui.runtime.phase.allowed": "Project execution allowed",
  "ui.runtime.phase.starting": "Starting OMP",
  "ui.runtime.phase.busy": "OMP is working",
  "ui.runtime.phase.ready": "OMP is ready",
  "ui.runtime.phase.interrupted": "Native status needs confirmation",
  "ui.runtime.phase.failed": "OMP is not ready",
  "ui.runtime.sectionLabel": "Project execution",
  "ui.runtime.model": "Model: {model}",
  "ui.runtime.queuePaused":
    "Queue paused: {queued, plural, one {# item} other {# items}}; background activity: {background}",
  "ui.runtime.queueActive":
    "Native queue: {queued, plural, one {# item} other {# items}}; background activity: {background}",
  "ui.runtime.steering": "Steering",
  "ui.runtime.pending": "Pending",
  "ui.runtime.stopping": "Requesting stop…",
  "ui.runtime.stop": "Stop and pause queue",
  "ui.runtime.continue": "Explicitly continue",
  "ui.runtime.interactionsLabel": "Native interactions",
  "ui.runtime.unsupportedInteraction":
    "Some native interactions are unsupported or exceed the display budget. They were not answered automatically.",
  "ui.runtime.interactionRecords": "Interaction records",
  "ui.runtime.allow": "Allow project execution",
  "ui.runtime.start": "Start OMP",
  "ui.runtime.revoke": "Revoke execution approval",
  "ui.runtime.inspect": "Check status",
  "ui.interaction.cancelled": "Cancelled",
  "ui.interaction.empty": "(empty)",
  "ui.interaction.followUpFailed":
    "Follow-up failed; the original text remains in the input box.",
  "ui.interaction.defaultAnswered":
    "Answered by default: {answer} (automatically answered after timeout to avoid blocking the task). You can still answer; it will be sent as a new follow-up message.",
  "ui.interaction.confirm": "Confirm",
  "ui.interaction.reject": "Reject",
  "ui.interaction.submit": "Submit answer",
  "ui.interaction.cancel": "Cancel interaction",
  "ui.interaction.continueAnswerLabel": "Continue answering {title}",
  "ui.interaction.sendingFollowUp": "Sending follow-up…",
  "ui.interaction.sendFollowUp": "Send as a follow-up message",
  "ui.interaction.followUpAcknowledged":
    "Sent as a follow-up message (call confirmed; you can send another correction).",
  "ui.interaction.followUpPrepared":
    "Saved, not dispatched (a draft left by an interrupted send; continue to reuse it without taking another queue slot).",
  "ui.interaction.followUpDispatching":
    "Dispatched, awaiting native call confirmation; the task is not complete.",
  "ui.interaction.followUpRejected":
    "Follow-up rejected. The original text is preserved; you can edit and resend. Check submission records.",
  "ui.interaction.rejected.notReady":
    "Follow-up not sent: the session has no ready model yet. Start or wait for the session, then send again.",
  "ui.interaction.rejected.nativeUnavailable":
    "Follow-up not sent: the native session is not connected. Reconnect, then send again.",
  "ui.interaction.rejected.unsupportedNativeCommand":
    "Follow-up not sent: this text is a managed native command and cannot go through the composer.",
  "ui.interaction.rejected.paused":
    "Follow-up not sent: the native queue is paused. Continue the queue, then send again.",
  "ui.interaction.rejected.interactionPending":
    "Follow-up not sent: a native dialog is waiting for an answer. Answer or dismiss it first.",
  "ui.interaction.rejected.staleTarget":
    "Follow-up not sent: it targeted an older session instance. Send it again on the current session.",
  "ui.interaction.rejected.correlationLimit":
    "Follow-up not sent: too many dispatches are still unconfirmed. Wait for their results, then send again.",
  "ui.interaction.followUpUnknown":
    "Follow-up result unknown. The original text is preserved; you can edit and resend. Check submission records.",
  "ui.interaction.continueDispatch": "Continue dispatching this item",
  "ui.interaction.expired": "Request timed out",
  "ui.interaction.dismissed":
    "Unknown result acknowledged and closed (only clears the local block; native work may still be running and has not been cancelled).",
  "ui.interaction.nativeCancelled": "Cancelled natively",
  "ui.interaction.answerUnknown":
    "Answer result unknown; it will not be sent again automatically",
  "ui.interaction.answerSubmitted":
    "Answer submitted, result unconfirmed; it will not be sent again automatically",
  "ui.interaction.answerWritten":
    "Answer written; awaiting the native result. This does not mean the task is complete.",
  "ui.interaction.dismissUnknown": "Acknowledge unknown result and close",
  "ui.interaction.dismissWarning":
    "This only clears the local block. The native process may have received the default answer and continued; it is not stopped. Check native history before resending.",
  "ui.files.section": "Read-only files and current changes",
  "ui.files.readOnly":
    "Reading files does not run project code. The view shows a complete text snapshot from its capture time.",
  "ui.files.tree": "Project files",
  "ui.files.refresh": "Refresh",
  "ui.files.refreshing":
    "Re-sampling; the view still shows the previous capture.",
  "ui.files.up": "Up",
  "ui.files.truncatedTree":
    "This directory exceeds the display limit; showing the first 500 entries.",
  "ui.files.gitHeading": "Current Git changes",
  "ui.files.gitDisclaimer":
    "This shows repository state, not who made the changes. Untracked files follow Git ignore rules. Sides are sampled now; files are not captured atomically.",
  "ui.files.notGit":
    "No readable Git repository. Files and native tool results remain available.",
  "ui.files.gitUnavailable":
    "Git is unavailable on this system. Project files and native tool results remain available.",
  "ui.files.unborn": "no commit yet",
  "ui.files.projectSample": "current project-path sample",
  "ui.files.singleFileSample": "current single-file sample",
  "ui.files.sameText":
    "Text is identical on both sides. Git may be reporting a rename, mode change, or other metadata difference.",
  "ui.files.headIndex": "HEAD → index",
  "ui.files.indexWorktree": "index → working tree",
  "ui.files.untracked": "Untracked",
  "ui.files.status.added": "Added",
  "ui.files.status.modified": "Modified",
  "ui.files.status.deleted": "Deleted",
  "ui.files.status.renamed": "Renamed",
  "ui.files.status.unmerged": "Unmerged",
  "ui.files.status.other": "Other change",
  "ui.files.noChanges": "No changes found in this sample.",
  "ui.files.truncatedChanges":
    "Changes exceed the display limit; showing the first 1000 entries.",
  "ui.files.workingTree": "Working tree file",
  "ui.files.complete": "complete text",
  "ui.files.attachSelection": "Attach selection to input",
  "ui.files.selectionFrozen":
    "Attach as one reference with exact text, range and source version. Later disk changes do not rewrite it.",
  "ui.files.selectionEmpty": "Select a nonempty file range.",
  "ui.files.selectionRangeInvalid":
    "The selection range is no longer valid. Select it again.",
  "ui.files.selectionTooLarge":
    "The selection exceeds 64 KiB. Select a smaller range.",
  "ui.files.transportFailed": "Read connection failed. Refresh to retry.",
  "ui.files.loadingEditor": "Opening code viewer…",
  "ui.files.diffTooLarge":
    "Both sides are too large to compare visually (left {left} chars, right {right} chars); the Monaco compare was skipped to keep the UI responsive. Sources and versions are listed above and remain comparable from the command line.",

  "ui.files.workerFailed":
    "Monaco worker unavailable. Check the current build resources.",
  "ui.files.reason.missing": "The file or change no longer exists.",
  "ui.files.reason.denied":
    "The path is outside the project or access was denied.",
  "ui.files.reason.binary":
    "Binary content cannot be viewed as text or a text diff.",
  "ui.files.reason.encoding": "The file is not valid UTF-8 text.",
  "ui.files.reason.large":
    "Content exceeds the read-only view or selection limit; it was not silently truncated.",
  "ui.files.reason.changed":
    "Content changed during the read. Refresh and retry.",
  "ui.files.reason.unmerged":
    "Unresolved conflicts prevent an ordinary two-sided diff.",
  "ui.files.reason.unsupported":
    "This change involves a symlink or submodule and is not shown as an ordinary text diff.",
  "ui.files.reason.notFile": "The target is not a regular file or directory.",
  "ui.files.reason.failed": "Read failed; no empty result was assumed.",
  "ui.history.nativeToolEvidence": "Native tool result evidence",
  "ui.history.toolCall":
    "Tool {toolName} · call {toolCallId} · native record {recordId}",
  "ui.history.toolReportedWrite":
    "The native file-change tool reported success. No reliable full before and after text is available, so no operation diff is shown.",
  "ui.history.toolFailed":
    "The native tool reported failure; this is not proof of a modification.",
  "ui.history.toolSuccessNoWrite":
    "The native tool reported success; this result does not prove a file modification.",
  "ui.history.toolUnknown": "The native result has no explicit success marker.",
  "ui.history.toolCoverage":
    "Covers text parts in the native record only; {count} non-text parts are omitted. Session source {source}.",
} as const;
