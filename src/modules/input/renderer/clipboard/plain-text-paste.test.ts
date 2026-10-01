import { readFileSync } from "node:fs";
import { Editor, getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { history, redo, undo } from "@tiptap/pm/history";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import {
  plainTextEditorOptions,
  replaceDraftText,
} from "../editor/plain-text-editor";
import { textPasteTransaction } from "./plain-text-paste";

const schema = getSchema([Document, Paragraph, Text]);
const source = readFileSync(
  new URL("../../../../../validation/s1/paste/sample.md", import.meta.url),
  "utf8",
);
function plain(state: EditorState): string {
  return Array.from(
    { length: state.doc.childCount },
    (_, i) => state.doc.child(i).textContent,
  ).join("\n");
}
describe("S1 literal text paste", () => {
  it("loading a stored draft clears previous undo, preserving source blank lines", () => {
    const editor = new Editor({
      ...plainTextEditorOptions,
      element: null,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "local words" }],
          },
        ],
      },
    });
    // Headless Tiptap skips view creation, where extensions normally install plugins.
    editor.view.updateState(
      editor.state.reconfigure({ plugins: editor.extensionManager.plugins }),
    );
    try {
      expect(replaceDraftText(editor, "stored\n\n  text\n")).toBe(true);
      expect(editor.getText({ blockSeparator: "\n" })).toBe(
        "stored\n\n  text\n",
      );
      expect(editor.commands.undo()).toBe(false);
      expect(editor.getText({ blockSeparator: "\n" })).toBe(
        "stored\n\n  text\n",
      );
    } finally {
      editor.destroy();
    }
  });
  it("copies and cuts source lines without changing blank lines, including a partial selection", () => {
    const original = `${source}\n\n`;
    const pasted = EditorState.create({ schema });
    const editor = new Editor({
      ...plainTextEditorOptions,
      element: null,
      content: pasted
        .apply(textPasteTransaction(pasted, original))
        .doc.toJSON(),
    });
    try {
      const plugin = editor.extensionManager.plugins.find(
        (value) => value.props.clipboardTextSerializer,
      );
      if (!plugin?.props.clipboardTextSerializer)
        throw new Error("Missing editor clipboard serializer");
      const copy = () =>
        plugin.props.clipboardTextSerializer?.call(
          plugin,
          editor.state.selection.content(),
          editor.view,
        );
      editor.commands.selectAll();
      const copied = copy();
      expect(copied).toBe(original);
      if (copied === undefined) throw new Error("Missing copied source");
      // Cut uses the same serializer before deleting the selection.
      editor.commands.deleteSelection();
      editor.view.dispatch(textPasteTransaction(editor.state, copied));
      expect(editor.getText({ blockSeparator: "\n" })).toBe(original);
      editor.commands.setContent({
        type: "doc",
        content: ["before first", "  second after"].map((text) => ({
          type: "paragraph",
          content: [{ type: "text", text }],
        })),
      });
      editor.commands.setTextSelection({ from: 8, to: 23 });
      expect(copy()).toBe("first\n  second");
    } finally {
      editor.destroy();
    }
  });
  it("preserves the reported Markdown source, blank lines and trailing newline in one undoable edit", () => {
    let state = EditorState.create({ schema, plugins: [history()] });
    state = state.apply(textPasteTransaction(state, source + "\n"));
    expect(plain(state)).toBe(source + "\n");
    expect(
      undo(state, (tr) => {
        state = state.apply(tr);
      }),
    ).toBe(true);
    expect(plain(state)).toBe("");
    expect(
      redo(state, (tr) => {
        state = state.apply(tr);
      }),
    ).toBe(true);
    expect(plain(state)).toBe(source + "\n");
  });
  it("replaces a selection, retaining indentation, blank lines, literal code and surrounding text", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("before OLD after")),
    ]);
    let state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 8, 11),
    });
    state = state.apply(
      textPasteTransaction(state, "```ts\r\n  a  b\r\n\r\n\tcode\r\n```"),
    );
    expect(plain(state)).toBe("before ```ts\n  a  b\n\n\tcode\n``` after");
  });
});
