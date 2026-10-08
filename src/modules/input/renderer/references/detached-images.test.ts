// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { redoDepth, undoDepth } from "@tiptap/pm/history";
import { afterEach, expect, it } from "vitest";
import { AttachmentSchema, DraftSchema } from "../../contracts/public";
import { DraftController } from "../../core/draft-controller";
import { DraftEditorCache } from "../editor/draft-editor-cache";
import { draftDocument, plainTextEditorOptions } from "../editor/plain-text-editor";
import { createAttachmentEditor, createAttachmentImportTarget } from "./attachment-editor";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
function fixture(text = "draft") {
  const draft = DraftSchema.parse({ schemaVersion: 1, revision: 0, text,
    threadId: crypto.randomUUID(), workingDirectoryId: crypto.randomUUID(), directory: "/fixture" });
  const saved: string[] = [];
  const controller = new DraftController(draft, async (revision, text) => {
    saved.push(text); return { kind: "saved", threadId: draft.threadId, revision: revision + 1 };
  }, () => { throw Error("unexpected save failure"); });
  const cache = new DraftEditorCache();
  function mount() {
    const element = document.createElement("div"); document.body.append(element);
    const editor = new Editor({ ...plainTextEditorOptions, element,
      content: draftDocument(controller.getEditorTextSnapshot?.() ?? controller.getTextSnapshot()),
      onBeforeCreate: ({ editor }) => { plainTextEditorOptions.onBeforeCreate({ editor }); cache.bind(editor, "fixture", controller); } });
    cleanups.push(() => { editor.destroy(); element.remove(); });
    return editor;
  }
  const item = (mimeType: string, name: string) => {
    const id = crypto.randomUUID();
    return AttachmentSchema.parse({ schemaVersion: 1, id, threadId: draft.threadId, token: `[[dpi-attachment:${id}]]`,
      name, mimeType, byteLength: 40, capturedAt: new Date().toISOString(), source: "file", status: "ready",
      representation: mimeType.startsWith("image/") ? "image" : "text", coverageGaps: [], textOnly: false, inputDigest: (name.startsWith("duplicate") ? "a" : "b").repeat(64) });
  };
  cleanups.push(() => { cache.dispose(); controller.dispose(); });
  return { controller, mount, item, saved };
}
it("image add/remove preserves the editor document, Undo depth and existing Redo branch", () => {
  const f = fixture(); const editor = f.mount();
  editor.commands.insertContent("A"); editor.commands.undo();
  const doc = editor.state.doc; const undo = undoDepth(editor.state); const redo = redoDepth(editor.state);
  const image = f.item("image/png", "image.png");
  expect(createAttachmentEditor(editor, () => true, { controller: f.controller }).insert(image)).toBe(true);
  expect(editor.state.doc).toBe(doc); expect(undoDepth(editor.state)).toBe(undo); expect(redoDepth(editor.state)).toBe(redo);
  expect(f.controller.getTextSnapshot()).toContain(image.token);
  expect(editor.commands.redo()).toBe(true); expect(f.controller.getTextSnapshot()).toContain(image.token);
  f.controller.removeDetachedAttachment(image.id);
  expect(editor.commands.undo()).toBe(true); expect(f.controller.getTextSnapshot()).not.toContain(image.token);
});
it("mixed batches Undo only inline files and preserve images through cache remount and persistence", async () => {
  const f = fixture(); const editor = f.mount();
  const image = f.item("image/png", "image.png"), file = f.item("text/plain", "note.txt");
  const target = createAttachmentImportTarget(editor, () => true, { controller: f.controller });
  expect(target.apply([image, file])).toBe(true);
  expect(editor.getText()).toContain(file.token); expect(editor.getText()).not.toContain(image.token);
  expect(editor.commands.undo()).toBe(true);
  expect(f.controller.getTextSnapshot()).toContain(image.token); expect(f.controller.getTextSnapshot()).not.toContain(file.token);
  await f.controller.flush(); expect(f.saved.at(-1)).toContain(image.token);
  editor.destroy(); const next = f.mount();
  expect(next.commands.redo()).toBe(true); expect(f.controller.getTextSnapshot()).toContain(file.token);
  expect(f.controller.getTextSnapshot()).toContain(image.token); expect(next.getText()).not.toContain(image.token);
});
it("deduplicates repeated ID and same captured source without consuming selected text or history", () => {
  const f = fixture(); const editor = f.mount(); const port = createAttachmentEditor(editor, () => true, { controller: f.controller });
  const file = f.item("text/plain", "duplicate.txt");
  expect(port.insert(file)).toBe(true);
  const depth = undoDepth(editor.state); editor.commands.setTextSelection({ from: 2, to: 4 });
  const doc = editor.state.doc;
  expect(port.insert(file)).toBe(true); expect(editor.state.doc).toBe(doc);
  const duplicateId = crypto.randomUUID();
  expect(port.insert({ ...file, id: duplicateId, token: `[[dpi-attachment:${duplicateId}]]` })).toBe(true);
  expect(editor.state.doc).toBe(doc); expect(undoDepth(editor.state)).toBe(depth);
});
