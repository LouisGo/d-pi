import type { Editor, EditorOptions } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { closeHistory } from "@tiptap/pm/history";

// Each paragraph represents one source line, including in copied/cut text.
export const plainTextEditorOptions = {
  extensions: [Document, Paragraph, Text, UndoRedo],
  coreExtensionOptions: {
    clipboardTextSerializer: { blockSeparator: "\n" },
  },
} satisfies Partial<EditorOptions>;

export function replaceDraftText(editor: Editor, text: string): boolean {
  if (editor.view.composing) return false;
  editor.view.dispatch(closeHistory(editor.state.tr));
  const replaced = editor.commands.setContent(
    {
      type: "doc",
      content: text.split("\n").map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : [],
      })),
    },
    { emitUpdate: false },
  );
  editor.view.dispatch(closeHistory(editor.state.tr));
  return replaced;
}
