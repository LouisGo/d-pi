// @vitest-environment happy-dom
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
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
} from "../../src/modules/input/core/public";
import {
  createTrustedClipboard,
  DraftEditorCache,
  draftDocument,
  plainTextEditorOptions,
} from "../../src/modules/input/renderer/public";

it("does not hide failed clone cleanup after a new ordinary image enters the epoch", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "dpi-spec-clipboard-handoff-")),
  );
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  let editor: Editor | undefined,
    cache: DraftEditorCache | undefined,
    controller: DraftController | undefined,
    model: AttachmentModel | undefined,
    clipboard: ReturnType<typeof createTrustedClipboard> | undefined;
  try {
    const source = storage.drafts.create(root),
      target = storage.drafts.create(root);
    const items = [];
    for (let i = 0; i < 32; i++)
      items.push(
        await service.store.importBytes(source.threadId, {
          name: `${i}.png`,
          mimeType: "image/png",
          source: "paste",
          bytes: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
            "base64",
          ),
        }),
      );
    const original = items.map((i) => i.token).join(" ");
    storage.drafts.save(source.threadId, 0, original);
    const reserve = await service.execute(
      {
        kind: "clipboard-reserve",
        threadId: source.threadId,
        traceId: crypto.randomUUID(),
      },
      "source-doc",
    );
    if (reserve.kind !== "clipboard-tickets" || !reserve.tickets[0])
      throw Error("missing ticket");
    const ticket = reserve.tickets[0];
    expect(
      await service.execute(
        {
          kind: "clipboard-export",
          threadId: source.threadId,
          traceId: crypto.randomUUID(),
          ticket,
          text: original,
          ids: items.map((i) => i.id),
        },
        "source-doc",
      ),
    ).toMatchObject({ kind: "clipboard-exported" });
    let failRelease = true;
    const bridge: AttachmentBridge = {
      request: async (cmd) => {
        if (cmd.kind === "history-release" && failRelease)
          return { kind: "unavailable", reason: "storage-unavailable" };
        return service.execute(cmd, "target-doc");
      },
    };
    controller = new DraftController(
      storage.drafts.read(target.threadId),
      async (revision, text) => {
        const saved = storage.drafts.save(target.threadId, revision, text);
        if (saved === null) throw Error("conflict");
        return { kind: "saved", threadId: target.threadId, revision: saved };
      },
      () => ({
        errorId: crypto.randomUUID(),
        traceId: crypto.randomUUID(),
        code: "storage-unavailable",
        category: "storage",
        observedAt: "renderer",
        reportedBy: "app",
        attribution: "unknown",
        handlingOwner: "draft",
        recovery: "retry_safe",
        message: { code: "draft.storageUnavailable" },
      }),
    );
    cache = new DraftEditorCache(undefined, bridge);
    model = new AttachmentModel(bridge, target.threadId);
    const c = controller,
      d = cache;
    editor = new Editor({
      ...plainTextEditorOptions,
      element: document.createElement("div"),
      content: draftDocument(""),
      onBeforeCreate: ({ editor }) => {
        plainTextEditorOptions.onBeforeCreate({ editor });
        d.bind(editor, target.threadId, c);
      },
    });
    clipboard = createTrustedClipboard({
      bridge,
      model,
      isCurrent: () => true,
      sequence: () => c.getEditorSnapshot().sequence,
      onFeedback: () => {},
    });
    clipboard.bindEditor(editor);
    const event = {
      clipboardData: {
        types: [CLIPBOARD_MIME, "text/plain"],
        files: [],
        getData: (kind: string) =>
          kind === CLIPBOARD_MIME ? JSON.stringify(ticket) : "images",
      },
      preventDefault() {},
    } as unknown as ClipboardEvent;
    for (let i = 0; i < 4; i++) {
      expect(clipboard.paste(editor.view, event)).toBe(true);
      await clipboard.settled();
      expect(editor.getText()).toContain("[[dpi-attachment:");
      expect(editor.commands.undo()).toBe(true);
      expect(editor.getText()).toBe("");
      expect(await controller.flush()).toBe(true);
    }
    expect(storage.drafts.read(target.threadId).text).toBe("");
    expect(await cache.clearHistory(target.threadId)).toBe(false);
    expect(cache.historyState(target.threadId).failed).toBe(true);
    failRelease = false;
    const ordinary = await service.store.importBytes(target.threadId, {
      name: "ordinary.png",
      mimeType: "image/png",
      source: "file",
      bytes: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    editor.commands.insertContent(draftDocument(ordinary.token).content);
    const savedDespiteFailedCleanup = await controller.flush();
    expect(savedDespiteFailedCleanup).toBe(false);
    expect(cache.historyState(target.threadId).failed).toBe(true);
    expect(editor.can().redo()).toBe(false);
    const explicitRetry = await cache.retryHistory(target.threadId);
    expect(explicitRetry).toBe(true);
    expect(await controller.retry()).toBe(true);
    const saturated = await service.execute(
      {
        kind: "clipboard-import",
        threadId: target.threadId,
        traceId: crypto.randomUUID(),
        ticket,
      },
      "target-doc",
    );

    expect(saturated).toMatchObject({ kind: "clipboard-imported" });
    service.store.releaseEditorHistories("target-doc");
    const released = await service.execute(
      {
        kind: "clipboard-import",
        threadId: target.threadId,
        traceId: crypto.randomUUID(),
        ticket,
      },
      "target-doc",
    );

    expect(released).toMatchObject({ kind: "clipboard-imported" });
  } finally {
    clipboard?.dispose();
    editor?.destroy();
    cache?.dispose();
    controller?.dispose();
    model?.dispose();
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
