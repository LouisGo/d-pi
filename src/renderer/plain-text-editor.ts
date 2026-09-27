import type { EditorOptions } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";

// Each paragraph represents one source line, including in copied/cut text.
export const plainTextEditorOptions = {
  extensions: [Document, Paragraph, Text, UndoRedo],
  coreExtensionOptions: {
    clipboardTextSerializer: { blockSeparator: "\n" },
  },
} satisfies Partial<EditorOptions>;
