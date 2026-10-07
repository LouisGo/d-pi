// @vitest-environment happy-dom
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createAttachmentService } from "../../src/app/main/wiring/attachment-service";
import { DraftController } from "../../src/modules/input/core/public";
import {
  DraftEditorCache,
  draftDocument,
  plainTextEditorOptions,
  replaceDraftText,
} from "../../src/modules/input/renderer/public";

it("keeps a real imported original sendable through remove→SQLite save→Main clean→Undo, then releases it when history is cleared", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-history-editor-")));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  let editor: Editor | undefined;
  let cache: DraftEditorCache | undefined;
  let controller: DraftController | undefined;
  try {
    const draft = storage.drafts.create(root);
    const item = await service.store.importBytes(draft.threadId, {
      name: "input.txt",
      mimeType: "text/plain",
      bytes: new TextEncoder().encode("actual original"),
      source: "paste",
    });
    storage.drafts.save(draft.threadId, 0, item.token);
    controller = new DraftController(
      storage.drafts.read(draft.threadId),
      async (revision, text) => {
        const saved = storage.drafts.save(draft.threadId, revision, text);
        if (saved === null) throw Error("unexpected conflict");
        return { kind: "saved", threadId: draft.threadId, revision: saved };
      },
      () => {
        throw Error("unexpected transport error");
      },
    );
    cache = new DraftEditorCache(undefined, {
      request: (command) => service.execute(command, "test-document"),
    });
    const model = controller,
      editors = cache;
    editor = new Editor({
      ...plainTextEditorOptions,
      element: document.createElement("div"),
      content: draftDocument(model.getTextSnapshot()),
      onBeforeCreate: ({ editor }) => {
        plainTextEditorOptions.onBeforeCreate({ editor });
        editors.bind(editor, draft.threadId, model);
      },
    });
    editor.commands.selectAll();
    editor.commands.deleteSelection();
    expect(await controller.flush()).toBe(true);
    expect(storage.drafts.read(draft.threadId).text).toBe("");
    expect(
      (await service.store.cleanStorage(draft.threadId)).deletedObjects,
    ).toBe(0);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe(item.token);
    expect(await controller.flush()).toBe(true);
    // Check send preparation only after the final release proof: preparation
    // itself acquires a separate source pin, so it cannot prove lease release.
    editor.commands.selectAll();
    editor.commands.deleteSelection();
    expect(await controller.flush()).toBe(true);
    expect(replaceDraftText(editor, "")).toBe(true);
    await cache.retryHistory(draft.threadId);
    expect(editor.can().undo()).toBe(false);
    expect(
      (await service.store.cleanStorage(draft.threadId)).deletedObjects,
    ).toBe(1);
    expect(
      await service.store.prepare(draft.threadId, item.token),
    ).toMatchObject({ ok: false, reason: "content-missing" });
  } finally {
    editor?.destroy();
    cache?.dispose();
    controller?.dispose();
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
