// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import {
  draftDocument,
  plainTextEditorOptions,
} from "../editor/plain-text-editor";
import {
  attachmentMention,
  insertAttachmentReference,
} from "./attachment-reference";

const firstId = "f9b0037d-1b8b-4f82-988c-7ca64f93fa37";
const secondId = "29fa6c62-5b41-43df-8138-a2822123257b";
const firstToken = `[[dpi-attachment:${firstId}]]`;
const secondToken = `[[dpi-attachment:${secondId}]]`;
it("detects the full @ query after the actual Composer paragraph split and replaces it without a trailing character", () => {
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(`first ${firstToken}`),
  });
  try {
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    // This is the same splitBlock registered for Composer Shift-Enter.
    expect(editor.commands.splitBlock()).toBe(true);
    editor.commands.insertContent("@fixture");
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(1).type.name).toBe("paragraph");
    const mention = attachmentMention(editor.state);
    expect(mention?.query).toBe("fixture");
    if (!mention) throw Error("missing mention");
    expect(mention.to).toBe(editor.state.doc.content.size - 1);
    expect(editor.state.doc.textBetween(mention.from, mention.to)).toBe(
      "@fixture",
    );
    editor.view.dispatch(
      insertAttachmentReference(
        editor.state,
        { id: secondId, name: "fixture.txt" },
        mention,
      ),
    );
    expect(editor.getText({ blockSeparator: "\n" })).toBe(
      `first ${firstToken}\n${secondToken}`,
    );
    expect(editor.state.doc.child(1).childCount).toBe(1);
    expect(editor.state.doc.child(1).firstChild?.isAtom).toBe(true);
  } finally {
    editor.destroy();
  }
});
it("uses document positions rather than serialized token lengths when an atom precedes the @ query in the same paragraph", () => {
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(`${firstToken} @fixture`),
  });
  try {
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const mention = attachmentMention(editor.state);
    expect(mention).toEqual({ from: 3, to: 11, query: "fixture" });
    if (!mention) throw Error("missing mention");
    editor.view.dispatch(
      insertAttachmentReference(
        editor.state,
        { id: secondId, name: "fixture.txt" },
        mention,
      ),
    );
    expect(editor.getText({ blockSeparator: "\n" })).toBe(
      `${firstToken} ${secondToken}`,
    );
    expect(editor.state.doc.firstChild?.child(2).isAtom).toBe(true);
  } finally {
    editor.destroy();
  }
});
