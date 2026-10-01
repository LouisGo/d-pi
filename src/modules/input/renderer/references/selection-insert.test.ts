import { Editor, getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { expect, test } from "vitest";
import { captureSelection } from "../../../files/core/public";
import { serializeReference } from "../../core/references/serialize";
import {
  draftDocument,
  plainTextEditorOptions,
  replaceDraftText,
} from "../editor/plain-text-editor";
import { appendSelectionReference } from "./selection-insert";

const value = captureSelection(
  "first\n第二行",
  { startLineNumber: 1, startColumn: 3, endLineNumber: 2, endColumn: 4 },
  { path: "src/a.ts", source: "working tree", version: "sha256:abc" },
);
if (value.kind !== "selection") throw Error("Fixture selection failed");

test("appends an atomic selection reference and restores exact text from persisted draft", () => {
  const schema = getSchema(plainTextEditorOptions.extensions);
  const state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON(draftDocument("existing draft")),
  });
  const next = state.apply(appendSelectionReference(state, value));
  expect(next.doc.childCount).toBe(2);
  expect(next.doc.child(1).type.name).toBe("fileReference");
  expect(next.doc.child(1).attrs).toMatchObject(value);

  const editor = new Editor({
    ...plainTextEditorOptions,
    element: null,
    content: next.doc.toJSON(),
  });
  try {
    const persisted = editor.getText({ blockSeparator: "\n" });
    expect(persisted).toBe(`existing draft\n${serializeReference(value)}`);
    expect(replaceDraftText(editor, persisted)).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe("fileReference");
    expect(editor.state.doc.child(1).attrs).toMatchObject(value);
    expect(editor.getText({ blockSeparator: "\n" })).toBe(persisted);
  } finally {
    editor.destroy();
  }
});

test("renders source lines while keeping mixed newline bytes in the frozen draft", () => {
  const raw = "BEGIN😀\r\nSECOND\rTHIRD\nEND";
  const selection = captureSelection(
    raw,
    { startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 4 },
    { path: "mixed.txt", source: "working tree", version: "sha256:raw" },
  );
  if (selection.kind !== "selection") throw Error("Fixture selection failed");
  const persisted = serializeReference(selection);
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: null,
    content: draftDocument(persisted),
  });
  try {
    const node = editor.state.doc.child(0);
    expect(node.type.spec.toDOM?.(node)).toContainEqual([
      "pre",
      {},
      "BEGIN😀\nSECOND\nTHIRD\nEND",
    ]);
    expect(node.attrs).toMatchObject(selection);
    expect(editor.getText({ blockSeparator: "\n" })).toBe(persisted);
    expect(replaceDraftText(editor, persisted)).toBe(true);
    expect(editor.state.doc.child(0).attrs.text).toBe(raw);
    expect(editor.getText({ blockSeparator: "\n" })).toBe(persisted);
  } finally {
    editor.destroy();
  }
});
