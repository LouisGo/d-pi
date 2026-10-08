export const ui = {
  "attachment.details": "Attachment details",
  "ui.reading.latest": "Latest segment",
  "ui.conversation.newOutput": "New output",
  "ui.conversation.toBottom": "Back to list bottom",
  "ui.conversation.retainedTail": "Go to the retained live list bottom.",
  "ui.conversation.openHistory": "View native history",
  "ui.history.readOnlyCoverage":
    "Native history is read-only and paged in saved order, separately from the live list.",
  "ui.history.refreshStart":
    "Refresh reads this source again from its first page.",
  "ui.history.returnLive": "Return to live reading",
  "ui.history.catalogUnavailableReason":
    "Project history discovery is unavailable: {reason}. You can still try the bound d-pi session record.",
  "ui.history.notRead": "The bound session history has not been read yet.",

  "attachment.clipboardFallback":
    "Structured content fell back to readable text. Dynamic references do not transfer file access.",
  "attachment.clipboardFailed":
    "Structured clipboard could not complete. Try again; readable text remains available.",
  "settings.commandEnterKey": "⌘ + Enter",
  "settings.configurationDescription":
    "Manage provider authentication and inspect the native configuration used by the current Thread.",
  "settings.visualStyle": "Visual style",
  "settings.themeDescription":
    "Choose the display mode. System follows the macOS appearance.",
  "settings.themeSystem": "System",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.general": "General",
  "settings.application": "Application",
  "settings.languageDescription":
    "Changes the d-pi interface language. Model responses and native content keep their own language.",
  "settings.composer": "Input and sending",
  "settings.sendKey": "Send shortcut",
  "settings.sendKeyDescription":
    "Choose how to send from the regular composer. IME composition never sends a message.",
  "settings.enterSend": "Enter to send",
  "settings.commandEnterSend": "⌘ Enter to send",
  "settings.expandedComposer": "Expanded composer",
  "settings.expandedDescription":
    "When expanded, ⌘ Enter sends and Enter inserts a new line. Collapsing restores your preference.",
  "settings.appearanceDescription": "Make your workspace comfortable to use.",
  "settings.generalDescription":
    "Manage interface language and everyday input.",
  "settings.attentionDescription":
    "Stay informed when an answer is needed, a run fails, or work finishes.",
  "settings.diagnosticsDescription":
    "Inspect runtime records, investigate problems, and export feedback.",
  "settings.configurationUnavailable":
    "Configuration is unavailable. Finish switching Threads and try again.",
  "settings.diagnosticsTools": "Troubleshooting",
  "settings.diagnosticsRowDescription":
    "Filter diagnostics by time and operation. Review the feedback before exporting.",
  "settings.accounts": "Accounts and authentication",
  "settings.openaiAccount": "OpenAI account",
  "settings.openaiDescription":
    "Sign in with your browser. The native Runtime stores authentication.",
  "settings.deepseekAccount": "DeepSeek",
  "settings.nativeConfiguration": "Native configuration",
  "settings.nativeDescription":
    "Read the configuration source and authentication for this context. Existing usable configuration is reused.",
  "settings.systemNotificationDescription":
    "When the window is in the background, notify about requests for input and execution failures.",
  "settings.completionDescription":
    "Include successful completion in notifications. By default, only the sidebar status is updated.",
  "settings.saving": "Saving…",

  "attention.title": "Thread attention",
  "attention.needsAnswer": "Needs an answer",
  "attention.failed": "Execution failed",
  "attention.completed": "Completed",
  "attention.interrupted": "Interrupted",
  "attention.unread": "Unread",
  "attention.open": "View Thread",
  "attention.preferences": "Notification settings",
  "attention.enableSystem": "Enable system notifications",
  "attention.enableCompletion": "Notify on completion",
  "attention.systemHint":
    "System notifications require an explicit opt-in. Completion updates the sidebar by default. In-app status remains available when system notifications are unavailable.",
  "attention.systemDisabled": "System notifications are disabled.",
  "attention.systemAvailable":
    "System notifications are supported; macOS permissions and settings determine whether they appear.",
  "attention.systemUnavailable":
    "System notifications are unavailable. Check in-app status.",
  "attention.systemFailed":
    "System notifications could not be shown. Check in-app status.",
  "attention.readFailed":
    "Attention status could not be read or saved. Retry; the last sample is retained.",
  "attention.coverageGap":
    "Attention status does not cover every Thread. Open the relevant Thread to check.",
  "attention.navigationBlocked":
    "The Thread has not changed. Finish IME composition, save the draft, or complete the current action, then retry.",
  "attention.retryOpen": "Retry opening Thread",
  "attention.stale":
    "This notification has expired or changed. The Thread shows its current state.",
  "attention.native.needsAnswer.title": "d-pi: An answer is needed",
  "attention.native.needsAnswer.body":
    "Thread {thread} has updated. Open d-pi to view its current state.",
  "attention.native.failed.title": "d-pi: A task failed",
  "attention.native.failed.body":
    "Thread {thread} has updated. Open d-pi to view its current state.",
  "attention.native.completed.title": "d-pi: A task completed",
  "attention.native.completed.body":
    "Thread {thread} has updated. Open d-pi to view its current state.",
  "attention.native.interrupted.title": "d-pi: A task was interrupted",
  "attention.native.interrupted.body":
    "Thread {thread} has updated. Open d-pi to view its current state.",

  "ui.reading.originalSegments":
    "Original text in segments; copy retains all currently available text.",
  "ui.reading.previous": "Previous segment",
  "ui.reading.next": "Next segment",
  "ui.reading.segment": "Segment {current} of {total}",
  "attachment.closePending":
    "Some attachments are still being prepared or their original sources have not been stored. This window remains open. Resolve them in the relevant Thread before closing.",
  "attachment.previewTruncated":
    "Only the first 64 KiB is previewed. The original is retained in full; sending still checks the complete content limits.",
  "attachment.referenceRetrySending":
    "Sending reads this reference again. Restore the source or remove this reference, then send explicitly.",
  "attachment.dismissFailedRequest": "Remove this failed attachment request",
  "ui.submissions.frozenContent": "Frozen sent content",
  "ui.submissions.copyContent": "Copy sent content",

  "queue.images": "Images ({count})",
  "queue.retainImage": "Keep image {index} ({mimeType})",

  "attachment.add": "Attach files",
  "attachment.reference": "@ Project file",
  "attachment.hint":
    "Paste images, drop files, or type @ to reference a project file.",
  "attachment.preparing": "Preparing attachments…",
  "attachment.import.batch": "File import",
  "attachment.reason.import-limit":
    "Attachment import limit reached. Wait for current imports to finish, then retry.",
  "attachment.import.queued": "Queued",
  "attachment.import.reading": "Reading",
  "attachment.import.preparing": "Preparing",
  "attachment.import.ready": "Ready to insert",
  "attachment.import.failed": "Import failed",
  "attachment.import.cancelling": "Cancelling and releasing resources",
  "attachment.import.cancelled": "Cancelled",
  "attachment.import.added": "Inserted",
  "attachment.import.settling": "Inserted; protecting resources",
  "attachment.import.settlementFailed": "Import cleanup needs retry",
  "attachment.import.retrySettlement": "Retry resource settlement",
  "attachment.import.cancel": "Cancel {name}",
  "attachment.previewAction": "Preview",
  "attachment.import.cancelAction": "Cancel",
  "attachment.import.cancelBatch": "Cancel files awaiting insertion",
  "attachment.import.dismiss": "Dismiss import results",
  "attachment.import.insertReady": "Insert ready files at cursor",
  "attachment.import.insertSubset": "Insert only ready files",
  "attachment.import.partial":
    "Some files failed. Retry or cancel them, or explicitly insert only the ready files.",
  "attachment.import.budget":
    "These files exceed the import budget and were not queued. Choose fewer files or wait for the current imports to finish.",
  "attachment.ready": "Ready",
  "attachment.failed": "Preparation failed",
  "attachment.directoryAtSend":
    "Freeze directory entries when sending; excludes file contents",
  "attachment.frozenOnCopy": "Frozen on copy",
  "attachment.frozenSource": "Source at copy",
  "attachment.frozenProject": "Source project",
  "attachment.frozenPath": "Source path",
  "attachment.frozenVersion": "Source version",
  "attachment.frozenTime": "Captured at",
  "attachment.readAtSend": "Read when sending",
  "attachment.remove": "Remove {name}",
  "attachment.previous": "Move {name} earlier",
  "attachment.next": "Move {name} later",
  "attachment.retry": "Retry preparation",
  "attachment.retryLoading": "Reload attachments",
  "attachment.preview": "Preview {name}",
  "attachment.closeManager": "Close attachment manager",
  "attachment.closePreview": "Close preview",
  "attachment.zoom": "Zoom",
  "attachment.textOnly": "Use extracted text only",
  "attachment.textOnlyNotice":
    "Text-only PDF: images, charts and scanned content may be missing.",
  "attachment.coverageGap":
    "PDF extraction is incomplete. Preview the result before explicitly choosing text only, or remove this attachment.",
  "attachment.storage": "Attachments and storage",
  "attachment.checkStorage": "Check stored attachments",
  "attachment.cleanStorage": "Clear unreferenced cache",
  "attachment.storagePolicy":
    "Drafts, pending imports and frozen receipts are retained. Automatic cleanup waits seven days after the last reference is released; manual cleanup removes unreferenced cached originals and conversions.",
  "attachment.storageSummary":
    "Checked {checked}; retained {retained}; unreferenced {unused}; remaining to check {remaining}.",
  "attachment.storageDeleted":
    "Removed {count} cached objects ({bytes} bytes).",
  "attachment.storageOriginal": "Original",
  "attachment.storageDerived": "Conversion",
  "attachment.storageReferencePending":
    "Reference inspection is incomplete. This batch is retained; continue checking or cleaning to finish inspection.",
  "attachment.storageDiscoveryPending":
    "More files may remain to discover. Continue checking to complete this bounded scan.",
  "attachment.storageIssuesTruncated":
    "More affected sources exist. Continue checking or reattach unavailable originals.",
  "attachment.storageReattach":
    "Reattach a missing or damaged original. Retry preparation to rebuild a conversion.",
  "attachment.reason.content-missing":
    "The private content is missing or was cleared as unreferenced cache. Reattach the original.",
  "attachment.library": "Imported files available to reference",
  "draft.inactiveClosePending":
    "Select conversation {thread} in the sidebar and save or resolve its unconfirmed input before closing.",
  "attachment.historyLeaseFailed":
    "Undo assets could not be protected. Retry before saving or sending.",
  "attachment.historyCleared":
    "The input history limit was reached. Undo history was cleared; your draft is preserved.",
  "attachment.historyRetry": "Retry asset protection",
  "attachment.awaitingInsertion":
    "{name} is prepared. Add it to the draft or remove this pending source before sending.",
  "attachment.discardPrepared": "Remove this pending source",
  "attachment.insert": "Add to draft",
  "attachment.refreshSearch": "Refresh search",
  "attachment.directoryKind": "Folder",
  "attachment.fileKind": "File",
  "attachment.searchLabel": "Find project files and folders",
  "attachment.searching": "Searching project files and folders…",
  "attachment.noMatches":
    "No matching project files. Try a filename or relative path.",
  "attachment.searchLimited":
    "Search reached its limit. Enter a more specific path.",
  "attachment.searchFailed": "File search failed. Edit the query to retry.",
  "attachment.cancelSearch": "Close search",
  "attachment.transportFailed":
    "Attachment request failed. Your draft is retained; retry the explicit operation.",
  "attachment.missing":
    "Attachment unavailable: {id}. Remove it or attach the source again.",
  "attachment.reason.invalid-token":
    "Invalid attachment reference. Remove it and attach again.",
  "attachment.reason.attachment-not-found":
    "Original attachment missing. Attach it again.",
  "attachment.reason.source-too-large": "This source exceeds the 25 MiB limit.",
  "attachment.reason.submission-too-large":
    "Total original content exceeds 100 MiB.",
  "attachment.reason.transport-too-large":
    "Input exceeds the application transport budget. Remove or reduce content; nothing was truncated.",
  "attachment.reason.editor-history-limit":
    "Preparing this version would exceed the undo asset limit. The saved attachment and undo history are preserved.",
  "attachment.clearHistory": "Clear undo history, then send again",
  "attachment.clearHistoryRetry": "Clear undo history and retry",
  "attachment.reason.storage-full":
    "Private content storage is full. Active inputs were retained.",
  "attachment.reason.storage-unavailable":
    "Private content storage unavailable. Retry preparation.",
  "attachment.reason.content-corrupt":
    "Stored content failed integrity verification. Attach the original again.",
  "attachment.reason.unsupported-format":
    "This file format has no supported content representation.",
  "attachment.reason.invalid-encoding":
    "Text is not valid UTF-8. Convert the source explicitly and attach again.",
  "attachment.reason.image-too-large":
    "The image still exceeds 10 MiB after compression. Resize or remove it.",
  "attachment.reason.image-too-many-pixels":
    "This image exceeds the local pixel limit. Resize it first.",
  "attachment.reason.image-compression-unsupported":
    "This image cannot be compressed while preserving its animation. Use a smaller original.",
  "attachment.reason.image-compression-failed":
    "Local image processing failed. The original is retained; retry.",
  "attachment.reason.image-compression-unavailable":
    "Local image processing is unavailable. Retry.",
  "attachment.reason.image-compression-busy":
    "Local image processing has reached its concurrency limit. Retry shortly.",
  "attachment.imageCompressed": "Compressed",
  "attachment.imageCompressionDetails":
    "The sent image was converted from {originalWidth}×{originalHeight} to {width}×{height}, in {format} format. The original is retained.",
  "attachment.reason.invalid-image":
    "Image content cannot be decoded. Attach a valid image.",
  "attachment.reason.image-decoder-unavailable":
    "The local image decoder is unavailable. Retry or attach a supported image.",
  "attachment.reason.pdf-conversion-unavailable":
    "The local PDF converter is unavailable. Retry preparation.",
  "attachment.reason.pdf-conversion-failed":
    "PDF conversion failed. Retry or attach another source.",
  "attachment.reason.pdf-coverage-gap":
    "PDF text extraction has coverage gaps.",
  "attachment.reason.pdf-too-many-pages": "PDF exceeds the 100-page limit.",
  "attachment.reason.reference-unavailable":
    "Referenced file is missing or unreadable. Check the path or remove it.",
  "attachment.reason.reference-denied":
    "Referenced path is outside the allowed project boundary.",

  "queue.contentTooLarge":
    "Content exceeds the 256 KiB limit. Shorten it before saving; this input has not been saved, so resolve it before closing the window.",
  "subagent.reconciled":
    "Native settings inspected. The earlier result remains unknown; new explicit changes are available.",
  "queue.reconciled":
    "Native queue inspected. The earlier operation remains unconfirmed; new explicit operations are available.",
  "queue.heading": "Pending queue",
  "queue.batchNotice":
    "Native batch policy is preserved. A combined batch containing an edited item waits for Save or Cancel; current execution continues.",
  "queue.pending": "Updating queue…",
  "queue.unknown":
    "Result unconfirmed. Your edit is retained. Inspect the native queue before another operation; no automatic retry.",
  "queue.failed":
    "Queue operation failed ({code}). Inspect the queue before continuing.",
  "queue.inspect": "Inspect queue",
  "queue.limited":
    "Some content exceeds the display budget. Native content is intact; those items cannot be edited here.",
  "queue.hidden": "{count} more items are not displayed.",
  "queue.empty": "No pending content.",
  "queue.steering": "Steering",
  "queue.followUp": "Follow-up",
  "queue.truncated": "Only a summary is shown; native content is intact.",
  "queue.contentReadOnly":
    "Attachments and native command entries cannot be edited here yet. They can still be deleted or reordered.",
  "queue.edit": "Edit",
  "queue.delete": "Delete",
  "queue.up": "Move up",
  "queue.down": "Move down",
  "queue.editLabel": "Pending content",
  "queue.save": "Save and release edit hold",
  "queue.cancel": "Cancel edit",
  "subagent.heading": "Subagent settings",
  "subagent.notice":
    "Applies only to subagents started later in this Thread. Running instances are unchanged; explicit native requests retain native precedence.",
  "subagent.agent": "Subagent",
  "subagent.chooseAgent": "Choose a subagent",
  "subagent.sharedDefault": "Native effective model patterns",
  "subagent.noPatterns": "No patterns configured",
  "subagent.instanceOverride": "Instance override",
  "subagent.inherited": "Use shared defaults",
  "subagent.apply": "Apply override",
  "subagent.clear": "Clear override",
  "subagent.unavailable": "Start a trusted session to configure subagents.",
  "subagent.none": "This session has no configurable subagents.",
  "subagent.pending": "Updating subagent settings…",
  "subagent.acknowledged": "Subagent settings updated.",
  "subagent.failed":
    "Subagent settings update failed. Check the current settings before retrying.",
  "subagent.unknown":
    "Update result unknown. Inspect the current override before another operation.",

  "ui.history.sourceDetails": "Source and reading scope",
  "ui.history.recordDetails": "Record identity",
  "ui.files.choose": "Choose a file or current diff",
  "ui.files.readingFile": "Reading file…",
  "ui.files.readingDiff": "Reading diff…",
  "ui.files.sampleDetails": "File sample details",

  "app.reading.tools": "Thread tools",
  "app.reading.focus": "Focus reading",
  "app.reading.restoreControls": "Restore controls",

  "ui.history.discovering": "Discovering this project's history…",
  "ui.history.reading": "Reading native records…",

  "config.error.configuration-unavailable":
    "Native configuration could not be read or confirmed. Check the bundled runtime and refresh configuration before retrying.",
  "config.error.stale-target":
    "The project identity changed. Return to the intended project and retry there.",
  "config.error.operation-in-progress":
    "Another native credential operation is still running. Wait for it or cancel the login before retrying.",
  "config.error.authentication-failed":
    "Authentication was not confirmed; the cause is unknown. Refresh native configuration and use this trace when investigating.",
  "config.error.authentication-rejected":
    "The authentication endpoint denied access (401/403). Check the credential and account permissions, then retry.",
  "config.error.authentication-network":
    "The authentication connection failed. Check network, proxy and TLS settings before retrying.",
  "config.error.authentication-provider-unavailable":
    "The authentication endpoint is rate limited or unavailable. Wait and retry.",
  "config.error.operation-timed-out":
    "Authentication or configuration timed out. Refresh configuration to check the outcome before retrying.",
  "config.error.invalid-job":
    "This login is no longer active. Start a new login.",
  "config.error.unsafe-login-url":
    "The native login URL was not accepted. Cancel and start a new login.",
  "config.error.identity-mismatch":
    "The reply did not match this request. Refresh the intended project configuration before retrying.",
  "config.error.transport-failed":
    "The configuration connection ended without a confirmed result. Refresh native configuration before retrying.",
  "config.savingKey": "Validating and saving the key…",

  "composer.placeholder": "Send a message, @ to reference project files",
  "composer.more": "More composer actions",
  "composer.manageAttachments": "Manage attachment cache",
  "composer.enterToSend": "Enter to send when collapsed",
  "composer.projectAccess": "Project execution access",
  "composer.accessAllowed": "Execution allowed",
  "composer.accessBrowse": "Browse only",
  "composer.chooseModel": "Select model",
  "composer.blocked.noModel":
    "No active model. Configure authentication above, then select an available model. Your draft is preserved.",
  "composer.blocked.modelChanging":
    "Applying the model. Wait for its confirmation before sending.",
  "composer.blocked.paused":
    "The queue is paused. Continue it in execution controls before sending.",
  "composer.blocked.stopping":
    "Stopping the current execution. Wait for confirmation before sending.",
  "composer.blocked.interaction":
    "Resolve the pending or uncertain native interaction in execution controls before sending.",
  "ui.runtime.phase.noModel": "OMP started · no active model",

  "ui.history.openCli": "View this project’s existing CLI history",
  "ui.history.projectDescription":
    "Read this project’s saved OMP CLI history. Viewing does not adopt or resume a native session.",
  "ui.history.choose": "History source",
  "ui.history.bound": "This d-pi session’s native record",
  "ui.history.catalogPartial":
    "Some records are unreadable or exceed the list budget. This list is incomplete.",
  "ui.history.catalogUnavailable":
    "The project’s CLI history is unavailable or has not been saved.",

  "config.authUnknown": "Authentication status unavailable",
  "config.partial":
    "Some native configuration sources could not be safely read. Refresh after the native source is available.",
  "model.defaultThinking": "Native default (confirmed after start)",
  "model.readOnly": "Read-only session: model unconfirmed",
  "model.readOnlyNotice":
    "This previous session cannot change model or send. Create an independent session to continue; its draft and history are preserved.",
  "composer.blocked.readOnly":
    "This session is read-only and cannot send. Its draft is preserved; create a new session to select a model and work.",
  "ui.runtime.retryStart": "Retry preparing chat",
  "app.thread.indexPartial":
    "Some native chats could not be indexed. Retry refreshing.",
  "app.thread.indexUnavailable":
    "Native chat indexing is unavailable. Existing chats remain accessible.",
  "composer.blocked.preparing": "Preparing this chat…",
  "composer.blocked.start":
    "The session has not started. Start OMP before sending.",
  "composer.blocked.allow": "Allow project execution to start the session.",
  "composer.blocked.wait":
    "The session is not ready. Check its execution status.",
  "model.offThinking": "Reasoning off",
  "model.reason.configuration-unknown": "Configuration unavailable",
  "config.heading": "Configuration & sign in",
  "config.description":
    "Reuse native OMP configuration. Sign in and choose a model. Trusted projects prepare conversations automatically.",
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
  "model.change": "Change model / effort",
  "ui.runtime.details": "Configuration source",
  "app.reading.navigation": "Thread reading views",
  "app.reading.submissions": "Submitted originals",
  "app.reading.history": "Native history",
  "model.heading": "Model",
  "model.search": "Search available models",
  "model.active": "Active native model",
  "model.none": "No active model",
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
  "app.navigation.selectionUnknown":
    "The selected Thread could not be confirmed. Check again before continuing.",
  "app.navigation.back": "Back",
  "app.navigation.forward": "Forward",
  "app.navigation.checkSelection": "Check selected Thread",
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
  "composer.paste.unsupported":
    "Attachment paste is not connected in this candidate. No part was inserted or discarded; the existing draft is preserved.",
  "composer.paste.hint": "⌘⇧V paste plain text",
  "composer.editorLabel": "Message",
  "composer.sectionLabel": "Message composer",
  "composer.inputOptions": "Input options",
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
  "ui.conversation.empty": "No messages yet.",
  "ui.conversation.gap":
    "The live view has a gap. Check native history; returning to the bottom does not fill it.",
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
  "ui.submissions.rejected.contentMissing":
    "Not dispatched to OMP: Image resources are missing. Attach the original again. Your input is retained.",
  "ui.interaction.rejected.contentMissing":
    "Not dispatched to OMP: Image resources are missing. Attach the original again. Your input is retained.",
  "ui.submissions.rejected.contentCorrupt":
    "Not dispatched to OMP: Image resource integrity verification failed. Attach the original again. Your input is retained.",
  "ui.interaction.rejected.contentCorrupt":
    "Not dispatched to OMP: Image resource integrity verification failed. Attach the original again. Your input is retained.",
  "ui.submissions.rejected.transportTooLarge":
    "Not dispatched to OMP: Image content exceeds the application transport budget. Reduce attachments. Your input is retained.",
  "ui.interaction.rejected.transportTooLarge":
    "Not dispatched to OMP: Image content exceeds the application transport budget. Reduce attachments. Your input is retained.",
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
  "ui.submissions.outcomeCompleted": " · Native prompt completed",
  "ui.submissions.outcomeAborted": " · Native prompt aborted",
  "ui.interaction.followUpCompleted": "Native prompt completed",
  "ui.interaction.followUpAborted": "Native prompt aborted",
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
  "ui.history.reason.unbound": "no saved session yet",
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
  "ui.runtime.phase.interrupted": "Connection interrupted",
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
  "ui.runtime.allow": "Allow execution and start",
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
  "ui.diagnostics.entry": "Diagnostics and feedback",
  "ui.diagnostics.traceEntry": "Inspect this failure",
  "ui.diagnostics.unavailable": "Diagnostics connection unavailable",
  "ui.diagnostics.heading": "Diagnostics and failure feedback",
  "ui.diagnostics.close": "Close diagnostics",
  "ui.diagnostics.description":
    "Query retained local logs already written to disk. Defaults to the last 24 hours and 100 records. A system save dialog confirms export; nothing is uploaded.",
  "ui.diagnostics.since": "Since",
  "ui.diagnostics.until": "Until",
  "ui.diagnostics.trace": "traceId",
  "ui.diagnostics.thread": "Thread ID",
  "ui.diagnostics.writer": "Writer instance ID",
  "ui.diagnostics.stage": "Stage",
  "ui.diagnostics.allStages": "All stages",
  "ui.diagnostics.limit": "Record limit",
  "ui.diagnostics.apply": "Apply filters",
  "ui.diagnostics.invalidFilter":
    "Check the time range, UUIDs and record limit (1–500). No query was sent.",
  "ui.diagnostics.refresh": "Refresh",
  "ui.diagnostics.export": "Export redacted diagnostics",
  "ui.diagnostics.exporting": "Exporting…",
  "ui.diagnostics.copy": "Copy feedback template",
  "ui.diagnostics.refreshing":
    "Re-sampling; the previous sample remains visible.",
  "ui.diagnostics.loading": "Reading diagnostics…",
  "ui.diagnostics.staleFailure":
    "Refresh failed; the previous sample remains visible: {reason}. Refresh to retry.",
  "ui.diagnostics.readFailure":
    "Diagnostics read failed: {reason}. Refresh to retry.",
  "ui.diagnostics.exported": "Exported: {fileName}",
  "ui.diagnostics.cancelled": "Export cancelled; no file was saved.",
  "ui.diagnostics.commandFailed":
    "Export failed: {reason}. It will not retry automatically.",
  "ui.diagnostics.copied":
    "Feedback template copied. Complete and review it before submitting.",
  "ui.diagnostics.copyFailed":
    "Copy failed. Select the template below and copy it manually.",
  "ui.diagnostics.commandTrace": "Inspect export trace",
  "ui.diagnostics.sample": "Sampled {time} · {count} records",
  "ui.diagnostics.coverage":
    "Coverage: {files} files / {bytes} bytes / {lines} lines; malformed {malformed}; redacted {redacted}; unreadable {unreadable}.",
  "ui.diagnostics.truncated":
    "A read or record budget was reached; results are incomplete. Narrow the time range or filters.",
  "ui.diagnostics.writerDegraded":
    "Current Writer degraded; {dropped} records dropped.",
  "ui.diagnostics.writerHealthy":
    "Current Writer healthy; {dropped} records dropped.",
  "ui.diagnostics.notProvided": "not provided",
  "ui.diagnostics.writerCounters":
    "Totals: unconfirmed appends {uncertain}; retention failures {retentionFailures}; rejected records {rejected}; close deadlines {drainTimedOut}. Currently in flight: {inFlight} records.",
  "ui.diagnostics.writerRecovery":
    "Last recovery: {time}. Historical counts remain; recovery does not replay original events.",
  "ui.diagnostics.interpretation":
    "Record order is a reading aid; stages do not prove execution completed. No matches do not prove an operation never happened; rotation, drops or uninstrumented stages can leave gaps. Refresh re-reads the applied time range.",
  "ui.diagnostics.empty": "No matching records in this scope.",
  "ui.diagnostics.recordThread": "Thread: {threadId}",
  "ui.diagnostics.feedback": "Feedback template",
  "ui.diagnostics.feedbackHint":
    "The template contains controlled diagnostic metadata only. Add reproduction details yourself; check for secrets and business content before submitting, and attach the redacted export if useful.",
  "ui.diagnostics.template":
    "d-pi failure feedback\n\nDiagnostic metadata:\n{metadata}\n\nReproduction steps: [fill in]\nExpected result: [fill in]\nActual result: [fill in]\n",
  "ui.diagnostics.operation": "Operation",
  "ui.diagnostics.allOperations": "All operations",
  "ui.diagnostics.recordDetails": "Correlation and exit metadata",
  "app.layout.navigation": "Primary navigation",
  "app.layout.chat": "Conversation",
  "app.layout.settings": "Settings",
  "app.layout.sidebar": "Project navigation",
  "app.layout.sidebarToggle": "Open or collapse project navigation",
  "app.layout.sidebarResize": "Resize project navigation",
  "app.layout.workspaceResize": "Resize right workspace",
  "app.layout.bottomResize": "Resize bottom panel",
  "app.layout.workspace": "Workspace",
  "app.layout.bottom": "Bottom panel",
  "app.layout.close": "Close",
  "app.layout.closeTab": "Close {title}",
  "app.layout.showWorkspace": "Restore workspace",
  "app.layout.showBottom": "Restore bottom panel",
  "app.layout.temporarilyHidden":
    "Panel temporarily hidden for available space. Enlarge the window to restore it.",
  "app.layout.appearance": "Appearance",
  "app.layout.configuration": "Configuration",
  "app.layout.attention": "Notifications",
  "app.layout.diagnostics": "Diagnostics",
  "app.toolbar.systemTheme": "Follow system appearance",
  "app.layout.theme": "Theme",
  "app.layout.statusbar": "Status bar",
  "app.layout.backToConversation": "Back to conversation",
  "app.status.switching": "Switching conversation",
  "app.status.noConversation": "No conversation selected",
  "app.status.unavailable": "Unavailable",
  "app.status.preview": "Conversation quick preview",
  "app.status.messages": "{count} messages",
  "app.status.queued": "{count} queued",
  "app.status.execution": "Execution",
  "app.status.model": "Model",
  "app.status.messagesLabel": "Current message window",
  "app.status.queueLabel": "Queued messages",
  "app.status.background": "Background tasks",
  "app.status.directory": "Working directory",
  "app.status.messagesScope":
    "Message count covers user and assistant messages in the current live window.",
  "app.status.messagesGap":
    "The live window has a synchronization gap; the message count may be incomplete.",
  "ui.conversation.aborted": "Stopped",
  "ui.conversation.continuation": "Continuing the interrupted reply",
} as const;
