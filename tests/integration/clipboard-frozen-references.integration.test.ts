// @vitest-environment happy-dom

import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Editor } from "@tiptap/core";
import { expect, it, vi } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createAttachmentService } from "../../src/app/main/wiring/attachment-service";
import { createAttachmentReferences } from "../../src/app/main/wiring/attachment-service-references";
import { createAttachmentBridge } from "../../src/app/preload/bridges/attachments";
import { readProjectBytes } from "../../src/modules/files/main/public";
import { CLIPBOARD_MIME } from "../../src/modules/input/contracts/public";
import {
  AttachmentModel,
  DraftController,
} from "../../src/modules/input/core/public";
import { AttachmentStore } from "../../src/modules/input/main/public";
import {
  createTrustedClipboard,
  DraftEditorCache,
  draftDocument,
  plainTextEditorOptions,
} from "../../src/modules/input/renderer/public";

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

it("freezes selected source file and direct directory in Main, survives source deletion/target conflict, recopy and reopen", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "dpi-frozen-projects-")),
  );
  const sourceRoot = join(root, "source"),
    targetRoot = join(root, "target");
  for (const directory of [sourceRoot, targetRoot]) {
    mkdirSync(join(directory, "folder"), { recursive: true });
    writeFileSync(
      join(directory, "file.txt"),
      directory === sourceRoot ? "SOURCE ORIGINAL" : "TARGET CONFLICT",
    );
  }
  writeFileSync(
    join(sourceRoot, "folder", "original.txt"),
    "original child body",
  );
  const storage = AppStorage.open(join(root, "app.sqlite"));
  let service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  const bridge = (owner: string) =>
    createAttachmentBridge({
      invoke: async (_channel, command) => service.execute(command, owner),
    }).attachments;
  try {
    const source = storage.drafts.create(sourceRoot),
      target = storage.drafts.create(targetRoot);
    const file = await service.store.addReference(source.threadId, "file.txt");
    const folder = await service.store.addReference(
      source.threadId,
      "folder",
      "directory",
    );
    const excluded = await service.store.addReference(
      source.threadId,
      "not-selected.txt",
    );
    const body = `${file.token} ${folder.token}`;
    const reserved = await bridge("source-doc").request({
      traceId: randomUUID(),
      kind: "clipboard-reserve",
      threadId: source.threadId,
    });
    if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
      throw Error("reserve");
    expect(
      await bridge("source-doc").request({
        traceId: randomUUID(),
        kind: "clipboard-export",
        threadId: source.threadId,
        ticket: reserved.tickets[0],
        text: body,
        ids: [file.id, folder.id],
      }),
    ).toEqual({ kind: "clipboard-exported", degraded: false });
    writeFileSync(join(sourceRoot, "file.txt"), "SOURCE NEW");
    const dynamic = await service.store.prepare(source.threadId, file.token);
    expect(dynamic).toMatchObject({
      ok: true,
      content: { message: expect.stringContaining("SOURCE NEW") },
    });
    expect(
      (await service.store.list(source.threadId)).find(
        (item) => item.id === file.id,
      )?.representation,
    ).toBe("reference");
    rmSync(join(sourceRoot, "file.txt"));
    rmSync(join(sourceRoot, "folder", "original.txt"));
    writeFileSync(join(sourceRoot, "folder", "later.txt"), "later");
    const imported = await bridge("target-doc").request({
      traceId: randomUUID(),
      kind: "clipboard-import",
      threadId: target.threadId,
      ticket: reserved.tickets[0],
    });
    if (imported.kind !== "clipboard-imported")
      throw Error(JSON.stringify(imported));
    expect(imported.items).toHaveLength(2);
    expect(imported.text).not.toContain(file.id);
    expect(
      imported.items.every(
        (item) =>
          item.id !== excluded.id &&
          item.source === "paste" &&
          item.representation === "text",
      ),
    ).toBe(true);
    const frozenFile = imported.items.find(
      (item) => item.referenceKind === "file",
    );
    const frozenDirectory = imported.items.find(
      (item) => item.referenceKind === "directory",
    );
    if (!frozenFile || !frozenDirectory) throw Error("missing frozen item");
    expect(frozenFile.frozenReference).toMatchObject({
      projectPath: sourceRoot,
      path: "file.txt",
      kind: "file",
      version: expect.any(String),
      capturedAt: expect.any(String),
    });
    expect(await service.store.preview(target.threadId, frozenFile.id)).toEqual(
      { kind: "text", text: "SOURCE ORIGINAL" },
    );
    const directoryPreview = await service.store.preview(
      target.threadId,
      frozenDirectory.id,
    );
    expect(directoryPreview).toMatchObject({
      kind: "text",
      text: expect.stringContaining("original.txt"),
    });
    if (directoryPreview.kind === "text")
      expect(directoryPreview.text).not.toMatch(/later|original child body/);
    const prepared = await service.store.prepare(
      target.threadId,
      imported.text,
    );
    expect(prepared).toMatchObject({
      ok: true,
      content: {
        message: expect.stringContaining("SOURCE ORIGINAL"),
        sources: [
          expect.objectContaining({
            version: frozenFile.frozenReference?.version,
            frozenReference: frozenFile.frozenReference,
          }),
          expect.any(Object),
        ],
      },
    });
    const recopy = await bridge("target-doc").request({
      traceId: randomUUID(),
      kind: "clipboard-reserve",
      threadId: target.threadId,
    });
    if (recopy.kind !== "clipboard-tickets" || !recopy.tickets[0])
      throw Error("recopy reserve");
    expect(
      await bridge("target-doc").request({
        traceId: randomUUID(),
        kind: "clipboard-export",
        threadId: target.threadId,
        ticket: recopy.tickets[0],
        text: imported.text,
        ids: imported.items.map((item) => item.id),
      }),
    ).toMatchObject({ kind: "clipboard-exported", degraded: false });
    const again = await bridge("source-doc").request({
      traceId: randomUUID(),
      kind: "clipboard-import",
      threadId: source.threadId,
      ticket: recopy.tickets[0],
    });
    if (again.kind !== "clipboard-imported") throw Error("recopy import");
    expect(again.items[0]?.frozenReference).toEqual(
      imported.items[0]?.frozenReference,
    );
    storage.drafts.save(target.threadId, 0, imported.text);
    await service.close();
    service = createAttachmentService(
      storage,
      root,
      "unused",
      () => true,
      async () => null,
    );
    await service.store.cleanStorage(target.threadId);
    expect(
      await service.store.prepare(target.threadId, imported.text),
    ).toMatchObject({
      ok: true,
      content: { message: expect.stringContaining("SOURCE ORIGINAL") },
    });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("copies only the actual PM selection across two projects and pastes all frozen dependencies in one Undo action", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-frozen-pm-")));
  const a = join(root, "a"),
    b = join(root, "b");
  for (const directory of [a, b])
    mkdirSync(join(directory, "folder"), { recursive: true });
  writeFileSync(join(a, "file.txt"), "PM SOURCE");
  writeFileSync(join(b, "file.txt"), "TARGET WRONG");
  writeFileSync(join(a, "folder", "first.txt"), "not inlined");
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  const editors: Editor[] = [],
    caches: DraftEditorCache[] = [],
    controllers: DraftController[] = [],
    models: AttachmentModel[] = [];
  const adapters: ReturnType<typeof createTrustedClipboard>[] = [];
  let exportDone: Promise<unknown> = Promise.resolve();
  try {
    const source = storage.drafts.create(a),
      target = storage.drafts.create(b);
    const file = await service.store.addReference(source.threadId, "file.txt");
    const folder = await service.store.addReference(
      source.threadId,
      "folder",
      "directory",
    );
    writeFileSync(
      join(a, "pixel.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const image = await service.store.addReference(
      source.threadId,
      "pixel.png",
    );
    const excluded = await service.store.addReference(
      source.threadId,
      "missing.bin",
    );
    storage.drafts.save(
      source.threadId,
      0,
      `${file.token} ${folder.token} ${image.token}\nEXCLUDED ${excluded.token}`,
    );
    const mount = (threadId: typeof source.threadId, owner: string) => {
      const bridge = createAttachmentBridge({
        invoke: async (_channel, command) => {
          const work = service.execute(command, owner);
          if (command.kind === "clipboard-export") exportDone = work;
          return work;
        },
      }).attachments;
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
      caches.push(cache);
      controllers.push(controller);
      models.push(model);
      adapters.push(clipboard);
      return { editor, controller, clipboard, cache };
    };
    const from = mount(source.threadId, "from-doc"),
      to = mount(target.threadId, "to-doc");
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
    from.editor.commands.setTextSelection({
      from: 1,
      to: (from.editor.state.doc.firstChild?.nodeSize ?? 2) - 1,
    });
    expect(from.clipboard.copy(from.editor.view, event, false)).toBe(true);
    expect(await exportDone).toEqual({
      kind: "clipboard-exported",
      degraded: false,
    });
    rmSync(join(a, "file.txt"));
    rmSync(join(a, "pixel.png"));
    writeFileSync(join(a, "folder", "new.txt"), "new");
    expect(to.clipboard.paste(to.editor.view, event)).toBe(true);
    await to.clipboard.settled();
    const text = to.editor.getText({ blockSeparator: "\n" });
    expect(text).not.toContain("EXCLUDED");
    expect(text).not.toContain(file.id);
    const items = await service.store.list(target.threadId);
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.frozenReference?.projectPath === a)).toBe(
      true,
    );
    expect(await to.controller.flush()).toBe(true);
    expect(to.editor.commands.undo()).toBe(true);
    expect(to.editor.getText()).toBe("");
    expect(await to.controller.flush()).toBe(true);
    service.store.releaseEditorHistories("from-doc");
    expect(
      (await service.store.cleanStorage(target.threadId)).deletedObjects,
    ).toBe(0);
    expect(to.editor.commands.redo()).toBe(true);
    expect(to.editor.getText({ blockSeparator: "\n" })).toBe(text);
    expect(await service.store.prepare(target.threadId, text)).toMatchObject({
      ok: true,
      content: {
        images: [expect.any(Object)],
        message: expect.stringContaining("PM SOURCE"),
      },
    });
    expect(await to.controller.flush()).toBe(true);
  } finally {
    for (const adapter of adapters) adapter.dispose();
    for (const editor of editors) editor.destroy();
    for (const cache of caches) cache.dispose();
    for (const controller of controllers) controller.dispose();
    for (const model of models) model.dispose();
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

function pdfFixture() {
  const stream = "BT /F1 12 Tf 20 100 Td (FROZEN PDF ORIGINAL) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let value = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(value));
    value += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const offset = Buffer.byteLength(value);
  value += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((position) => `${String(position).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.from(value);
}

it("freezes a real SDK PDF only with existing text-only consent, preserves its derived record on recopy and pins both objects after source release", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-frozen-pdf-")));
  const sourceRoot = join(root, "project");
  mkdirSync(sourceRoot);
  writeFileSync(join(sourceRoot, "document.pdf"), pdfFixture());
  // A running desktop owns its SDK root. Clone immutable resources so this
  // real-converter fixture obeys the production exclusive resource lease.
  const resources = join(root, "runtime");
  cpSync(
    join(import.meta.dirname, "../../resources/sdk"),
    join(resources, "sdk"),
    {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
    },
  );
  const sdk = join(resources, "sdk");
  const manifest = JSON.parse(readFileSync(join(sdk, "manifest.json"), "utf8"));
  const adapter = readFileSync(
    join(import.meta.dirname, "../../runtime/pdf-content.mjs"),
  );
  writeFileSync(join(sdk, "pdf-content.mjs"), adapter);
  manifest.hashes["pdf-content.mjs"] = createHash("sha256")
    .update(adapter)
    .digest("hex");
  writeFileSync(join(sdk, "manifest.json"), JSON.stringify(manifest));
  for (const name of ["pi-coding-agent", "pi-utils"]) {
    expect(
      realpathSync(
        join(resources, "sdk", "node_modules/@oh-my-pi", name),
      ).startsWith(`${resources}/sdk/`),
    ).toBe(true);
  }
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    resources,
    () => true,
    async () => null,
  );
  try {
    const source = storage.drafts.create(sourceRoot),
      target = storage.drafts.create(root),
      secondTarget = storage.drafts.create(root);
    const pdf = await service.store.addReference(
      source.threadId,
      "document.pdf",
    );
    const rejected = service.store.reserveClipboard("source", source.threadId);
    if (rejected.kind !== "clipboard-tickets" || !rejected.tickets[0])
      throw Error("reserve");
    expect(
      await service.store.exportClipboard(
        "source",
        source.threadId,
        rejected.tickets[0],
        pdf.token,
        [pdf.id],
      ),
    ).toMatchObject({ kind: "clipboard-unavailable", reason: "failed" });
    expect(await service.store.list(target.threadId)).toHaveLength(0);
    expect(
      await service.store.setTextOnly(source.threadId, pdf.id, true),
    ).toMatchObject({
      source: "reference",
      representation: "reference",
      textOnly: true,
    });
    const tickets = service.store.reserveClipboard("source", source.threadId);
    if (tickets.kind !== "clipboard-tickets" || !tickets.tickets[0])
      throw Error("reserve");
    expect(
      await service.store.exportClipboard(
        "source",
        source.threadId,
        tickets.tickets[0],
        pdf.token,
        [pdf.id],
      ),
    ).toEqual({ kind: "clipboard-exported", degraded: false });
    expect(
      service.store.referenceSource(source.threadId, pdf.id)?.inputDigest,
    ).toBeUndefined();
    expect(
      (await service.store.cleanStorage(source.threadId)).deletedObjects,
    ).toBe(0);
    const imported = await service.store.importClipboard(
      "target",
      target.threadId,
      tickets.tickets[0],
    );
    if (imported.kind !== "clipboard-imported" || !imported.items[0])
      throw Error("import");
    const item = imported.items[0],
      sourceRecord = service.store.referenceSource(target.threadId, item.id);
    expect(item).toMatchObject({
      representation: "pdf-text",
      textOnly: true,
      coverageGaps: expect.arrayContaining(["ocr-pages:1"]),
      converterVersion: "omp18.8.7-pdfToMarkdown",
    });
    expect(sourceRecord?.derivedDigest).toMatch(/^[a-f0-9]{64}$/);
    rmSync(join(sourceRoot, "document.pdf"));
    service.store.releaseEditorHistories("source");
    // The target handoff is the sole transient owner of both assets here.
    expect(
      (await service.store.cleanStorage(target.threadId)).deletedObjects,
    ).toBe(0);
    for (const hash of [sourceRecord?.inputDigest, sourceRecord?.derivedDigest])
      expect(
        existsSync(join(root, "content", "objects", hash ?? "missing")),
      ).toBe(true);
    expect(await service.store.preview(target.threadId, item.id)).toMatchObject(
      { kind: "text", text: expect.stringContaining("FROZEN PDF ORIGINAL") },
    );
    const recopy = service.store.reserveClipboard("target", target.threadId);
    if (recopy.kind !== "clipboard-tickets" || !recopy.tickets[0])
      throw Error("reserve");
    expect(
      await service.store.exportClipboard(
        "target",
        target.threadId,
        recopy.tickets[0],
        imported.text,
        [item.id],
      ),
    ).toMatchObject({ kind: "clipboard-exported", degraded: false });
    const copied = await service.store.importClipboard(
      "second",
      secondTarget.threadId,
      recopy.tickets[0],
    );
    if (copied.kind !== "clipboard-imported" || !copied.items[0])
      throw Error("recopy");
    expect(copied.items[0].frozenReference).toEqual(item.frozenReference);
    expect(copied.items[0].coverageGaps).toEqual(item.coverageGaps);
    expect(
      service.store.referenceSource(secondTarget.threadId, copied.items[0].id)
        ?.derivedDigest,
    ).toBe(sourceRecord?.derivedDigest);
    service.store.releaseEditorHistories("target");
    expect(
      (await service.store.cleanStorage(secondTarget.threadId)).deletedObjects,
    ).toBe(0);
    storage.drafts.save(secondTarget.threadId, 0, copied.text);
    service.store.releaseEditorHistories("second");
    expect(
      (await service.store.cleanStorage(secondTarget.threadId)).deletedObjects,
    ).toBe(0);
    expect(
      await service.store.prepare(secondTarget.threadId, copied.text),
    ).toMatchObject({
      ok: true,
      content: {
        message: expect.stringContaining("FROZEN PDF ORIGINAL"),
        sources: [
          expect.objectContaining({
            derivedDigest: sourceRecord?.derivedDigest,
            frozenReference: item.frozenReference,
          }),
        ],
      },
    });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 60000);

it.each(["unsupported", "missing", "denied", "truncated-directory"] as const)(
  "rejects %s source without creating partial target manifests or a ready capability",
  async (kind) => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "dpi-frozen-denied-")),
    );
    const project = join(root, "project"),
      outside = join(root, "secret.txt");
    mkdirSync(project);
    writeFileSync(outside, "SECRET");
    let path = "bad.bin",
      referenceKind: "file" | "directory" = "file";
    if (kind === "unsupported")
      writeFileSync(join(project, path), Buffer.from([0, 1, 2]));
    if (kind === "denied") {
      path = "escape.txt";
      symlinkSync(outside, join(project, path));
    }
    if (kind === "truncated-directory") {
      path = "large";
      referenceKind = "directory";
      mkdirSync(join(project, path));
      for (let i = 0; i < 501; i++)
        writeFileSync(join(project, path, `${i}.txt`), "x");
    }
    const storage = AppStorage.open(join(root, "app.sqlite"));
    const service = createAttachmentService(
      storage,
      root,
      "unused",
      () => true,
      async () => null,
    );
    try {
      const source = storage.drafts.create(project),
        target = storage.drafts.create(root);
      const item = await service.store.addReference(
        source.threadId,
        path,
        referenceKind,
      );
      const reserved = service.store.reserveClipboard(
        "source",
        source.threadId,
      );
      if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
        throw Error("reserve");
      expect(
        await service.store.exportClipboard(
          "source",
          source.threadId,
          reserved.tickets[0],
          item.token,
          [item.id],
        ),
      ).toMatchObject({ kind: "clipboard-unavailable", reason: "failed" });
      expect(
        await service.store.importClipboard(
          "target",
          target.threadId,
          reserved.tickets[0],
        ),
      ).toMatchObject({ kind: "clipboard-unavailable" });
      expect(await service.store.list(target.threadId)).toHaveLength(0);
      expect(await service.store.list(source.threadId)).toMatchObject([
        { source: "reference", representation: "reference" },
      ]);
    } finally {
      await service.close();
      storage.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it("enforces actual async 64 MiB snapshot and 128 MiB aggregate byte budgets, and recovers pins/budget after rejection", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-frozen-budget-")));
  const project = join(root, "project");
  mkdirSync(project);
  const buffer = Buffer.alloc(23 * 1024 * 1024, "x");
  for (let i = 0; i < 3; i++) {
    buffer[buffer.length - 1] = 97 + i;
    writeFileSync(join(project, `${i}.txt`), buffer);
  }
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const source = storage.drafts.create(project),
      target = storage.drafts.create(root);
    const items = [];
    for (let i = 0; i < 3; i++)
      items.push(await service.store.addReference(source.threadId, `${i}.txt`));
    const reserve = (owner: string) => {
      const result = service.store.reserveClipboard(owner, source.threadId);
      if (result.kind !== "clipboard-tickets" || !result.tickets[0])
        throw Error("reserve");
      return result.tickets[0];
    };
    const oversized = reserve("oversized");
    expect(
      await service.store.exportClipboard(
        "oversized",
        source.threadId,
        oversized,
        items.map((item) => item.token).join(" "),
        items.map((item) => item.id),
      ),
    ).toMatchObject({ reason: "busy" });
    expect(
      await service.store.importClipboard("target", target.threadId, oversized),
    ).toMatchObject({ kind: "clipboard-unavailable" });
    expect(await service.store.list(target.threadId)).toHaveLength(0);
    const text = items
        .slice(0, 2)
        .map((item) => item.token)
        .join(" "),
      ids = items.slice(0, 2).map((item) => item.id);
    for (const owner of ["first", "second"])
      expect(
        await service.store.exportClipboard(
          owner,
          source.threadId,
          reserve(owner),
          text,
          ids,
        ),
      ).toMatchObject({ kind: "clipboard-exported" });
    expect(
      await service.store.exportClipboard(
        "third",
        source.threadId,
        reserve("third"),
        text,
        ids,
      ),
    ).toMatchObject({ reason: "busy" });
    expect(
      (await service.store.cleanStorage(source.threadId)).deletedObjects,
    ).toBe(1);
    service.store.releaseEditorHistories("first");
    service.store.releaseEditorHistories("second");
    const released =
      (await service.store.cleanStorage(source.threadId)).deletedObjects +
      (await service.store.cleanStorage(source.threadId)).deletedObjects;
    expect(released).toBe(2);
    expect(
      await service.store.exportClipboard(
        "recovered",
        source.threadId,
        reserve("recovered"),
        text,
        ids,
      ),
    ).toMatchObject({ kind: "clipboard-exported" });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 15000);

it("counts deduplicated derived PDF bytes in the real final snapshot admission", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "dpi-frozen-derived-budget-")),
  );
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const source = storage.drafts.create(root),
    target = storage.drafts.create(root);
  const value = Buffer.alloc(21 * 1024 * 1024, "x");
  value.write("%PDF-1.4");
  for (let index = 0; index < 3; index++) {
    value[value.length - 1] = 97 + index;
    writeFileSync(join(root, `${index}.pdf`), value);
  }
  const store = new AttachmentStore({
    directory: join(root, "content"),
    database: storage.database,
    lifecycle: createAttachmentReferences(storage, (threadId, id) =>
      store.referenceSource(threadId, id),
    ),
    readReference: async (_thread, path) => {
      const result = await readProjectBytes(root, path, 25 * 1024 * 1024);
      if (result.kind !== "bytes") throw Error("source");
      return {
        bytes: result.bytes,
        version: result.version,
        projectPath: root,
      };
    },
    // Controlled converter output verifies admission; native conversion is proved by the separate SDK test.
    convertPdf: async () => ({
      text: "d".repeat(1024 * 1024),
      pageCount: 1,
      pagesNeedingOcr: [],
      hasVisualContent: false,
      converterVersion: "bounded-fixture",
    }),
  });
  try {
    const items = [];
    for (let index = 0; index < 3; index++)
      items.push(await store.addReference(source.threadId, `${index}.pdf`));
    const tickets = store.reserveClipboard("source", source.threadId);
    if (tickets.kind !== "clipboard-tickets" || !tickets.tickets[0])
      throw Error("tickets");
    expect(
      await store.exportClipboard(
        "source",
        source.threadId,
        tickets.tickets[0],
        items.map((item) => item.token).join(" "),
        items.map((item) => item.id),
      ),
    ).toMatchObject({ reason: "busy" });
    expect(
      await store.importClipboard(
        "target",
        target.threadId,
        tickets.tickets[0],
      ),
    ).toMatchObject({ kind: "clipboard-unavailable" });
    expect(await store.list(target.threadId)).toHaveLength(0);
    expect(
      Number(
        storage.database.connection
          .prepare("SELECT COUNT(*) AS count FROM input_content_object")
          .get()?.count,
      ),
    ).toBe(4);
    let deleted = 0;
    for (let pass = 0; pass < 4; pass++)
      deleted += (await store.cleanStorage(source.threadId)).deletedObjects;
    expect(deleted).toBe(4);
  } finally {
    await store.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 15000);

it.each(["TTL", "document"])(
  "rejects a late real Main source read after %s without publishing or pinning new assets",
  async (kind) => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "dpi-frozen-late-read-")),
    );
    const storage = AppStorage.open(join(root, "app.sqlite"));
    let resolve!: (value: {
      bytes: Uint8Array;
      version: string;
      projectPath: string;
    }) => void;
    let started!: () => void;
    const reading = new Promise<void>((done) => {
      started = done;
    });
    const store = new AttachmentStore({
      directory: join(root, "content"),
      database: storage.database,
      lifecycle: createAttachmentReferences(storage, (threadId, id) =>
        store.referenceSource(threadId, id),
      ),
      readReference: () => {
        started();
        return new Promise((done) => {
          resolve = done;
        });
      },
    });
    try {
      const source = storage.drafts.create(root),
        target = storage.drafts.create(root);
      const item = await store.addReference(source.threadId, "file.txt");
      vi.useFakeTimers();
      const reserved = store.reserveClipboard("source", source.threadId);
      if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
        throw Error("tickets");
      const pending = store.exportClipboard(
        "source",
        source.threadId,
        reserved.tickets[0],
        item.token,
        [item.id],
      );
      await reading;
      if (kind === "TTL") await vi.advanceTimersByTimeAsync(120001);
      else store.releaseEditorHistories("source");
      expect(await pending).toMatchObject({
        reason: kind === "TTL" ? "expired" : "invalid",
      });
      resolve({
        bytes: Buffer.from("FROZEN LATE"),
        version: "late",
        projectPath: root,
      });
      const unchanged = await store.list(source.threadId);
      expect(unchanged).toMatchObject([{ source: "reference" }]);
      expect(unchanged[0]?.inputDigest).toBeUndefined();
      expect(
        Number(
          storage.database.connection
            .prepare("SELECT COUNT(*) AS count FROM input_content_object")
            .get()?.count,
        ),
      ).toBe(0);
      expect(
        await store.importClipboard(
          "target",
          target.threadId,
          reserved.tickets[0],
        ),
      ).toMatchObject({ kind: "clipboard-unavailable" });
      expect(await store.list(target.threadId)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
      await store.close();
      storage.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it("rechecks the captured source identity after asynchronous conversion and leaves all uncommitted objects collectible", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "dpi-frozen-source-identity-")),
  );
  const storage = AppStorage.open(join(root, "app.sqlite"));
  let current = true,
    finish!: () => void,
    started!: () => void;
  const converting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const store = new AttachmentStore({
    directory: join(root, "content"),
    database: storage.database,
    lifecycle: createAttachmentReferences(storage, (threadId, id) =>
      store.referenceSource(threadId, id),
    ),
    readReference: async () => ({
      bytes: Buffer.from("%PDF-1.4 fixture"),
      version: "source-v1",
      projectPath: root,
      current: () => current,
    }),
    convertPdf: async () => {
      started();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        text: "derived",
        pageCount: 1,
        pagesNeedingOcr: [],
        hasVisualContent: false,
        converterVersion: "fixture",
      };
    },
  });
  try {
    const source = storage.drafts.create(root),
      target = storage.drafts.create(root);
    const item = await store.addReference(source.threadId, "file.pdf");
    const reserved = store.reserveClipboard("source", source.threadId);
    if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
      throw Error("tickets");
    const pending = store.exportClipboard(
      "source",
      source.threadId,
      reserved.tickets[0],
      item.token,
      [item.id],
    );
    await converting;
    current = false;
    finish();
    expect(await pending).toMatchObject({ reason: "failed" });
    expect(
      await store.importClipboard(
        "target",
        target.threadId,
        reserved.tickets[0],
      ),
    ).toMatchObject({ kind: "clipboard-unavailable" });
    expect(await store.list(target.threadId)).toHaveLength(0);
    expect((await store.cleanStorage(source.threadId)).deletedObjects).toBe(2);
  } finally {
    await store.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("reads old manifests without provenance and repairs missing private object metadata before final admission", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-frozen-legacy-")));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const source = storage.drafts.create(root),
      target = storage.drafts.create(root);
    const item = await service.store.importBytes(source.threadId, {
      name: "old.txt",
      source: "file",
      mimeType: "text/plain",
      bytes: Buffer.from("OLD PRIVATE"),
    });
    expect(item.frozenReference).toBeUndefined();
    storage.database.connection.exec("DELETE FROM input_content_object");
    const tickets = service.store.reserveClipboard("source", source.threadId);
    if (tickets.kind !== "clipboard-tickets" || !tickets.tickets[0])
      throw Error("tickets");
    expect(
      await service.store.exportClipboard(
        "source",
        source.threadId,
        tickets.tickets[0],
        item.token,
        [item.id],
      ),
    ).toMatchObject({ kind: "clipboard-exported", degraded: false });
    const result = await service.store.importClipboard(
      "target",
      target.threadId,
      tickets.tickets[0],
    );
    if (result.kind !== "clipboard-imported") throw Error("import");
    expect(result.items[0]?.frozenReference).toBeUndefined();
    expect(
      await service.store.prepare(target.threadId, result.text),
    ).toMatchObject({
      ok: true,
      content: { message: expect.stringContaining("OLD PRIVATE") },
    });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("rejects over-32 dependencies and over-1 MiB UTF-8 selection before any asynchronous source allocation", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "dpi-frozen-selection-budget-")),
  );
  writeFileSync(join(root, "source.txt"), "source");
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const source = storage.drafts.create(root),
      target = storage.drafts.create(root);
    const items = [];
    for (let index = 0; index < 33; index++)
      items.push(
        await service.store.addReference(source.threadId, "source.txt"),
      );
    const reserved = service.store.reserveClipboard("source", source.threadId);
    if (
      reserved.kind !== "clipboard-tickets" ||
      !reserved.tickets[0] ||
      !reserved.tickets[1] ||
      !items[0]
    )
      throw Error("tickets");
    expect(
      await service.store.exportClipboard(
        "source",
        source.threadId,
        reserved.tickets[0],
        items.map((item) => item.token).join(" "),
        items.map((item) => item.id),
      ),
    ).toMatchObject({ reason: "failed" });
    const bridge = createAttachmentBridge({
      invoke: async (_channel, command) => service.execute(command, "source"),
    }).attachments;
    expect(
      await bridge.request({
        traceId: randomUUID(),
        kind: "clipboard-export",
        threadId: source.threadId,
        ticket: reserved.tickets[1],
        text: "界".repeat(349526) + items[0].token,
        ids: [items[0].id],
      }),
    ).toMatchObject({ reason: "failed" });
    expect(
      Number(
        storage.database.connection
          .prepare("SELECT COUNT(*) AS count FROM input_content_object")
          .get()?.count,
      ),
    ).toBe(0);
    expect(await service.store.list(target.threadId)).toHaveLength(0);
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
