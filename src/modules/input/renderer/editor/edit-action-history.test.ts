// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import { textPasteTransaction } from "../clipboard/plain-text-paste";
import { draftDocument, plainTextEditorOptions } from "./plain-text-editor";

it("undoes insert, paste, subsequent typing and deletion as distinct user actions without timing dependence", () => {
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(""),
  });
  try {
    editor.view.dispatch(
      editor.state.tr.insertText("one").setMeta("inputType", "insertText"),
    );
    editor.view.dispatch(textPasteTransaction(editor.state, "two"));
    editor.view.dispatch(
      editor.state.tr.insertText("three").setMeta("inputType", "insertText"),
    );
    editor.view.dispatch(
      editor.state.tr
        .delete(1, 2)
        .setMeta("inputType", "deleteContentBackward"),
    );
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("onetwothree");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("onetwo");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("one");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("");
  } finally {
    editor.destroy();
  }
});

it("keeps IME replacement in one input group and ignores attachment label metadata for grouping", () => {
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(""),
  });
  try {
    editor.view.dispatch(
      editor.state.tr
        .insertText("n")
        .setMeta("inputType", "insertCompositionText"),
    );
    editor.view.dispatch(
      editor.state.tr
        .insertText("你", 1, 2)
        .setMeta("inputType", "insertCompositionText"),
    );
    editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
    editor.view.dispatch(
      editor.state.tr.insertText("好").setMeta("inputType", "insertText"),
    );
    expect(editor.getText()).toBe("你好");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("");
  } finally {
    editor.destroy();
  }
});
