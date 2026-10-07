import {
  type Editor,
  type EditorOptions,
  Extension,
  getSchema,
} from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { history } from "@tiptap/pm/history";
import { EditorState } from "@tiptap/pm/state";
import { parseDraftBlocks } from "../../core/references/serialize";
import {
  AttachmentReference,
  attachmentParagraph,
} from "../references/attachment-reference";
import { FileReference } from "../references/file-reference-node";
import { EditActionHistory } from "./edit-action-history";

export const draftHistoryDepth = 50;
const extensions = [
  Document,
  Paragraph,
  Text,
  Extension.create({
    name: "sourceLineBreak",
    addKeyboardShortcuts() {
      return { "Shift-Enter": () => this.editor.commands.splitBlock() };
    },
  }),
  FileReference,
  AttachmentReference,
  EditActionHistory,
  UndoRedo.configure({ depth: draftHistoryDepth }),
];
// Build the stable input schema without an Editor context. Cached documents and
// history slices must not retain a destroyed Editor through schema callbacks.
const schema = getSchema(extensions);

// Each paragraph represents one source line, including in copied/cut text.
export const plainTextEditorOptions = {
  extensions,
  onBeforeCreate: ({ editor }) => {
    editor.schema = schema;
    editor.extensionManager.schema = schema;
  },
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
        : attachmentParagraph(block.text),
    ),
  };
}

export function replaceDraftText(editor: Editor, text: string): boolean {
  if (editor.view.composing) return false;
  const replaced = editor.commands.setContent(draftDocument(text), {
    emitUpdate: false,
  });
  if (replaced) clearDraftHistory(editor);
  return replaced;
}

const historyClearListeners = new WeakMap<Editor, Set<() => void>>();
export function onDraftHistoryClear(
  editor: Editor,
  listener: () => void,
): () => void {
  const listeners = historyClearListeners.get(editor) ?? new Set();
  listeners.add(listener);
  historyClearListeners.set(editor, listeners);
  return () => listeners.delete(listener);
}
export function clearDraftHistory(editor: Editor): void {
  for (const listener of historyClearListeners.get(editor) ?? []) listener();
  editor.view.updateState(
    EditorState.create({
      schema: editor.state.schema,
      doc: editor.state.doc,
      selection: editor.state.selection,
      storedMarks: editor.state.storedMarks,
      plugins: editor.state.plugins,
    }),
  );
}

export function detachedDraftState(editor: Editor): EditorState {
  // Reconfigure retains history by its stable ProseMirror key. All Tiptap,
  // decoration and view plugin closures are omitted from the inactive cache.
  return editor.state.reconfigure({
    plugins: [history({ depth: draftHistoryDepth })],
  });
}
