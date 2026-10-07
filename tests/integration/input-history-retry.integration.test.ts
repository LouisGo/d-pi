// @vitest-environment happy-dom
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createAttachmentReferences } from "../../src/app/main/wiring/attachment-service-references";
import { DraftController } from "../../src/modules/input/core/public";
import {
  AttachmentStore,
  EditorHistoryLimitError,
} from "../../src/modules/input/main/public";
import {
  DraftEditorCache,
  draftDocument,
  plainTextEditorOptions,
} from "../../src/modules/input/renderer/public";

it.each(["protected", "budget"] as const)(
  "keeps same-ID PDF retry assets and Undo under the %s policy",
  async (mode) => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "dpi-standards-pdf-")),
    );
    const storage = AppStorage.open(join(root, "app.sqlite"));
    let conversionFails = true;
    const store = new AttachmentStore({
      directory: join(root, "content"),
      database: storage.database,
      ...(mode === "budget"
        ? { editorHistoryLimits: { epochs: 9, ids: 128, bytes: 20 } }
        : {}),
      lifecycle: createAttachmentReferences(storage, (threadId, id) =>
        store.referenceSource(threadId, id),
      ),
      convertPdf: async () => {
        if (conversionFails) throw Error("temporary converter failure");
        return {
          text: "successful extracted PDF text",
          pageCount: 1,
          pagesNeedingOcr: [],
          hasVisualContent: false,
          converterVersion: "fixture-v1",
        };
      },
    });
    let editor: Editor | undefined,
      controller: DraftController | undefined,
      cache: DraftEditorCache | undefined;
    try {
      const draft = storage.drafts.create(root);
      const item = await store.importBytes(draft.threadId, {
        name: "retry.pdf",
        mimeType: "application/pdf",
        bytes: new TextEncoder().encode("%PDF-1.7\nfixture"),
        source: "paste",
      });
      expect(item.status).toBe("failed");
      storage.drafts.save(draft.threadId, 0, item.token);
      controller = new DraftController(
        storage.drafts.read(draft.threadId),
        async (revision, text) => {
          const saved = storage.drafts.save(draft.threadId, revision, text);
          if (saved === null) throw Error("conflict");
          return { kind: "saved", threadId: draft.threadId, revision: saved };
        },
        () => {
          throw Error("unexpected transport error");
        },
      );
      cache = new DraftEditorCache(undefined, {
        request: async (command) => {
          if (command.kind === "history-open")
            return store.openEditorHistory(
              "document",
              command.threadId,
              command.epoch,
            );
          if (command.kind === "history-update")
            return store.updateEditorHistory(
              "document",
              command.threadId,
              command.leaseId,
              command.version,
              command.ids,
            );
          if (command.kind === "history-release")
            return store.releaseEditorHistory(
              "document",
              command.threadId,
              command.leaseId,
              command.releaseIds,
              command.retainIds,
            );
          throw Error("unexpected request");
        },
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
      // A normal text edit enters this existing attachment ID into the epoch before retry.
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.commands.insertContent(" note");
      expect(await controller.flush()).toBe(true);
      conversionFails = false;
      if (mode === "budget") {
        const before = storage.database.connection
          .prepare("SELECT payload FROM input_attachment WHERE id=?")
          .get(item.id)?.payload;
        const body = editor.getText();
        expect(editor.can().undo()).toBe(true);
        await expect(
          store.retry(draft.threadId, item.id),
        ).rejects.toBeInstanceOf(EditorHistoryLimitError);
        expect(
          storage.database.connection
            .prepare("SELECT payload FROM input_attachment WHERE id=?")
            .get(item.id)?.payload,
        ).toBe(before);
        expect(
          store.referenceSource(draft.threadId, item.id)?.derivedDigest,
        ).toBeUndefined();
        expect(editor.getText()).toBe(body);
        expect(editor.can().undo()).toBe(true);
        // Clearing Undo is an explicit user recovery, never an automatic retry step.
        expect(await cache.clearHistory(draft.threadId)).toBe(true);
        expect(editor.getText()).toBe(body);
        expect(editor.can().undo()).toBe(false);
        expect((await store.retry(draft.threadId, item.id))?.status).toBe(
          "ready",
        );
        expect(await store.prepare(draft.threadId, body)).toMatchObject({
          ok: true,
        });
        return;
      }
      const retried = await store.retry(draft.threadId, item.id);
      expect(retried?.status).toBe("ready");
      editor.commands.selectAll();
      editor.commands.deleteSelection();
      expect(await controller.flush()).toBe(true);
      const cleanup = await store.cleanStorage(draft.threadId);
      expect(editor.commands.undo()).toBe(true);
      expect(editor.getText()).toContain(item.token);
      const prepared = await store.prepare(draft.threadId, editor.getText());
      expect(cleanup.deletedObjects).toBe(0);
      expect(prepared).toMatchObject({ ok: true });
    } finally {
      editor?.destroy();
      cache?.dispose();
      controller?.dispose();
      await store.close();
      storage.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
