export const main = {
  "main.chooseProject.title": "Choose a project and create a draft",
  "main.loggingFailure.message": "Diagnostic logs are temporarily unavailable",
  "main.loggingFailure.detail":
    "Troubleshooting records may be incomplete. Use the editor's save status to check whether the draft was saved. Check write access to the app data directory.",
  "main.loggingFailure.acknowledge": "OK",
  "main.closeUnconfirmed.message": "Could not confirm that the draft was saved",
  "main.closeUnconfirmed.detail":
    "The window will stay open. Check the current input and save status, then try closing it again.",
  "main.closeUnconfirmed.keepWindow": "Keep window open",
  "main.rendererGone.message": "The input window stopped responding",
  "main.rendererGone.detail":
    "Reopening restores the last confirmed saved draft. Unsaved input may be lost.",
  "main.rendererGone.reopen": "Reopen",
  "main.closeUnsaved.message":
    "The draft has not been saved; the window remains open",
  "main.closeUnsaved.detail":
    "Confirm any active input method selection, or resolve the save failure shown in the window before closing.",
  "main.closeUnsaved.continueEditing": "Continue editing",
  "main.menu.about": "About d-pi",
  "main.menu.quit": "Quit d-pi",
  "main.menu.edit": "Edit",
  "main.menu.undo": "Undo",
  "main.menu.redo": "Redo",
  "main.menu.cut": "Cut",
  "main.menu.copy": "Copy",
  "main.menu.pastePlain": "Paste as Plain Text",
  "main.menu.paste": "Paste",
  "main.menu.selectAll": "Select All",
  "main.menu.window": "Window",
  "main.menu.development": "Development",
  "main.menu.devTools": "Toggle Developer Tools",
  "main.menu.minimize": "Minimize",
  "main.menu.zoom": "Zoom",
  "main.menu.close": "Close Window",
  "main.quitActive.message": "Native work or its status is still unresolved",
  "main.quitActive.detail":
    "Wait quits after the work finishes and the draft is saved. Stop interrupts the current run and pauses its queue. The app stays open if queued items, interactions, or background work remain. Resolve them before quitting. Unknown status will not be forcibly terminated.",
  "main.quitActive.wait": "Wait, then quit",
  "main.quitActive.stop": "Request stop, then quit",
  "main.quitActive.cancel": "Cancel quit",
} as const;
