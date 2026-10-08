// @vitest-environment happy-dom
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Editor } from "@tiptap/core";
import { expect, it, vi } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createAttachmentService } from "../../src/app/main/wiring/attachment-service";
import { createAttachmentBridge } from "../../src/app/preload/bridges/attachments";
import {
  type AttachmentBridge,
  AttachmentRequestSchema,
  CLIPBOARD_MIME,
} from "../../src/modules/input/contracts/public";
import {
  AttachmentModel,
  attachmentToken,
  DraftController,
  EditorHistoryModel,
} from "../../src/modules/input/core/public";
import {
  createTrustedClipboard,
  DraftEditorCache,
  draftDocument,
  plainTextEditorOptions,
} from "../../src/modules/input/renderer/public";
import { DRAFT_MAX_BYTES, draftByteLength } from "../../src/shared/draft-text";
import { ThreadIdSchema } from "../../src/shared/identity";

// This fixture verifies adoption/history/GC; real codec coverage uses its
// dedicated binary worker tests with the fixed Bun runtime.
vi.mock("../../src/platform/node/images/public", () => ({
  createImageCompressor:
    () =>
    async (
      bytes: Uint8Array,
      mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif",
    ) => ({
      ok: true,
      bytes,
      mimeType,
      recompressed: false,
      width: 1,
      height: 1,
      originalWidth: 1,
      originalHeight: 1,
    }),
}));

