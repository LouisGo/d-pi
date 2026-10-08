// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, expect, it } from "vitest";
import { AttachmentSchema } from "../../contracts/public";
import {
  draftDocument,
  plainTextEditorOptions,
  replaceDraftText,
} from "../editor/plain-text-editor";
import { createAttachmentEditor } from "./attachment-editor";
import {
  captureReferenceFocus,
  navigateReference,
  selectedReference,
} from "./reference-interaction";
import { trackReferenceRange } from "./suggestion-controller";

const id = "f9b0037d-1b8b-4f82-988c-7ca64f93fa37";
const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
});
function make(text: string) {
  const e = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(text),
  });
  editors.push(e);
  return e;
}
it("selects and crosses a whole atom with arrows, preserving reverse Shift selection", () => {
  const e = make(`a[[dpi-attachment:${id}]]b`);
  e.view.dispatch(
    e.state.tr.setSelection(TextSelection.create(e.state.doc, 2)),
  );
  expect(
    navigateReference(e, new KeyboardEvent("keydown", { key: "ArrowRight" })),
  ).toBe(true);
  expect(selectedReference(e)).toBe(id);
  navigateReference(e, new KeyboardEvent("keydown", { key: "ArrowRight" }));
  expect(e.state.selection.head).toBe(3);
  navigateReference(
    e,
    new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true }),
  );
  expect(e.state.selection.anchor).toBe(3);
  expect(e.state.selection.head).toBe(2);
});
it("maps detail focus across ordinary edits but revokes it after replacement or Thread change", () => {
  const e = make("abc");
  e.view.dispatch(
    e.state.tr.setSelection(TextSelection.create(e.state.doc, 3)),
  );
  const restore = captureReferenceFocus(e, () => true);
  e.view.dispatch(e.state.tr.insertText("X", 1));
  restore(true);
  expect(e.state.selection.head).toBe(4);
  const stale = captureReferenceFocus(e, () => true);
  replaceDraftText(e, "new");
  e.view.dispatch(
    e.state.tr.setSelection(TextSelection.create(e.state.doc, 1)),
  );
  stale(true);
  expect(e.state.selection.head).toBe(1);
  let current = true;
  const old = captureReferenceFocus(e, () => current);
  current = false;
  e.view.dispatch(
    e.state.tr.setSelection(TextSelection.create(e.state.doc, 2)),
  );
  old(true);
  expect(e.state.selection.head).toBe(2);
});
it("refuses late @foo confirmation over an equal-length @bar query", () => {
  const e = make("@foo");
  e.view.dispatch(
    e.state.tr.setSelection(TextSelection.create(e.state.doc, 5)),
  );
  const port = createAttachmentEditor(e, () => true);
  e.view.dispatch(e.state.tr.insertText("bar", 2, 5));
  expect(
    port.insert(
      AttachmentSchema.parse({
        schemaVersion: 1,
        id,
        name: "foo",
        path: "foo",
        threadId: crypto.randomUUID(),
        token: `[[dpi-attachment:${id}]]`,
        mimeType: "text/plain",
        byteLength: 1,
        capturedAt: new Date().toISOString(),
        source: "reference",
        referenceKind: "file",
        status: "ready",
        representation: "reference",
        coverageGaps: [],
        textOnly: false,
      }),
      {
        from: 1,
        to: 5,
        expectedSource: "@foo",
      },
    ),
  ).toBe(false);
  expect(e.getText()).toBe("@bar");
});

it("retains text typed at the query boundary while an accepted reference is prepared", () => {
  const e = make("@foo");
  e.view.dispatch(
    e.state.tr.setSelection(TextSelection.create(e.state.doc, 5)),
  );
  const target = trackReferenceRange(e, {
    from: 1,
    to: 5,
    query: "foo",
    expectedSource: "@foo",
  });
  e.view.dispatch(e.state.tr.insertText(" B", 5));
  const item = AttachmentSchema.parse({
    schemaVersion: 1,
    id,
    threadId: crypto.randomUUID(),
    token: `[[dpi-attachment:${id}]]`,
    name: "foo",
    path: "foo",
    mimeType: "",
    byteLength: 0,
    capturedAt: new Date().toISOString(),
    source: "reference",
    status: "ready",
    representation: "reference",
    coverageGaps: [],
    textOnly: false,
  });
  expect(createAttachmentEditor(e, () => true).insert(item, target.range)).toBe(
    true,
  );
  expect(e.getText()).toBe(`[[dpi-attachment:${id}]] B`);
  target.release();
});
