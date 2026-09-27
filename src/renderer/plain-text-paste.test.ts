import { readFileSync } from "node:fs";
import { getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { history, redo, undo } from "@tiptap/pm/history";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { textPasteTransaction } from "./plain-text-paste";

const schema = getSchema([Document, Paragraph, Text]);
const source = readFileSync(
  new URL("../../validation/s1/paste/sample.md", import.meta.url),
  "utf8",
);
function plain(state: EditorState): string {
  return Array.from(
    { length: state.doc.childCount },
    (_, i) => state.doc.child(i).textContent,
  ).join("\n");
}
describe("S1 literal text paste", () => {
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
