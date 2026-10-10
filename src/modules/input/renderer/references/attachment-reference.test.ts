import { Editor, getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { expect, it } from "vitest";
import {
  draftDocument,
  plainTextEditorOptions,
} from "../editor/plain-text-editor";
import {
  attachmentMention,
  insertAttachmentReference,
} from "./attachment-reference";

const id = "f9b0037d-1b8b-4f82-988c-7ca64f93fa37";
const token = `[[dpi-attachment:${id}]]`;
it("restores attachment tokens as atomic inline references without changing the saved draft", () => {
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: null,
    content: draftDocument(`before ${token} after`),
  });
  try {
    expect(editor.state.doc.firstChild?.child(1).type.name).toBe(
      "attachmentReference",
    );
    expect(editor.state.doc.firstChild?.child(1).isAtom).toBe(true);
    expect(editor.getText({ blockSeparator: "\n" })).toBe(
      `before ${token} after`,
    );
  } finally {
    editor.destroy();
  }
});
it("replaces only the active @ query, preserving a filename containing @ and the remaining draft", () => {
  const schema = getSchema(plainTextEditorOptions.extensions);
  const state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON(draftDocument("check @src/a@b.ts then")),
  });
  const positioned = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 18)),
  );
  const next = positioned.apply(
    insertAttachmentReference(
      positioned,
      { id, name: "src/a@b.ts" },
      { from: 7, to: 18 },
    ),
  );
  expect(next.doc.firstChild?.child(1).attrs.name).toBe("src/a@b.ts");
  expect(next.doc.firstChild?.textContent).toBe("check  then");
});
it("detects @ project paths with embedded @, but not email addresses or an IME selection", () => {
  const schema = getSchema(plainTextEditorOptions.extensions);
  const at = (text: string) => {
    const doc = schema.nodeFromJSON(draftDocument(text));
    return EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, text.length + 1),
    });
  };
  expect(attachmentMention(at("review @src/a@b.ts"))).toEqual({
    from: 8,
    to: 19,
    query: "src/a@b.ts",
  });
  expect(attachmentMention(at("person@example.com"))).toBeNull();
});

it("does not turn malformed reserved-looking text into a reference", () => {
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: null,
    content: draftDocument("[[dpi-attachment:not-an-id]]"),
  });
  try {
    expect(editor.state.doc.firstChild?.firstChild?.type.name).toBe("text");
    expect(editor.getText()).toBe("[[dpi-attachment:not-an-id]]");
  } finally {
    editor.destroy();
  }
});

it("starts the next @ query immediately after each accepted reference, without inserting draft spaces", () => {
  const schema = getSchema(plainTextEditorOptions.extensions);
  let state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON(draftDocument("@first")),
  });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 7)),
  );
  state = state.apply(
    insertAttachmentReference(
      state,
      { id, name: "first.ts" },
      { from: 1, to: 7 },
    ),
  );
  for (const [nextId, name] of [
    ["c7fd3f31-0f06-4c31-aef7-f7cdd3d39013", "second.ts"],
    ["daebf3c8-b8a6-4770-b8c0-e23b8e4cb42f", "third.ts"],
  ]) {
    state = state.apply(state.tr.insertText("@"));
    const trigger = attachmentMention(state);
    expect(trigger?.query).toBe("");
    expect(trigger?.from).toBe(state.selection.from - 1);
    if (!trigger) throw Error("next reference trigger missing");
    state = state.apply(
      insertAttachmentReference(state, { id: nextId!, name: name! }, trigger),
    );
  }
  expect(state.doc.firstChild?.childCount).toBe(3);
  expect(state.doc.firstChild?.textContent).toBe("");
});
