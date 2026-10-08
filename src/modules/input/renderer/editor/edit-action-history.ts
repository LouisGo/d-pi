import { type Editor, Extension } from "@tiptap/core";
import { closeHistory, isHistoryTransaction } from "@tiptap/pm/history";
import { Plugin, type Transaction } from "@tiptap/pm/state";

const admissions = new WeakMap<
  Editor,
  (transaction?: Transaction) => boolean
>();
const attachmentResolution = new WeakMap<Editor, () => boolean>();
/** Protect a restored body until its private attachment tokens are classified. */
export function bindAttachmentResolution(
  editor: Editor,
  ready: () => boolean,
): () => void {
  attachmentResolution.set(editor, ready);
  return () => attachmentResolution.delete(editor);
}
export function bindHistoryAdmission(
  editor: Editor,
  admit: (transaction?: Transaction) => boolean,
): () => void {
  admissions.set(editor, admit);
  return () => admissions.delete(editor);
}

type Action = "input" | "delete" | "independent";
export const EditActionHistory = Extension.create({
  name: "editActionHistory",
  addProseMirrorPlugins() {
    let inputType = "",
      previous: Action | null = null;
    return [
      new Plugin({
        props: {
          editable: () =>
            (attachmentResolution.get(this.editor)?.() ?? true) &&
            (admissions.get(this.editor)?.() ?? true),
          handleDOMEvents: {
            keydown: (_view, event) => {
              if (event.key === "Backspace" || event.key === "Delete")
                inputType =
                  event.key === "Backspace"
                    ? "deleteContentBackward"
                    : "deleteContentForward";
              return false;
            },
            beforeinput: (_view, event) => {
              inputType = event.inputType;
              return false;
            },
          },
        },
        filterTransaction: (tr) => {
          if (
            tr.docChanged &&
            attachmentResolution.get(this.editor)?.() === false &&
            !tr.getMeta("dpiReferenceLabelRefresh") &&
            !tr.getMeta("dpiDetachedImageProjection") &&
            !tr.getMeta("dpiTrustedDraftReplacement")
          )
            return false;
          if (tr.docChanged && admissions.get(this.editor)?.(tr) === false)
            return false;
          if (!tr.docChanged || tr.getMeta("addToHistory") === false)
            return true;
          if (isHistoryTransaction(tr)) {
            previous = null;
            return true;
          }
          const type: unknown = tr.getMeta("inputType") ?? inputType;
          inputType = "";
          const event: unknown = tr.getMeta("uiEvent");
          const action: Action =
            tr.getMeta("dpiIndependentAction") ||
            event === "paste" ||
            event === "cut" ||
            event === "drop" ||
            type === "insertFromPaste" ||
            type === "insertFromDrop" ||
            type === "deleteByCut"
              ? "independent"
              : typeof type === "string" && type.startsWith("delete")
                ? "delete"
                : "input";
          if (
            action === "independent" ||
            previous === "independent" ||
            action !== previous
          )
            closeHistory(tr);
          previous = action;
          return true;
        },
      }),
    ];
  },
});