it("reclaims fully abandoned clipboard handoffs after real paste/Undo/save and explicit epoch clear", async () => {
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
    const bridge: AttachmentBridge = createAttachmentBridge({
      invoke: async (_channel, raw: unknown) =>
        service.execute(AttachmentRequestSchema.parse(raw), "target-doc"),
    }).attachments;
    controller = new DraftController(
      storage.drafts.read(target.threadId),
      async (revision, text) => {
        const saved = storage.drafts.save(target.threadId, revision, text);
        if (saved === null) throw Error("conflict");
        return { kind: "saved", threadId: target.threadId, revision: saved };
      },
      () => {
        throw Error("transport");
      },
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
    expect(await cache.clearHistory(target.threadId)).toBe(true);
    expect(editor.can().redo()).toBe(false);
    expect(clipboard.paste(editor.view, event)).toBe(true);
    await clipboard.settled();
    expect(editor.getText().match(/\[\[dpi-attachment:/g)).toHaveLength(32);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("");
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

async function handoffFixture(
  threads = 8,
  failUpdates = false,
  textFile = false,
) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "dpi-clipboard-ownership-")),
  );
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  const source = storage.drafts.create(root),
    target = storage.drafts.create(root);
  const item = await service.store.importBytes(source.threadId, {
    name: textFile ? "context.txt" : "image.png",
    mimeType: textFile ? "text/plain" : "image/png",
    source: "paste",
    bytes: textFile
      ? Buffer.from("clipboard history resource")
      : Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
          "base64",
        ),
  });
  storage.drafts.save(source.threadId, 0, item.token);
  const reserved = await service.execute(
    {
      kind: "clipboard-reserve",
      threadId: source.threadId,
      traceId: crypto.randomUUID(),
    },
    "source-doc",
  );
  if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
    throw Error("ticket");
  const ticket = reserved.tickets[0];
  expect(
    await service.execute(
      {
        kind: "clipboard-export",
        threadId: source.threadId,
        traceId: crypto.randomUUID(),
        ticket,
        text: item.token,
        ids: [item.id],
      },
      "source-doc",
    ),
  ).toMatchObject({ kind: "clipboard-exported" });
  let released: () => void = () => {};
  const releaseDone = new Promise<void>((resolve) => {
    released = resolve;
  });
  const bridge: AttachmentBridge = createAttachmentBridge({
    invoke: async (_channel, raw: unknown) => {
      const cmd = AttachmentRequestSchema.parse(raw);
      if (failUpdates && cmd.kind === "history-update")
        return { kind: "unavailable", reason: "storage-unavailable" };
      const result = await service.execute(cmd, "target-doc");
      if (cmd.kind === "history-release") released();
      return result;
    },
  }).attachments;
  const controller = new DraftController(
    storage.drafts.read(target.threadId),
    async (revision, text) => {
      const saved = storage.drafts.save(target.threadId, revision, text);
      if (saved === null) throw Error("conflict");
      return { kind: "saved", threadId: target.threadId, revision: saved };
    },
    () => {
      throw Error("transport");
    },
  );
  const cache = new DraftEditorCache(
    { threads, documentBytes: 4 * 1024 * 1024 },
    bridge,
  );
  const model = new AttachmentModel(bridge, target.threadId);
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(""),
    onBeforeCreate: ({ editor }) => {
      plainTextEditorOptions.onBeforeCreate({ editor });
      cache.bind(editor, target.threadId, controller);
    },
  });
  const clipboard = createTrustedClipboard({
    bridge,
    model,
    isCurrent: () => true,
    sequence: () => controller.getEditorSnapshot().sequence,
    onFeedback: () => {},
  });
  clipboard.bindEditor(editor);
  const event = {
    clipboardData: {
      types: [CLIPBOARD_MIME, "text/plain"],
      files: [],
      getData: (kind: string) =>
        kind === CLIPBOARD_MIME ? JSON.stringify(ticket) : "image",
    },
    preventDefault() {},
  } as unknown as ClipboardEvent;
  expect(clipboard.paste(editor.view, event)).toBe(true);
  await clipboard.settled();
  await cache.retryHistory(target.threadId);
  const clone = (await service.store.list(target.threadId))[0];
  if (!clone) throw Error("clone");
  // Remove every source authority; target clone/epoch are now the only owners.
  storage.drafts.save(source.threadId, 1, "");
  service.store.releaseEditorHistories("source-doc");
  const object = join(
    root,
    "content",
    "objects",
    item.inputDigest ?? "missing",
  );
  return {
    storage,
    service,
    source,
    target,
    controller,
    cache,
    model,
    editor,
    clipboard,
    clone,
    object,
    releaseDone,
    async close() {
      clipboard.dispose();
      editor.destroy();
      cache.dispose();
      controller.dispose();
      model.dispose();
      await service.close();
      storage.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

it("keeps a never-saved clone through Undo/GC/Redo, then reclaims its handoff and object after clear", async () => {
  const f = await handoffFixture();
  try {
    expect(f.storage.drafts.read(f.target.threadId).text).toBe("");
    const text = f.editor.getText();
    expect(f.editor.commands.undo()).toBe(true);
    await f.cache.retryHistory(f.target.threadId);
    expect(f.editor.can().redo()).toBe(true);
    expect(
      (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
    ).toBe(0);
    expect(existsSync(f.object)).toBe(true);
    expect(f.editor.commands.redo()).toBe(true);
    expect(f.editor.getText()).toBe(text);
    expect(
      await f.service.store.preview(f.target.threadId, f.clone.id),
    ).toMatchObject({ kind: "image" });
    expect(f.editor.commands.undo()).toBe(true);
    expect(await f.controller.flush()).toBe(true);
    expect(await f.cache.clearHistory(f.target.threadId)).toBe(true);
    expect(f.editor.can().redo()).toBe(false);
    expect(
      (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
    ).toBe(1);
    expect(existsSync(f.object)).toBe(false);
  } finally {
    await f.close();
  }
});

it("retains unsaved current-body import pins across multiple clears, then releases when that body is abandoned", async () => {
  const f = await handoffFixture();
  try {
    expect(await f.cache.clearHistory(f.target.threadId)).toBe(true);
    expect(await f.cache.clearHistory(f.target.threadId)).toBe(true);
    expect(f.storage.drafts.read(f.target.threadId).text).toBe("");
    expect(
      (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
    ).toBe(0);
    expect(existsSync(f.object)).toBe(true);
    expect(
      await f.service.store.preview(f.target.threadId, f.clone.id),
    ).toMatchObject({ kind: "image" });
    f.editor.commands.clearContent();
    expect(await f.controller.flush()).toBe(true);
    expect(await f.cache.clearHistory(f.target.threadId)).toBe(true);
    expect(
      (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
    ).toBe(1);
  } finally {
    await f.close();
  }
});

it.each(["", "[[dpi-attachment:broken]] "])(
  "cache eviction preserves a never-saved clone with adjacent literal %j",
  async (literal) => {
    const f = await handoffFixture(0);
    try {
      if (literal) {
        f.editor.commands.setTextSelection(1);
        f.editor.commands.insertContent(literal);
        await f.cache.retryHistory(f.target.threadId);
      }
      f.editor.destroy();
      await f.releaseDone;
      expect(f.controller.getTextSnapshot()).toBe(literal + f.clone.token);
      expect(f.storage.drafts.read(f.target.threadId).text).toBe("");
      expect(
        (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
      ).toBe(0);
      expect(
        await f.service.store.preview(f.target.threadId, f.clone.id),
      ).toMatchObject({ kind: "image" });
      f.service.store.releaseEditorHistories("target-doc");
      expect(
        (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
      ).toBe(1);
    } finally {
      await f.close();
    }
  },
);

it("keeps clones in another live epoch and rejects foreign release before exact last-epoch cleanup", async () => {
  // Only non-image files belong to the PM history lease.
  const f = await handoffFixture(8, false, true);
  try {
    const opened = await f.service.execute(
      {
        kind: "history-open",
        threadId: f.target.threadId,
        traceId: crypto.randomUUID(),
        epoch: crypto.randomUUID(),
      },
      "target-doc",
    );
    if (opened.kind !== "history-lease") throw Error("epoch");
    expect(
      await f.service.execute(
        {
          kind: "history-update",
          threadId: f.target.threadId,
          traceId: crypto.randomUUID(),
          leaseId: opened.leaseId,
          version: 1,
          ids: [f.clone.id],
        },
        "target-doc",
      ),
    ).toMatchObject({ kind: "history-lease" });
    expect(f.editor.commands.undo()).toBe(true);
    await f.controller.flush();
    expect(await f.cache.clearHistory(f.target.threadId)).toBe(true);
    expect(
      (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
    ).toBe(0);
    expect(
      await f.service.execute(
        {
          kind: "history-release",
          threadId: f.target.threadId,
          traceId: crypto.randomUUID(),
          leaseId: opened.leaseId,
          releaseIds: [f.clone.id],
          retainIds: [],
        },
        "foreign-doc",
      ),
    ).toMatchObject({ kind: "unavailable", reason: "reference-denied" });
    expect(
      (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
    ).toBe(0);
    expect(
      await f.service.execute(
        {
          kind: "history-release",
          threadId: f.target.threadId,
          traceId: crypto.randomUUID(),
          leaseId: opened.leaseId,
          releaseIds: [],
          retainIds: [],
        },
        "target-doc",
      ),
    ).toMatchObject({ kind: "history-released" });
    expect(
      (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
    ).toBe(1);
  } finally {
    await f.close();
  }
});

it("reclaims abandoned candidates even when their history update was never acknowledged", async () => {
  const f = await handoffFixture(8, true);
  try {
    expect(f.cache.historyState(f.target.threadId).failed).toBe(true);
    expect(f.editor.commands.undo()).toBe(true);
    expect(await f.cache.clearHistory(f.target.threadId)).toBe(true);
    expect(
      (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
    ).toBe(1);
    expect(existsSync(f.object)).toBe(false);
  } finally {
    await f.close();
  }
});

it("recovers cumulative candidates from two valid bodies through bounded actual preload requests after a failed release", async () => {
  const ids = (start: number) =>
    Array.from(
      { length: 40001 },
      (_, i) =>
        `00000000-0000-4000-8000-${String(start + i).padStart(12, "0")}`,
    );
  const first = ids(0),
    second = ids(40001);
  for (const body of [first, second])
    expect(draftByteLength(body.map(attachmentToken).join(" "))).toBeLessThan(
      DRAFT_MAX_BYTES,
    );
  let fail = true;
  const released: string[][] = [];
  const bridge = createAttachmentBridge({
    invoke: async (_channel, raw: unknown) => {
      const command = AttachmentRequestSchema.parse(raw);
      if (command.kind !== "history-release")
        throw Error("only cleanup is required");
      if (fail) return { kind: "unavailable", reason: "storage-unavailable" };
      expect(command.releaseIds?.length).toBeLessThanOrEqual(80000);
      if (!command.retainIds?.length) released.push(command.releaseIds ?? []);
      return { kind: "history-released" };
    },
  }).attachments;
  const model = new EditorHistoryModel(
    bridge,
    ThreadIdSchema.parse(crypto.randomUUID()),
    () => {},
  );
  model.reset(first);
  expect(await model.ensure()).toBe(false);
  fail = false;
  model.reset(second);
  model.reset();
  expect(await model.ensure()).toBe(true);
  expect(released.map((chunk) => chunk.length)).toEqual([80000, 2]);
  expect(new Set(released.flat())).toEqual(new Set([...first, ...second]));
  model.dispose();
});
