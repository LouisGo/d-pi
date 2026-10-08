// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, expect, it } from "vitest";
import { AttachmentSchema } from "../../contracts/public";
import {
  draftDocument,
  plainTextEditorOptions,
} from "../editor/plain-text-editor";
import { syncAttachmentLabels } from "./attachment-editor";
import { navigateReference, selectedReference } from "./reference-interaction";

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
function fixture(source: "file" | "reference", frozen = false) {
  const id = crypto.randomUUID();
  const item = AttachmentSchema.parse({
    schemaVersion: 1,
    id,
    threadId: crypto.randomUUID(),
    name: "runtime-service.ts",
    path: "src/runtime-service.ts",
    token: `[[dpi-attachment:${id}]]`,
    mimeType: "text/plain",
    byteLength: 20,
    inputDigest: "a".repeat(64),
    capturedAt: new Date().toISOString(),
    source,
    referenceKind: source === "reference" || frozen ? "file" : undefined,
    status: "ready",
    representation: source === "reference" ? "reference" : "text",
    coverageGaps: [],
    textOnly: false,
    ...(frozen
      ? {
          frozenReference: {
            projectPath: "/fixture",
            path: "src/runtime-service.ts",
            kind: "file",
            version: "v1",
            capturedAt: new Date().toISOString(),
          },
        }
      : {}),
  });
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(`a${item.token}b`),
  });
  editors.push(editor);
  syncAttachmentLabels(editor, [item]);
  return {
    editor,
    item,
    element: editor.view.dom.querySelector<HTMLElement>("[data-attachment-id]"),
  };
}
it.each([false, true])(
  "presents live or frozen project context only as an inline file chip (frozen=%s)",
  (frozen) => {
    const { editor, item, element } = fixture(
      frozen ? "file" : "reference",
      frozen,
    );
    expect(element?.dataset.contextKind).toBe("project");
    expect(element?.hidden).toBe(false);
    expect(element?.textContent).toBe("TSruntime-service.ts");
    expect(editor.getText()).toBe(`a${item.token}b`);
  },
);
it("keeps the adopted external attachment anchor immutable without duplicating its rail label in the body", () => {
  const { editor, item, element } = fixture("file");
  expect(element?.hidden).toBe(true);
  expect(element?.dataset.contextKind).toBe("external");
  expect(editor.getText()).toBe(`a${item.token}b`);
  expect(editor.state.doc.firstChild?.child(1).isAtom).toBe(true);
});
it("crosses the external attachment anchor without selecting an invisible chip", () => {
  const { editor } = fixture("file");
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)),
  );
  expect(
    navigateReference(
      editor,
      new KeyboardEvent("keydown", { key: "ArrowRight" }),
    ),
  ).toBe(true);
  expect(selectedReference(editor)).toBeNull();
  expect(editor.state.selection.head).toBe(3);
  expect(editor.state.selection.empty).toBe(true);
});
it.each([
  { key: "ArrowRight", start: 2, end: 5 },
  { key: "ArrowLeft", start: 5, end: 2 },
])(
  "crosses a whole consecutive external batch with one $key and preserves Shift's anchor",
  ({ key, start, end }) => {
    const { editor, item } = fixture("file");
    const items = [
      item,
      { ...item, id: crypto.randomUUID() },
      { ...item, id: crypto.randomUUID() },
    ];
    editor.commands.setContent(
      draftDocument(
        `a${items.map((entry) => `[[dpi-attachment:${entry.id}]]`).join("")}b`,
      ),
    );
    syncAttachmentLabels(editor, items);
    for (const shiftKey of [false, true]) {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, start),
        ),
      );
      expect(
        navigateReference(
          editor,
          new KeyboardEvent("keydown", { key, shiftKey }),
        ),
      ).toBe(true);
      expect(editor.state.selection.head).toBe(end);
      expect(editor.state.selection.anchor).toBe(shiftKey ? start : end);
    }
  },
);
