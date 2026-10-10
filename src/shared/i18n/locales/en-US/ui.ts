export const ui = {
  "ui.copy.copied": "Copied",
  "ui.copy.failed": "Couldn't copy. Try again.",
  "ui.copy.pending": "Copying…",
  "models.editChanged":
    "Settings changed elsewhere. Copy your edits, then cancel and reopen this form.",
  "models.pricing.free": "Free",
  "models.pricing.included": "Included in plan",
  "models.pricing.variable": "Variable pricing",
  "models.pricing.unknown": "Price unavailable",
  "models.thinkingDefault": "Default",

  "providers.roleScope": "Applies to",
  "models.nativeExcluded": "This model isn't enabled.",
  "config.error.configuration-conflict":
    "Settings changed elsewhere. Refresh and try again.",
  "config.error.configuration-invalid": "Check your settings and try again.",
  "config.error.provider-unavailable":
    "This provider is unavailable. Refresh the list.",
  "config.error.credential-not-found":
    "This account was removed. Refresh to continue.",
  "config.error.catalog-refresh-failed":
    "Couldn't update models. Your settings are unchanged.",
  "config.error.model-not-found":
    "This model is unavailable. Refresh the list.",
  "providers.disconnectNotice":
    "Only this account will be removed. Other credentials, such as environment variables, may still apply.",
  "providers.accountFallback": "Account {id}",
  "providers.preferenceFailed": "Couldn't save model preferences. Try again.",
  "models.roleUnavailable": "No available model supports this use.",

  "providers.connection.chatgpt": "ChatGPT plan",
  "providers.connection.account": "{name} · Account",
  "providers.connection.apiKey": "{name} · API key",
  "providers.connection.environment": "{name} · Environment variable",
  "providers.connection.configuration": "{name} · Config file",
  "providers.connection.runtime": "{name} · Temporary credentials",
  "providers.connection.keyless": "{name} · No credentials needed",
  "providers.connection.required": "{name} · Not connected",
  "providers.connection.disabled": "{name} · Disabled",
  "providers.connection.unknown": "{name} · Sign-in method unknown",
  "providers.connection.accounts":
    "{count, plural, one {# account connected} other {# accounts connected}}",

  "providers.title": "Providers",
  "providers.search": "Search providers…",
  "providers.all": "All models",
  "providers.favorites": "Favorites",
  "providers.models": "Models",
  "providers.accounts": "Accounts",
  "providers.connect": "Connect",
  "providers.addAccount": "Add account",
  "providers.disconnect": "Disconnect account",
  "providers.confirmDisconnect": "Disconnect account",
  "providers.cancel": "Cancel",
  "providers.auth.configured": "Connected",
  "providers.auth.required": "Not connected",
  "providers.auth.keyless": "No credentials needed",
  "providers.auth.unknown": "Status unknown",
  "providers.disabled": "Disabled",
  "providers.enable": "Enable {name}",
  "providers.enabled": "Enabled",
  "providers.environment": "Environment variables",
  "providers.source": "Settings source",
  "providers.globalScope": "Global",
  "providers.threadScope": "This project",
  "providers.sharedNotice":
    "Shared with OMP CLI. Account and global settings affect Threads using the same configuration.",
  "providers.profile": "Profile",
  "providers.apiKey": "API key",
  "providers.unvalidatedKey": "Saved in OMP without online verification.",
  "providers.keySaved": "API key saved",
  "providers.externalCredential":
    "Manage these credentials in the source environment or config file.",
  "providers.noConnectionMethod":
    "No sign-in flow is available. Existing environment or config credentials can still be used.",
  "providers.login.chatgpt": "ChatGPT account",
  "providers.login.chatgptDevice": "ChatGPT device sign-in",
  "providers.accountDetails": "Account details",
  "providers.login.api-key": "API key",
  "providers.login.oauth-code": "Sign in with account",
  "providers.login.device-code": "Device code",
  "providers.login.custom": "Provider sign-in",
  "providers.validationRequest":
    "Signing in sends a test request that may incur a charge.",
  "providers.modelsRequest":
    "Signing in checks your credentials by fetching the model list.",
  "providers.refreshCatalog": "Refresh models",
  "providers.refreshNotice":
    "Updates the list online without generating a reply.",
  "providers.empty": "No providers found.",
  "providers.partial": "The list is incomplete. Refresh to try again.",
  "models.search": "Search models…",
  "models.noResults": "No models found. Try another name or provider.",
  "models.noAvailable": "No chat models available. Connect a provider first.",
  "models.noFavorites": "No favorites yet. Star a model to add it here.",
  "models.favorite": "Favorite {name}",
  "models.unfavorite": "Unfavorite {name}",
  "models.visible": "Show {name} in the picker",
  "models.deviceNotice":
    "Newest first. Drag icons to reorder. Favorites, visibility, and order stay on this device.",
  "models.moveUp": "Move {name} up",
  "models.drag": "Drag to reorder {name}",
  "models.moveDown": "Move {name} down",
  "models.kind": "Use",
  "models.kind.all": "All uses",
  "models.kind.chat": "Chat",
  "models.kind.tiny": "Lightweight",
  "models.kind.image": "Image",
  "models.kind.tts": "Text to speech",
  "models.kind.stt": "Speech to text",
  "models.kind.search": "Search",
  "models.kind.judge": "Evaluation",
  "models.kind.embedding": "Embedding",
  "models.kind.rerank": "Reranking",
  "models.kind.video": "Video",
  "models.context": "{value} context",
  "models.output": "{value} max output",
  "models.reasoning": "Reasoning",
  "models.vision": "Image input",
  "models.price": "Input / output per million tokens",
  "models.free": "Free",
  "models.more": "More models",
  "models.count": "{count, plural, one {# model} other {# models}}",
  "models.current": "Current model",
  "models.select": "Switch model",
  "models.manage": "Manage providers",
  "models.busy": "Finish the current work before switching models.",
  "models.changing": "Switching…",
  "models.applied": "Settings applied",
  "models.hiddenCurrent": "The current model is hidden from the picker.",
  "models.role": "Default models",
  "models.roleDescription":
    "Switching models affects only this Thread. Defaults below apply to the selected scope.",
  "models.roleTarget": "Applies to",
  "models.roleGlobal": "Global",
  "models.roleProject": "This project",
  "models.inherit": "Use default",
  "models.nativeValue": "Current setting: {value}",
  "models.custom": "Custom",
  "models.addCustom": "Add custom model",
  "models.editCustom": "Edit {name}",
  "models.deleteCustom": "Delete {name}",
  "models.confirmDelete": "Delete model",
  "models.customDescription": "Shared with OMP CLI.",
  "models.modelId": "Model ID",
  "models.name": "Display name",
  "models.providerId": "Provider ID",
  "models.baseUrl": "API endpoint",
  "models.api": "API type",
  "models.apiDefault": "Use provider default",
  "models.contextWindow": "Context window",
  "models.maxTokens": "Max output tokens",
  "models.save": "Save model",
  "models.customInvalid": "Check the model ID, API endpoint, and token limits.",
  "models.customNewProvider":
    "You can save an API key. Compatibility depends on the provider's API.",
  "models.working": "Working…",
  "attachment.details": "Attachment details",
  "ui.reading.latest": "Latest segment",
  "ui.conversation.newOutput": "New output",
  "ui.conversation.toBottom": "Jump to bottom",
  "ui.conversation.retainedTail": "Jump to the bottom of the current list.",
  "ui.tool.observation": "Observation details",
  "ui.tool.identity": "Tool call ID",
  "ui.tool.arguments": "Invocation arguments",
  "ui.tool.progress": "Observed progress",
  "ui.tool.result": "Observed result",
  "ui.tool.partial":
    "Some execution events are missing; shown values do not prove a complete execution history.",
  "ui.tool.truncated":
    "Showing part of the structured values. The native record is unchanged.",
  "ui.history.readOnlyCoverage":
    "History is read-only and shown in saved order.",
  "ui.history.refreshStart": "Refresh starts again from the first page.",
  "ui.history.returnLive": "Back to Thread",
  "ui.history.catalogUnavailableReason":
    "Couldn't list project history: {reason}. Try the current Thread's record.",
  "ui.history.notRead": "History hasn't been loaded yet.",

  "attachment.clipboardFallback":
    "Copied as plain text. File access doesn't transfer with references.",
  "attachment.clipboardFailed":
    "Couldn't copy structured content. Paste the text or try again.",
  "settings.commandEnterKey": "⌘ + Enter",
  "settings.visualStyle": "Display",
  "settings.themeSystem": "System",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.general": "General",
  "settings.application": "App",
  "settings.languageDescription": "Changes the interface language only.",
  "settings.composer": "Input",
  "settings.sendKey": "Send shortcut",
  "settings.enterSend": "Enter to send",
  "settings.commandEnterSend": "⌘ Enter to send",
  "settings.expandedComposer": "Expanded input",
  "settings.expandedDescription":
    "When expanded, ⌘Enter sends and Enter adds a new line.",
  "settings.configurationUnavailable":
    "Settings are unavailable. Finish switching Threads and try again.",
  "settings.diagnosticsTools": "Troubleshooting",
  "settings.accounts": "Accounts",
  "settings.openaiAccount": "OpenAI account",
  "settings.openaiDescription":
    "Sign in with your browser. OMP stores your credentials.",
  "settings.deepseekAccount": "DeepSeek",
  "settings.nativeConfiguration": "OMP settings",
  "settings.nativeDescription": "Uses your existing settings.",
  "settings.systemNotificationDescription":
    "Notify you when input is needed or work fails while the window is in the background.",
  "settings.completionDescription":
    "Also notify when work finishes. By default, only the sidebar updates.",
  "settings.saving": "Saving…",

  "attention.title": "Thread notifications",
  "attention.needsAnswer": "Needs input",
  "attention.failed": "Execution failed",
  "attention.completed": "Completed",
  "attention.interrupted": "Interrupted",
  "attention.unread": "Unread",
  "attention.open": "Open Thread",
  "attention.preferences": "Notification settings",
  "attention.enableSystem": "System notifications",
  "attention.enableCompletion": "Notify on completion",
  "attention.systemHint":
    "The sidebar updates by default. Turn on system notifications to receive alerts.",
  "attention.systemDisabled": "System notifications are off.",
  "attention.systemAvailable":
    "Notifications depend on your macOS permissions and settings.",
  "attention.systemUnavailable":
    "System notifications are unavailable. Check the app.",
  "attention.systemFailed": "Couldn't show the notification. Check the app.",
  "attention.readFailed":
    "Couldn't read or save notification status. Previous results remain; try again.",
  "attention.coverageGap":
    "Some Thread statuses are unavailable. Open those Threads to check.",
  "attention.navigationBlocked":
    "Can't switch Threads yet. Finish typing, saving, or the current action, then try again.",
  "attention.retryOpen": "Retry opening Thread",
  "attention.stale":
    "This notification is out of date. Check the Thread for its current status.",
  "attention.native.needsAnswer.title": "d-pi: Input needed",
  "attention.native.needsAnswer.body": "{thread} · Open d-pi to check.",
  "attention.native.failed.title": "d-pi: Work failed",
  "attention.native.failed.body": "{thread} · Open d-pi to check.",
  "attention.native.completed.title": "d-pi: Work finished",
  "attention.native.completed.body": "{thread} · Open d-pi to check.",
  "attention.native.interrupted.title": "d-pi: Work interrupted",
  "attention.native.interrupted.body": "{thread} · Open d-pi to check.",

  "ui.reading.originalSegments":
    "Long text is split into segments. Copy includes all text loaded so far.",
  "ui.reading.previous": "Previous segment",
  "ui.reading.next": "Next segment",
  "ui.reading.segment": "Segment {current} of {total}",
  "attachment.closePending":
    "Some attachments aren't ready or saved. Resolve them in the relevant Thread before closing.",
  "attachment.previewTruncated":
    "Preview shows the first 64 KiB. Sending uses the full content and checks its size.",
  "attachment.referenceRetrySending":
    "This file is read again when you send. Restore it or remove the reference before sending.",
  "attachment.dismissFailedRequest": "Remove failed attachment",
  "ui.submissions.frozenContent": "Message contents",
  "ui.submissions.copyContent": "Copy sent content",

  "queue.images": "{count, plural, one {# image} other {# images}}",
  "queue.retainImage": "Keep image {index} ({mimeType})",

  "attachment.add": "Attach files",
  "attachment.reference": "Reference project files",
  "attachment.hint":
    "Paste images, drop files, or use @ to reference files and folders.",
  "attachment.preparing": "Preparing attachments…",
  "attachment.import.batch": "File imports",
  "attachment.reason.import-limit":
    "Too many imports in progress. Try again shortly.",
  "attachment.import.queued": "Queued",
  "attachment.import.reading": "Reading",
  "attachment.import.preparing": "Preparing",
  "attachment.import.ready": "Ready to add",
  "attachment.import.failed": "Import failed",
  "attachment.import.cancelling": "Cancelling",
  "attachment.import.cancelled": "Cancelled",
  "attachment.import.added": "Added",
  "attachment.import.settling": "Added, saving",
  "attachment.import.settlementFailed":
    "Attachment saving is incomplete. Try again.",
  "attachment.import.retrySettlement": "Retry saving",
  "attachment.import.cancel": "Cancel {name}",
  "attachment.previewAction": "Preview",
  "attachment.import.cancelAction": "Cancel",
  "attachment.import.cancelBatch": "Cancel remaining imports",
  "attachment.import.dismiss": "Dismiss results",
  "attachment.import.insertReady": "Add ready files at cursor",
  "attachment.import.insertSubset": "Add ready files only",
  "attachment.import.partial":
    "Some imports failed. Retry or cancel failed files, or add only the ready files.",
  "attachment.import.budget":
    "Too many files or too much data. Reduce the selection or wait for current imports to finish.",
  "attachment.ready": "Ready",
  "attachment.failed": "Preparation failed",
  "attachment.directoryAtSend":
    "Reads the folder listing when sent, without file contents.",
  "attachment.frozenOnCopy": "Captured when copied",
  "attachment.frozenSource": "Copy source",
  "attachment.frozenProject": "Source project",
  "attachment.frozenPath": "Source path",
  "attachment.frozenVersion": "Source version",
  "attachment.frozenTime": "Captured at",
  "attachment.readAtSend": "Read when sent",
  "attachment.remove": "Remove {name}",
  "attachment.previous": "Move {name} earlier",
  "attachment.next": "Move {name} later",
  "attachment.retry": "Retry preparation",
  "attachment.retryLoading": "Reload attachments",
  "attachment.preview": "Preview {name}",
  "attachment.closeManager": "Close attachment manager",
  "attachment.closePreview": "Close preview",
  "attachment.zoom": "Zoom",
  "attachment.textOnly": "Use text only",
  "attachment.textOnlyNotice":
    "Sends PDF text only. Images, charts, and scanned content may be missing.",
  "attachment.coverageGap":
    "Some PDF content is missing. Review the preview, then choose “Send text only” or remove the attachment.",
  "attachment.storage": "Attachment cache",
  "attachment.checkStorage": "Check cache",
  "attachment.cleanStorage": "Clear unused cache",
  "attachment.storagePolicy":
    "Keeps attachments needed by drafts, pending imports, and message log. Automatically clears cache 7 days after its last reference is released. Manual cleanup removes unused originals and conversions immediately.",
  "attachment.storageSummary":
    "Checked {checked} · Kept {retained} · Unused {unused} · Remaining {remaining}",
  "attachment.storageDeleted":
    "Cleared {count, plural, one {# item} other {# items}} ({bytes} bytes).",
  "attachment.storageOriginal": "Original",
  "attachment.storageDerived": "Conversion",
  "attachment.storageReferencePending":
    "Checks are incomplete. These attachments are kept until you continue checking.",
  "attachment.storageDiscoveryPending":
    "The scan is incomplete. Continue checking.",
  "attachment.storageIssuesTruncated":
    "More attachments may be affected. Continue checking or reattach the originals.",
  "attachment.storageReattach":
    "Reattach missing or damaged originals. Retry preparation if a conversion is unavailable.",
  "attachment.reason.content-missing":
    "The attachment is missing or was cleared. Reattach the original.",
  "attachment.library": "Imported files",
  "draft.inactiveClosePending":
    "Open Thread {thread} and confirm its draft is saved before closing.",
  "attachment.historyLeaseFailed":
    "Couldn't keep attachments needed for undo. Retry before saving or sending.",
  "attachment.historyCleared":
    "Undo history reached its limit and was cleared. Your draft remains.",
  "attachment.reason.history-lease-expired":
    "Attachment undo protection expired. Retry to restore it; your draft is preserved.",
  "attachment.reason.document-conversion-unavailable":
    "Document conversion is unavailable. Please retry.",
  "attachment.reason.document-conversion-failed":
    "Document conversion failed. Check the file or attach it again.",
  "attachment.pdfConversionNotice":
    "OMP extracts text as Markdown; PDF page images are not sent.",
  "attachment.documentConversionNotice":
    "OMP converts documents to Markdown; embedded images may become placeholders and formulas use saved results.",
  "attachment.historyRetry": "Retry keeping attachments",
  "attachment.awaitingInsertion":
    "{name} is ready. Add it to your draft or remove it before sending.",
  "attachment.discardPrepared": "Remove pending file",
  "attachment.insert": "Add to draft",
  "attachment.refreshSearch": "Refresh search",
  "attachment.directoryKind": "Folder",
  "attachment.fileKind": "File",
  "attachment.searchLabel": "Find files or folders",
  "attachment.searching": "Searching…",
  "attachment.noMatches": "No files or folders found. Try a name or path.",
  "attachment.searchLimited": "Too many results. Enter a more specific path.",
  "attachment.searchFailed": "Search failed. Refresh or change your search.",
  "attachment.cancelSearch": "Close search",
  "attachment.transportFailed":
    "The attachment action failed. Your draft remains; try again.",
  "attachment.missing":
    "Attachment {id} is unavailable. Remove it or attach it again.",
  "attachment.reason.invalid-token":
    "This attachment reference is invalid. Attach it again.",
  "attachment.reason.attachment-not-found":
    "The original is missing. Attach it again.",
  "attachment.reason.source-too-large": "The file exceeds 25 MiB.",
  "attachment.reason.submission-too-large": "Total content exceeds 100 MiB.",
  "attachment.reason.transport-too-large":
    "Content is too large to send. Reduce the text or attachments.",
  "attachment.reason.editor-history-limit":
    "Attachment space for undo is full. Existing attachments and history remain.",
  "attachment.clearHistory": "Clear undo history, then send again",
  "attachment.clearHistoryRetry": "Clear undo history and retry",
  "attachment.reason.storage-full":
    "Attachment storage is full. Your current input remains.",
  "attachment.reason.storage-unavailable":
    "Attachment storage is unavailable. Retry preparation.",
  "attachment.reason.content-corrupt":
    "The attachment is damaged. Reattach the original.",
  "attachment.reason.unsupported-format":
    "This file format isn't supported yet.",
  "attachment.reason.invalid-encoding":
    "Convert this file to UTF-8 text, then attach it again.",
  "attachment.reason.image-too-large":
    "The compressed image still exceeds 10 MiB. Resize or remove it.",
  "attachment.reason.image-too-many-pixels":
    "The image dimensions are too large. Resize it before attaching.",
  "attachment.reason.image-compression-unsupported":
    "Can't compress this image while keeping its animation. Attach a smaller original.",
  "attachment.reason.image-compression-failed":
    "Couldn't process the image. The original remains; try again.",
  "attachment.reason.image-compression-unavailable":
    "Image processing is unavailable. Try again.",
  "attachment.reason.image-compression-busy":
    "Too many images are being processed. Try again shortly.",
  "attachment.imageCompressed": "Compressed",
  "attachment.imageCompressionDetails":
    "Sent size: {originalWidth}×{originalHeight} → {width}×{height} · {format}. The original remains.",
  "attachment.reason.invalid-image":
    "Can't read this image. Attach a valid image.",
  "attachment.reason.image-decoder-unavailable":
    "Image decoding is unavailable. Try again or attach another image.",
  "attachment.reason.pdf-conversion-unavailable":
    "PDF conversion is unavailable. Try again.",
  "attachment.reason.pdf-conversion-failed":
    "Couldn't convert the PDF. Try again or attach another file.",
  "attachment.reason.pdf-coverage-gap": "Some PDF text couldn't be extracted.",
  "attachment.reason.pdf-too-many-pages": "The PDF exceeds 100 pages.",
  "attachment.reason.reference-unavailable":
    "The file is missing or unreadable. Check its path or remove the reference.",
  "attachment.reason.reference-denied":
    "This path is outside the allowed project scope.",

  "queue.contentTooLarge":
    "Content exceeds 256 KiB and isn't saved. Shorten and save it before closing.",
  "subagent.reconciled":
    "Current settings checked. The earlier outcome is still unknown.",
  "queue.reconciled": "Queue checked. The earlier outcome is still unknown.",
  "queue.heading": "Queued messages",
  "queue.batchNotice":
    "While editing, this batch waits until you save or cancel. Current work continues.",
  "queue.pending": "Updating queue…",
  "queue.unknown":
    "The outcome is unknown. Your edits remain. Check the queue; no automatic retry.",
  "queue.failed": "The queue action failed. Check the queue. Error: {code}",
  "queue.inspect": "Check queue",
  "queue.limited":
    "Some messages are too large to show or edit. The originals remain.",
  "queue.hidden":
    "{count, plural, one {# more message isn't shown.} other {# more messages aren't shown.}}",
  "queue.empty": "No queued messages.",
  "queue.steering": "Steering",
  "queue.followUp": "Follow-up",
  "queue.truncated": "Showing a preview. The full content remains.",
  "queue.contentReadOnly":
    "Messages with attachments or commands can't be edited yet. You can delete or reorder them.",
  "queue.edit": "Edit",
  "queue.delete": "Delete",
  "queue.up": "Move up",
  "queue.down": "Move down",
  "queue.editLabel": "Message",
  "queue.save": "Save and continue",
  "queue.cancel": "Cancel edit",
  "subagent.heading": "Subagent settings",
  "subagent.notice":
    "Applies to new subagents in this Thread. Settings specified by the task take priority.",
  "subagent.agent": "Subagent",
  "subagent.chooseAgent": "Choose a subagent",
  "subagent.sharedDefault": "Default model rules",
  "subagent.noPatterns": "Not set",
  "subagent.instanceOverride": "Thread override",
  "subagent.inherited": "Use default",
  "subagent.apply": "Apply",
  "subagent.clear": "Use default",
  "subagent.unavailable": "Connect the Thread and allow execution first.",
  "subagent.none": "No subagents to configure.",
  "subagent.pending": "Updating settings…",
  "subagent.acknowledged": "Settings updated.",
  "subagent.failed": "Couldn't update settings. Check them and try again.",
  "subagent.unknown":
    "The outcome is unknown. Check the current settings before trying again.",

  "ui.history.sourceDetails": "History source",
  "ui.history.recordDetails": "Record ID",
  "ui.files.choose": "Choose a file or change",
  "ui.files.readingFile": "Loading file…",
  "ui.files.readingDiff": "Loading diff…",
  "ui.files.sampleDetails": "Read details",

  "app.reading.tools": "Thread tools",
  "app.reading.focus": "Focus mode",
  "app.reading.restoreControls": "Show controls",

  "ui.history.discovering": "Finding history…",
  "ui.history.reading": "Loading history…",

  "config.error.configuration-unavailable":
    "Settings are unavailable. Check the app's runtime files, then refresh.",
  "config.error.stale-target":
    "The project changed. Return to the intended project and try again.",
  "config.error.operation-in-progress":
    "Another sign-in or key action is in progress. Wait or cancel it before trying again.",
  "config.error.authentication-failed":
    "Sign-in couldn't be confirmed. Refresh settings and use the trace ID to investigate.",
  "config.error.authentication-rejected":
    "Access denied (401/403). Check your credentials and account permissions.",
  "config.error.authentication-network":
    "Couldn't connect. Check your network, proxy, and TLS settings.",
  "config.error.authentication-provider-unavailable":
    "The service is busy or unavailable. Try again later.",
  "config.error.operation-timed-out":
    "The action timed out. Refresh settings to check the result first.",
  "config.error.invalid-job": "This sign-in expired. Start again.",
  "config.error.unsafe-login-url":
    "The sign-in URL wasn't accepted. Cancel and start again.",
  "config.error.identity-mismatch":
    "The result doesn't match this request. Refresh the project settings.",
  "config.error.transport-failed":
    "Connection lost; the outcome is unknown. Refresh settings first.",
  "config.savingKey": "Checking and saving key…",

  "composer.placeholder": "Describe a task, @ to add files",
  "composer.more": "More options",
  "composer.manageAttachments": "Attachment cache",
  "composer.enterToSend": "Enter sends when collapsed",
  "composer.projectAccess": "Project permissions",
  "composer.accessAllowed": "Execution allowed",
  "composer.accessBrowse": "Browse only",
  "composer.chooseModel": "Select model",
  "composer.blocked.noModel":
    "Connect a provider and choose a model. Your draft remains.",
  "composer.blocked.modelChanging": "Switching models. Please wait.",
  "composer.blocked.paused": "The queue is paused. Resume it before sending.",
  "composer.blocked.stopping": "Stopping. Please wait for confirmation.",
  "composer.blocked.interaction":
    "Answer the pending question or check the unconfirmed answer first.",
  "ui.runtime.phase.noModel": "No active model",

  "ui.history.openCli": "View CLI history",
  "ui.history.projectDescription":
    "Browse this project's OMP CLI history without taking over the session or starting work.",
  "ui.history.choose": "History source",
  "ui.history.bound": "This Thread's record",
  "ui.history.catalogPartial":
    "The list is incomplete. Some records couldn't be read or shown.",
  "ui.history.catalogUnavailable": "Project history is missing or unreadable.",

  "config.authUnknown": "Sign-in status unknown",
  "config.partial":
    "Some settings couldn't be read. Refresh when they're available.",
  "model.defaultThinking": "Default (confirmed after connecting)",
  "model.readOnly": "Read-only · Model unknown",
  "model.readOnlyNotice":
    "This Thread is read-only. Start a new Thread to continue. Its draft and history remain.",
  "composer.blocked.readOnly":
    "This Thread is read-only. Start a new Thread to continue. Your draft remains.",
  "ui.runtime.retryStart": "Reconnect",
  "ui.runtime.retry": "Retry",
  "app.thread.indexPartial":
    "The Thread list is incomplete. Refresh to try again.",
  "app.thread.indexUnavailable":
    "Couldn't update the Thread list. Existing Threads remain available.",
  "composer.blocked.preparing": "Preparing Thread…",
  "composer.blocked.start": "Connect this Thread before sending.",
  "composer.blocked.allow": "Allow execution in this project to continue.",
  "composer.blocked.wait": "This Thread isn't ready. Check its status.",
  "model.offThinking": "Thinking off",
  "model.reason.configuration-unknown": "Settings unavailable",
  "config.heading": "Providers",
  "config.description": "Sign in or add an API key, then choose a model.",
  "config.loading": "Loading settings…",
  "config.failed":
    "The settings action couldn't be confirmed. Check settings, network, and app files before retrying. Existing settings remain.",
  "config.source": "Settings folder",
  "config.openaiReady": "OpenAI configured",
  "config.openaiMissing": "OpenAI sign-in needed",
  "config.deepseekReady": "DeepSeek configured",
  "config.deepseekMissing": "DeepSeek API key needed",
  "config.openaiLogin": "Sign in to OpenAI",
  "config.refresh": "Refresh",
  "config.deepseekKey": "DeepSeek API key",
  "config.saveKey": "Save API key",
  "config.keyNotice":
    "Checks the model list online before saving. No reply is generated; the old key stays if this fails.",
  "config.saved": "Saved. Send a message to check that it works.",
  "config.openBrowser": "Sign in with browser",
  "config.authWorking": "Waiting for sign-in…",
  "config.answer": "Continue sign-in",
  "config.cancel": "Cancel sign in",
  "config.auth.saved": "Credentials saved",
  "config.auth.cancelled": "Sign-in cancelled",
  "config.auth.failed":
    "Sign-in failed. Existing credentials remain; try again.",
  "config.auth.timed-out": "Sign-in timed out. Try again.",
  "model.showUnavailable": "Show unavailable models",
  "model.reason.authentication-required": "Sign-in needed",
  "model.reason.disabled": "Unavailable in current settings",
  "app.thread.listFailed": "Couldn't load Threads. Your draft remains.",
  "model.change": "Change model or reasoning effort",
  "ui.runtime.details": "Settings source",
  "app.reading.navigation": "Thread views",
  "app.reading.submissions": "Message log",
  "app.reading.history": "History",
  "model.heading": "Model",
  "model.search": "Search models",
  "model.active": "Current model",
  "model.none": "No active model",
  "models.nextStartLabel": "Next connection",
  "models.nextStart": "Selected for the next connection. Reconnect to apply.",
  "models.recoverySelect":
    "Select an available model, then reconnect to continue this Thread.",
  "models.recoveryBlocked":
    "Model switching is unavailable until execution and recovery are confirmed safe. Your history remains readable.",
  "model.next": "Use when connected",
  "model.choose": "Choose model",
  "model.thinking": "Reasoning effort",
  "model.apply": "Apply",
  "model.noAvailable": "No available models. Connect a provider, then refresh.",
  "model.notice":
    "Applies only to this Thread. Finish work, queued messages, and pending questions before switching. The active settings take precedence. Requests may still fail. Up to 200 matches are shown.",

  "app.loading": "Restoring draft…",
  "app.failure.title": "Local data unavailable",
  "app.trace": "Trace ID: {traceId}",
  "app.build": "Build {buildId}",
  "app.retry": "Check again",
  "app.navigation.selectionUnknown":
    "Couldn't confirm the selected Thread. Check again.",
  "app.navigation.back": "Back",
  "app.navigation.forward": "Forward",
  "app.navigation.checkSelection": "Check current Thread",
  "app.sidebar.pinned": "Pinned",
  "app.sidebar.pin": "Pin",
  "app.sidebar.unpin": "Unpin",
  "app.sidebar.untitled": "New conversation",
  "app.sidebar.actions": "Actions for {name}",
  "app.sidebar.threadCount": "{count} conversations",
  "app.sidebar.newInProject": "New conversation in {name}",
  "app.sidebar.noThreads": "No conversations yet",
  "app.sidebar.loading": "Loading projects and conversations…",
  "app.sidebar.allPinned": "Conversations are pinned separately",
  "app.sidebar.showMore": "Show more",
  "app.sidebar.showMoreCount": "Show {count} more",
  "app.sidebar.showLess": "Show less",
  "app.sidebar.saveFailed":
    "Sidebar changes could not be confirmed. Reload and check.",
  "app.sidebar.dragInstructions":
    "Press Space to start reordering, arrow keys to move, Space to confirm, or Escape to cancel.",
  "app.sidebar.dragStart": "Moving {name}.",
  "app.sidebar.dragOver": "Move {name} to the position of {target}.",
  "app.sidebar.dragEnd": "Finished moving {name}.",
  "app.sidebar.dragCancel": "Move cancelled.",
  "app.sidebar.projects": "Projects",
  "app.sidebar.noProject": "No project selected",
  "app.sidebar.localDraft": "Draft",
  "app.executionNeedsApproval": "Allow project execution",
  "app.thread.label": "Thread {number}",
  "app.toolbar.newThread": "New Thread",
  "app.toolbar.start": "Start",
  "app.toolbar.darkTheme": "Dark theme",
  "app.toolbar.lightTheme": "Light theme",
  "app.toolbar.compactDensity": "Compact density",
  "app.toolbar.normalDensity": "Normal density",
  "app.toolbar.language": "Language",
  "app.toolbar.systemLanguage": "System",
  "app.toolbar.chinese": "简体中文",
  "app.toolbar.english": "English",
  "app.language.saveFailed":
    "Language changed but wasn't saved. Your previous setting may return next time.",
  "app.draft.title": "Where should we start?",
  "app.draft.description": "Drafts are saved on this device.",
  "app.draft.directoryUnavailable":
    "The project folder is unavailable. You can still edit your draft.",
  "app.empty.title": "Start a task",
  "app.empty.description": "Choose a project to start a Thread.",
  "app.empty.choose": "Open project",
  "app.empty.note":
    "Projects open for browsing. Allow execution before running tasks.",
  "composer.paste.unsupported":
    "Pasting these attachments isn't supported yet. Nothing was added; your draft remains.",
  "composer.paste.hint": "⌘⇧V to paste plain text",
  "composer.editorLabel": "Message",
  "composer.sectionLabel": "Message input",
  "composer.inputOptions": "Input options",
  "composer.heading": "Draft",
  "composer.status.saved": "Saved",
  "composer.status.dirty": "Waiting to save…",
  "composer.status.saving": "Saving…",
  "composer.status.checking": "Checking saved version…",
  "composer.status.conflict": "Versions differ. Choose which to keep.",
  "composer.status.failed": "Not saved",
  "composer.shortcut.newline": "Enter for a new line · ⌘Enter to send",
  "composer.shortcut.send": "Enter to send · Shift+Enter for a new line",
  "composer.shortcut.undo": "· ⌘Z to undo",
  "composer.collapse": "Collapse input",
  "composer.expand": "Expand input",
  "composer.switchShortcut": "Switch send shortcut",
  "composer.conflict.description":
    "Your input differs from the saved version. Choose which to keep, or copy a backup first.",
  "composer.conflict.compare": "Compare versions",
  "composer.conflict.current": "Current input",
  "composer.conflict.saved": "Saved version",
  "composer.conflict.keepCurrent": "Save current input",
  "composer.conflict.loadSaved": "Use saved version",
  "composer.conflict.loadWarning":
    "Replaces your current input. ⌘Z undoes it. Finish any input-method selection first.",
  "composer.retrySave": "Retry save",
  "composer.checkSave": "Check save status",
  "composer.selectAll": "Select all",
  "composer.queueSend": "Queue message",
  "composer.send": "Send",
  "composer.steer": "Steer task",
  "composer.queueFull":
    "Queue full ({queued}/{cap}). Wait for a message to be processed. Your draft remains.",
  "ui.conversation.details": "Details",
  "ui.conversation.generating": "Generating…",
  "ui.conversation.thinking": "Thinking",
  "ui.conversation.thinkingActive": "Thinking…",
  "ui.conversation.turns": "Prompts",
  "ui.conversation.jumpToTurn": "Go to prompt {number}: {preview}",
  "ui.conversation.turnNumber": "Prompt {number}",
  "ui.conversation.questionWithoutText": "No text in this prompt.",
  "ui.conversation.copyCode": "Copy code",
  "ui.conversation.image": "[Image: {alt}]",
  "ui.conversation.imageNotLoaded": "Not loaded",
  "ui.conversation.sectionLabel": "Thread",
  "ui.conversation.heading": "Thread",
  "ui.conversation.empty": "No messages yet.",
  "ui.conversation.gap":
    "Some messages are unavailable. Open native history from Thread tools.",
  "ui.conversation.streaming": "In progress",
  "ui.conversation.failed": "Failed",
  "ui.conversation.copy": "Copy",
  "ui.conversation.imageNumber": "Image {number}",
  "ui.conversation.mediaUnavailable": "Preview unavailable",
  "composer.stopResponse": "Stop response",
  "composer.resumeQueue": "Continue sending",
  "ui.conversation.toolOutput": "Tool output",
  "ui.conversation.waitingResult": "Waiting for result…",
  "ui.submissions.sectionLabel": "Message log",
  "ui.submissions.summary":
    "{count, plural, one {# message record} other {# message records}} (up to the latest 100)",
  "ui.submissions.warning":
    "A confirmed send doesn't mean work is complete. Check unknown results before resending.",
  "ui.submissions.checkStatus": "Check send status",
  "ui.submissions.rejected.contentMissing":
    "Not sent: an image is missing. Attach it again. Your input remains.",
  "ui.interaction.rejected.contentMissing":
    "Not sent: an image is missing. Attach it again. Your input remains.",
  "ui.submissions.rejected.contentCorrupt":
    "Not sent: an image is damaged. Attach it again. Your input remains.",
  "ui.interaction.rejected.contentCorrupt":
    "Not sent: an image is damaged. Attach it again. Your input remains.",
  "ui.submissions.rejected.transportTooLarge":
    "Not sent: images exceed the send limit. Reduce attachments. Your input remains.",
  "ui.interaction.rejected.transportTooLarge":
    "Not sent: images exceed the send limit. Reduce attachments. Your input remains.",
  "ui.submissions.rejected":
    "Not sent. Your input remains. Resolve the issue before sending again.",
  "ui.submissions.rejected.notReady":
    "Not sent: no model is ready. Choose a model. Your input remains.",
  "ui.submissions.rejected.nativeUnavailable":
    "Not sent: this Thread isn't connected. Check the connection. Your input remains.",
  "ui.submissions.rejected.unsupportedNativeCommand":
    "Not sent: this command can't be used in the message input. Your input remains.",
  "ui.submissions.rejected.paused":
    "Not sent: the queue is paused. Resume it first. Your input remains.",
  "ui.submissions.rejected.interactionPending":
    "Not sent: answer the pending question first. Your input remains.",
  "ui.submissions.rejected.staleTarget":
    "Not sent: the Thread connection changed. Check its current status. Your input remains.",
  "ui.submissions.rejected.correlationLimit":
    "Not sent: too many messages are unconfirmed. Check message log. Your input remains.",
  "ui.submissions.acknowledged": "Send confirmed",
  "ui.submissions.prepared": "Saved, not sent",
  "ui.submissions.dispatching": "Sent, awaiting confirmation",
  "ui.submissions.unknown": "Result unknown",
  "ui.submissions.outcomeCompleted": " · Prompt finished",
  "ui.submissions.outcomeAborted": " · Prompt stopped",
  "ui.interaction.followUpCompleted": "Prompt finished",
  "ui.interaction.followUpAborted": "Prompt stopped",
  "ui.submissions.outcomeFailed": " · Call failed",
  "ui.submissions.outcomeUnknown": " · Outcome unknown",
  "ui.submissions.retryOf": "Resent from: {id}",
  "ui.submissions.preparedWarning":
    "Not sent yet. Continue sends the text above after checking permission. Your current draft stays unchanged.",
  "ui.submissions.continue": "Continue sending",
  "ui.submissions.resendTitle": "Resend this message?",
  "ui.submissions.resendWarning":
    "This may have already run. Resending can repeat actions. Check history first. Your current draft stays unchanged; read-only Threads or paused queues won't send.",
  "ui.submissions.resendConfirm": "Resend anyway",
  "ui.submissions.copyOriginal": "Copy original",
  "ui.history.sectionLabel": "History (read-only)",
  "ui.history.description":
    "Shown in saved order, not the model's current context. Viewing doesn't start work.",
  "ui.history.read": "Load history",
  "ui.history.readFailed": "Couldn't load history. Try again.",
  "ui.history.unavailable": "Couldn't read records: {reason}.",
  "ui.history.reason.unbound": "No saved record",
  "ui.history.reason.missing": "Record missing",
  "ui.history.reason.denied": "Access denied",
  "ui.history.reason.changed": "Record changed",
  "ui.history.reason.unsupported": "Unsupported format",
  "ui.history.reason.invalid": "Invalid record",
  "ui.history.reason.cancelled": "Read cancelled",
  "ui.history.incompleteTail":
    "The last record is still being written and isn't shown yet.",
  "ui.history.omitted":
    "{count, plural, one {# non-message record isn't shown.} other {# non-message records aren't shown.}}",
  "ui.history.parent": "{id} ← {parentId}",
  "ui.history.root": "Root",
  "ui.history.role.user": "User",
  "ui.history.role.assistant": "Assistant",
  "ui.history.role.tool": "Tool",
  "ui.history.next": "Next page",
  "ui.history.empty": "No complete text messages to show.",
  "ui.runtime.loading": "Loading status…",
  "ui.runtime.phase.browse": "Browse only",
  "ui.runtime.phase.allowed": "Execution allowed",
  "ui.runtime.phase.starting": "Connecting",
  "ui.runtime.phase.busy": "Generating",
  "ui.runtime.phase.ready": "Ready",
  "ui.runtime.phase.interrupted": "Connection interrupted",
  "ui.runtime.phase.failed": "Connection unavailable",
  "ui.runtime.sectionLabel": "Task status",
  "ui.runtime.model": "Model: {model}",
  "ui.runtime.queuePaused":
    "Queue paused: {queued} · Background activity: {background}",
  "ui.runtime.queueActive":
    "Queued: {queued} · Background activity: {background}",
  "ui.runtime.steering": "Steering",
  "ui.runtime.pending": "Pending",
  "ui.runtime.stopping": "Requesting stop…",
  "ui.runtime.stop": "Stop and pause queue",
  "ui.runtime.continue": "Resume queue",
  "ui.runtime.interactionsLabel": "Questions",
  "ui.runtime.unsupportedInteraction":
    "Some questions can't be shown. They weren't answered automatically.",
  "ui.runtime.interactionRecords": "Answer records",
  "ui.runtime.allow": "Allow execution",
  "ui.runtime.start": "Connect Thread",
  "ui.runtime.revoke": "Revoke execution permission",
  "ui.runtime.inspect": "Check status",
  "ui.interaction.cancelled": "Cancelled",
  "ui.interaction.empty": "(empty)",
  "ui.interaction.followUpFailed":
    "Couldn't send the follow-up. Your text remains in the input.",
  "ui.interaction.defaultAnswered":
    "Answered by default after timeout: {answer}. You can still send a follow-up.",
  "ui.interaction.confirm": "Confirm",
  "ui.interaction.reject": "Reject",
  "ui.interaction.submit": "Send answer",
  "ui.interaction.customAnswer": "Other answer",
  "ui.interaction.customPlaceholder": "Type your answer…",
  "ui.interaction.cancel": "Cancel answer",
  "ui.interaction.continueAnswerLabel": "Follow-up answer: {title}",
  "ui.interaction.sendingFollowUp": "Sending…",
  "ui.interaction.sendFollowUp": "Send follow-up",
  "ui.interaction.followUpAcknowledged":
    "Send confirmed. You can add another follow-up.",
  "ui.interaction.followUpPrepared":
    "Saved, not sent. Continue to send this message.",
  "ui.interaction.followUpDispatching": "Sent, awaiting confirmation.",
  "ui.interaction.followUpRejected":
    "Not sent. Your input remains. Check message log before retrying.",
  "ui.interaction.rejected.notReady":
    "Not sent: no model is ready. Wait for the Thread to be ready, then retry.",
  "ui.interaction.rejected.nativeUnavailable":
    "Not sent: this Thread isn't connected. Reconnect first.",
  "ui.interaction.rejected.unsupportedNativeCommand":
    "Not sent: this command can't be used in the message input.",
  "ui.interaction.rejected.paused":
    "Not sent: the queue is paused. Resume it first.",
  "ui.interaction.rejected.interactionPending":
    "Not sent: answer or close the pending question first.",
  "ui.interaction.rejected.staleTarget":
    "Not sent: the Thread connection changed. Check it before sending again.",
  "ui.interaction.rejected.correlationLimit":
    "Not sent: too many messages are unconfirmed. Check their results first.",
  "ui.interaction.followUpUnknown":
    "Send outcome unknown. Your input remains. Check message log before sending again.",
  "ui.interaction.continueDispatch": "Send this message",
  "ui.interaction.expired": "Timed out",
  "ui.interaction.dismissed":
    "This prompt is closed. Work may still be running.",
  "ui.interaction.nativeCancelled": "Answer cancelled",
  "ui.interaction.answerUnknown":
    "Answer outcome unknown. It won't be resent automatically.",
  "ui.interaction.answerSubmitted": "Answer submitted, awaiting confirmation.",
  "ui.interaction.answerWritten": "Answer sent, awaiting the result.",
  "ui.interaction.dismissUnknown": "Dismiss prompt",
  "ui.interaction.dismissWarning":
    "Dismissing won't stop work. A default answer may already have taken effect. Check history before resending.",
  "ui.files.section": "Files and changes (read-only)",
  "ui.files.readOnly": "Read-only. Shows file contents at the time of reading.",
  "ui.files.tree": "Project files",
  "ui.files.refresh": "Refresh",
  "ui.files.refreshing": "Refreshing. Previous content remains visible.",
  "ui.files.up": "Up",
  "ui.files.truncatedTree": "Showing the first 500 entries.",
  "ui.files.gitHeading": "Current changes",
  "ui.files.gitDisclaimer":
    "Shows current Git changes, which may not be from the Agent. Files and diff sides are read separately; untracked files follow Git ignore rules.",
  "ui.files.notGit":
    "No readable Git repository. Files and tool results are still available.",
  "ui.files.gitUnavailable":
    "Git isn't available. Files and tool results can still be viewed.",
  "ui.files.unborn": "No commits yet",
  "ui.files.projectSample": "Project read results",
  "ui.files.singleFileSample": "File read results",
  "ui.files.sameText":
    "The text matches. Names, permissions, or other attributes may have changed.",
  "ui.files.headIndex": "HEAD → Index",
  "ui.files.indexWorktree": "Index → Working tree",
  "ui.files.untracked": "Untracked",
  "ui.files.status.added": "Added",
  "ui.files.status.modified": "Modified",
  "ui.files.status.deleted": "Deleted",
  "ui.files.status.renamed": "Renamed",
  "ui.files.status.unmerged": "Conflict",
  "ui.files.status.other": "Other",
  "ui.files.noChanges": "No changes found.",
  "ui.files.truncatedChanges": "Showing the first 1,000 changes.",
  "ui.files.workingTree": "Working tree file",
  "ui.files.complete": "Full text",
  "ui.files.attachSelection": "Add selection",
  "ui.files.selectionFrozen":
    "Keeps the selected text and its location, even if the file changes later.",
  "ui.files.selectionEmpty": "Select some text first.",
  "ui.files.selectionRangeInvalid":
    "The selection is no longer valid. Select the text again.",
  "ui.files.selectionTooLarge":
    "The selection exceeds 64 KiB. Select less text.",
  "ui.files.transportFailed":
    "Couldn't read the content. Refresh to try again.",
  "ui.files.loadingEditor": "Opening file…",
  "ui.files.diffTooLarge":
    "Too large to compare here ({left} characters on the left, {right} on the right). Compare the versions above from the command line.",

  "ui.files.workerFailed":
    "The code viewer is unavailable. Check the app's files.",
  "ui.files.reason.missing": "The file or change no longer exists.",
  "ui.files.reason.denied":
    "Can't access this path. It may be outside the project or access may be denied.",
  "ui.files.reason.binary":
    "This isn't a text file. Text comparison and selection aren't available.",
  "ui.files.reason.encoding": "This file isn't valid UTF-8 text.",
  "ui.files.reason.large": "The content is too large to display in full.",
  "ui.files.reason.changed":
    "The file changed while reading. Refresh to try again.",
  "ui.files.reason.unmerged":
    "Resolve the file conflict before viewing this diff.",
  "ui.files.reason.unsupported":
    "Diffs for symbolic links and submodules aren't supported yet.",
  "ui.files.reason.notFile": "This path isn't a regular file or folder.",
  "ui.files.reason.failed": "Couldn't read the content.",
  "ui.history.nativeToolEvidence": "Tool results",
  "ui.history.toolCall":
    "Tool {toolName} · Call {toolCallId} · Record {recordId}",
  "ui.history.toolReportedWrite":
    "The tool reported a successful edit. Full before-and-after text isn't available for comparison.",
  "ui.history.toolFailed":
    "The tool reported failure. A successful edit isn't confirmed.",
  "ui.history.toolSuccessNoWrite":
    "The tool succeeded. This doesn't confirm a file change.",
  "ui.history.toolUnknown": "The tool didn't provide a clear outcome.",
  "ui.history.toolCoverage":
    "Text only; {count, plural, one {# non-text part omitted} other {# non-text parts omitted}}. Source: {source}",
  "ui.diagnostics.entry": "Diagnostics & feedback",
  "ui.diagnostics.traceEntry": "View failure details",
  "ui.diagnostics.unavailable": "Diagnostics unavailable",
  "ui.diagnostics.heading": "Diagnostics & feedback",
  "ui.diagnostics.close": "Close diagnostics",
  "ui.diagnostics.description":
    "Local logs from the last 24 hours, up to 100 records by default. Exports stay on your device; nothing uploads automatically.",
  "ui.diagnostics.since": "Since",
  "ui.diagnostics.until": "Until",
  "ui.diagnostics.trace": "Trace ID",
  "ui.diagnostics.thread": "Thread ID",
  "ui.diagnostics.writer": "Log writer ID",
  "ui.diagnostics.stage": "Stage",
  "ui.diagnostics.allStages": "All stages",
  "ui.diagnostics.limit": "Record limit",
  "ui.diagnostics.apply": "Apply filters",
  "ui.diagnostics.invalidFilter":
    "Check the time range, ID format, and record limit (1–500).",
  "ui.diagnostics.refresh": "Refresh",
  "ui.diagnostics.export": "Export redacted logs",
  "ui.diagnostics.exporting": "Exporting…",
  "ui.diagnostics.copy": "Copy feedback template",
  "ui.diagnostics.refreshing": "Refreshing. Previous results remain visible.",
  "ui.diagnostics.loading": "Loading logs…",
  "ui.diagnostics.staleFailure":
    "Refresh failed: {reason}. Previous results remain visible.",
  "ui.diagnostics.readFailure":
    "Couldn't read logs: {reason}. Refresh to try again.",
  "ui.diagnostics.exported": "Exported: {fileName}",
  "ui.diagnostics.cancelled": "Cancelled. No file was saved.",
  "ui.diagnostics.commandFailed": "Export failed: {reason}. Try again.",
  "ui.diagnostics.copied":
    "Copied. Complete and review the template before submitting.",
  "ui.diagnostics.copyFailed": "Couldn't copy. Select and copy the text below.",
  "ui.diagnostics.commandTrace": "View export trace",
  "ui.diagnostics.sample":
    "Read at {time} · {count, plural, one {# record} other {# records}}",
  "ui.diagnostics.coverage":
    "Read {files} files / {bytes} bytes / {lines} lines · Invalid {malformed} · Redacted {redacted} · Unreadable {unreadable}",
  "ui.diagnostics.truncated":
    "Results are incomplete. Narrow the time range or add filters.",
  "ui.diagnostics.writerDegraded": "Logging degraded · Dropped {dropped}",
  "ui.diagnostics.writerHealthy": "Logging healthy · Dropped {dropped}",
  "ui.diagnostics.notProvided": "Not provided",
  "ui.diagnostics.writerCounters":
    "Totals: Unconfirmed writes {uncertain} · Cleanup failures {retentionFailures} · Rejected {rejected} · Close timeouts {drainTimedOut} · In progress {inFlight}",
  "ui.diagnostics.writerRecovery":
    "Last recovery: {time}. Counts remain; missing records aren't restored.",
  "ui.diagnostics.interpretation":
    "Logs may be incomplete. Missing records don't mean an action didn't happen, and stages don't confirm completion. Refresh uses the current filters.",
  "ui.diagnostics.empty": "No matching records.",
  "ui.diagnostics.recordThread": "Thread: {threadId}",
  "ui.diagnostics.feedback": "Feedback template",
  "ui.diagnostics.feedbackHint":
    "Add steps to reproduce, then check for sensitive content. Attach redacted logs if useful.",
  "ui.diagnostics.template":
    "d-pi issue report\n\nDiagnostics:\n{metadata}\n\nSteps to reproduce: [add steps]\nExpected: [add result]\nActual: [add result]\n",
  "ui.diagnostics.operation": "Operation",
  "ui.diagnostics.allOperations": "All operations",
  "ui.diagnostics.recordDetails": "Correlation & exit details",
  "app.layout.navigation": "Navigation",
  "app.layout.chat": "Thread",
  "app.layout.settings": "Settings",
  "app.layout.sidebar": "Project sidebar",
  "app.layout.sidebarToggle": "Show or hide sidebar",
  "app.layout.sidebarResize": "Resize sidebar",
  "app.layout.workspaceResize": "Resize right panel",
  "app.layout.bottomResize": "Resize bottom panel",
  "app.layout.workspace": "Right panel",
  "app.layout.bottom": "Bottom panel",
  "app.layout.close": "Close",
  "app.layout.closeTab": "Close {title}",
  "app.layout.showWorkspace": "Show right panel",
  "app.layout.showBottom": "Show bottom panel",
  "app.layout.temporarilyHidden":
    "The panel is hidden to fit the window. Enlarge it to show the panel.",
  "app.layout.appearance": "Appearance",
  "app.layout.configuration": "Providers",
  "app.layout.attention": "Notifications",
  "app.layout.diagnostics": "Diagnostics",
  "app.toolbar.systemTheme": "System theme",
  "app.layout.theme": "Theme",
  "app.layout.statusbar": "Status bar",
  "app.layout.backToConversation": "Back to Thread",
  "app.status.switching": "Switching Thread…",
  "app.status.noConversation": "No Thread selected",
  "app.status.unavailable": "Unavailable",
  "app.status.preview": "Thread preview",
  "app.status.messages": "{count, plural, one {# message} other {# messages}}",
  "app.status.queued": "{count} queued",
  "app.status.execution": "Task status",
  "app.status.model": "Model",
  "app.status.messagesLabel": "Current messages",
  "app.status.queueLabel": "Queued messages",
  "app.status.background": "Background tasks",
  "app.status.directory": "Working directory",
  "app.status.messagesScope":
    "Counts user and assistant messages in the current live window only.",
  "app.status.messagesGap":
    "Some messages haven't synced. The count may be incomplete.",
  "ui.conversation.aborted": "Stopped",
  "ui.conversation.continuation": "Continuing the interrupted reply",
  "app.sidebar.preview": "Thread preview",
  "app.sidebar.rename": "Rename",
  "app.sidebar.fork": "Fork thread",
  "app.sidebar.complete": "Mark complete",
  "app.sidebar.completeSuccess": "Marked complete",
  "app.sidebar.reopenSuccess": "Marked active",
  "app.sidebar.reopen": "Mark active",
  "app.sidebar.completed": "Completed",
  "app.sidebar.delete": "Delete permanently",
  "app.sidebar.deleteConfirm":
    "Permanently delete “{name}”? The thread, native history and its artifacts will be removed. This cannot be undone.",
  "app.sidebar.name": "Thread name",
  "app.sidebar.cancel": "Cancel",
  "app.sidebar.save": "Save",
  "app.sidebar.working": "Working…",
  "app.sidebar.commandFailed":
    "The action could not be confirmed. Resolve active work or uncertain results, or check the thread again before retrying.",
} as const;
