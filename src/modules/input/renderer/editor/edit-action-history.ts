import { Extension } from "@tiptap/core";
import { closeHistory, isHistoryTransaction } from "@tiptap/pm/history";
import { Plugin } from "@tiptap/pm/state";

type Action = "input" | "delete" | "independent";
export const EditActionHistory = Extension.create({
  name: "editActionHistory",
  addProseMirrorPlugins() {
    let inputType = "",
      previous: Action | null = null;
    return [
      new Plugin({
        props: {
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
        filterTransaction(tr) {
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
