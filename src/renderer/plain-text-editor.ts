import type { Editor, EditorOptions } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { closeHistory } from "@tiptap/pm/history";
import { parseDraftBlocks } from "../features/files/reference";
import { FileReference } from "./file-reference-node";

// Each paragraph represents one source line, including in copied/cut text.
export const plainTextEditorOptions = {
  extensions: [Document, Paragraph, Text, FileReference, UndoRedo],
  coreExtensionOptions: {
    clipboardTextSerializer: { blockSeparator: "\n" },
  },
} satisfies Partial<EditorOptions>;

export function draftDocument(text: string) {
  return {
    type: "doc",
    content: parseDraftBlocks(text).map((block) =>
      block.kind === "selection"
        ? { type: "fileReference", attrs: block.value }
        : {
            type: "paragraph",
            content: block.text ? [{ type: "text", text: block.text }] : [],
          },
    ),
  };
}

export function replaceDraftText(editor: Editor, text: string): boolean {
  if (editor.view.composing) return false;
  editor.view.dispatch(closeHistory(editor.state.tr));
  const replaced = editor.commands.setContent(draftDocument(text), {
    emitUpdate: false,
  });
  editor.view.dispatch(closeHistory(editor.state.tr));
  return replaced;
}
