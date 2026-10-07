// @vitest-environment happy-dom
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createAttachmentService } from "../../src/app/main/wiring/attachment-service";
import {
  type AttachmentBridge,
  CLIPBOARD_MIME,
} from "../../src/modules/input/contracts/public";
import {
  AttachmentModel,
  DraftController,
  serializeReference,
} from "../../src/modules/input/core/public";
import {
  createTrustedClipboard,
  DraftEditorCache,
  draftDocument,
  plainTextEditorOptions,
} from "../../src/modules/input/renderer/public";

it("hands an actual cut image/frozen selection across Main into one target transaction and preserves Undo through save and GC", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "dpi-clipboard-pm-main-")),
  );
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  const editors: Editor[] = [],
    controllers: DraftController[] = [],
    caches: DraftEditorCache[] = [],
    models: AttachmentModel[] = [],
    clipboards: ReturnType<typeof createTrustedClipboard>[] = [];
  try {
    const source = storage.drafts.create(root),
      target = storage.drafts.create(root);
    const image = await service.store.importBytes(source.threadId, {
      name: "private.png",
      mimeType: "image/png",
      source: "paste",
      bytes: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    const frozen = serializeReference({
      kind: "selection",
      path: "src/a.ts",
      source: "fixed-source",
      version: "v1",
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 7,
      text: "frozen",
    });
    const original = `selected ${image.token}\n${frozen}\ntail`;
    storage.drafts.save(source.threadId, 0, original);
    const mount = (threadId: typeof source.threadId, owner: string) => {
      const bridge: AttachmentBridge = {
        request: (command) => service.execute(command, owner),
      };
      const controller = new DraftController(
        storage.drafts.read(threadId),
        async (revision, text) => {
          const saved = storage.drafts.save(threadId, revision, text);
          if (saved === null) throw Error("conflict");
          return { kind: "saved", threadId, revision: saved };
        },
        () => {
          throw Error("transport");
        },
      );
      const cache = new DraftEditorCache(undefined, bridge);
      const model = new AttachmentModel(bridge, threadId);
      const editor = new Editor({
        ...plainTextEditorOptions,
        element: document.createElement("div"),
        content: draftDocument(controller.getTextSnapshot()),
        onBeforeCreate: ({ editor }) => {
          plainTextEditorOptions.onBeforeCreate({ editor });
          cache.bind(editor, threadId, controller);
        },
      });
      const clipboard = createTrustedClipboard({
        bridge,
        model,
        sequence: () => controller.getEditorSnapshot().sequence,
        isCurrent: () => true,
        onFeedback: () => {},
      });
      clipboard.bindEditor(editor);
      editors.push(editor);
      controllers.push(controller);
      caches.push(cache);
      models.push(model);
      clipboards.push(clipboard);
      return { editor, controller, clipboard };
    };
    const from = mount(source.threadId, "source-document"),
      to = mount(target.threadId, "target-document");
    await from.clipboard.warm();
    const data = new Map<string, string>();
    const event = {
      clipboardData: {
        types: ["text/plain", CLIPBOARD_MIME],
        files: [],
        getData: (type: string) => data.get(type) ?? "",
        setData: (type: string, value: string) => data.set(type, value),
      },
      preventDefault() {},
    } as unknown as ClipboardEvent;
    from.editor.commands.selectAll();
    expect(from.clipboard.copy(from.editor.view, event, true)).toBe(true);
    expect(from.editor.getText()).toBe("");
    expect(to.clipboard.paste(to.editor.view, event)).toBe(true);
    await to.clipboard.settled();
    const targetText = to.editor.getText({ blockSeparator: "\n" });
    expect(targetText).toContain(frozen);
    expect(targetText).not.toContain(image.id);
    expect(await from.controller.flush()).toBe(true);
    expect(await to.controller.flush()).toBe(true);
    expect(to.editor.commands.undo()).toBe(true);
    expect(to.editor.getText()).toBe("");
    expect(await to.controller.flush()).toBe(true);
    service.store.releaseEditorHistories("source-document");
    await service.store.cleanStorage(target.threadId);
    expect(
      existsSync(
        join(root, "content", "objects", image.inputDigest ?? "missing"),
      ),
    ).toBe(true);
    expect(to.editor.commands.redo()).toBe(true);
    expect(to.editor.getText({ blockSeparator: "\n" })).toBe(targetText);
    const prepared = await service.store.prepare(target.threadId, targetText);
    expect(prepared).toMatchObject({ ok: true });
    if (prepared.ok) expect(prepared.content.images).toHaveLength(1);
  } finally {
    for (const clipboard of clipboards) clipboard.dispose();
    for (const editor of editors) editor.destroy();
    for (const cache of caches) cache.dispose();
    for (const controller of controllers) controller.dispose();
    for (const model of models) model.dispose();
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
