import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createAttachmentService } from "../../src/app/main/wiring/attachment-service";
import { AttachmentRequestSchema } from "../../src/modules/input/contracts/public";

vi.mock("electron", () => ({ utilityProcess: {} }));
it("strict operation settlement is document/Thread scoped, idempotent and releases no shared durable dependency", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-import-op-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const a = storage.drafts.create(root);
    const b = storage.drafts.create(root);
    const operationId = crypto.randomUUID();
    const owner = crypto.randomUUID();
    const imported = await service.execute(
      AttachmentRequestSchema.parse({
        kind: "import-bytes",
        threadId: a.threadId,
        traceId: crypto.randomUUID(),
        operationId,
        name: "one.txt",
        mimeType: "text/plain",
        dataBase64: Buffer.from("shared").toString("base64"),
        source: "drop",
      }),
      owner,
    );
    expect(imported.kind).toBe("attachments");
    if (imported.kind !== "attachments" || !imported.items[0])
      throw Error("missing item");
    const item = imported.items[0];
    const settlement = (threadId: string, document: string) =>
      service.execute(
        AttachmentRequestSchema.parse({
          kind: "import-settle",
          threadId,
          traceId: crypto.randomUUID(),
          operationId,
          disposition: "release",
        }),
        document,
      );
    expect(await settlement(b.threadId, owner)).toMatchObject({
      kind: "unavailable",
      reason: "reference-denied",
    });
    expect(await settlement(a.threadId, "foreign")).toMatchObject({
      kind: "unavailable",
      reason: "reference-denied",
    });
    expect(await service.store.cleanStorage(a.threadId)).toMatchObject({
      deletedObjects: 0,
    });
    const shared = await service.store.importBytes(a.threadId, {
      name: "other.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("shared"),
      source: "file",
    });
    storage.drafts.save(a.threadId, 0, shared.token);
    expect(await settlement(a.threadId, owner)).toEqual({
      kind: "import-settled",
    });
    expect(await settlement(a.threadId, owner)).toEqual({
      kind: "import-settled",
    });
    expect(await service.store.cleanStorage(a.threadId)).toMatchObject({
      deletedObjects: 0,
    });
    storage.drafts.save(a.threadId, 1, "");
    expect(await service.store.cleanStorage(a.threadId)).toMatchObject({
      deletedObjects: 1,
    });
    expect(await service.store.list(a.threadId)).toHaveLength(2);
    expect(item.id).not.toBe(shared.id);
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
it("document disposal during an accepted conversion settles late source and derived objects", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-import-dispose-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(root),
      owner = crypto.randomUUID(),
      operationId = crypto.randomUUID();
    // Freeze an accepted import in the serialized lane before it writes its source.
    const original = service.store.importBytes.bind(service.store);
    let finish: () => void = () => {};
    vi.spyOn(service.store, "importBytes").mockImplementation(
      async (...args) => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return original(...args);
      },
    );
    const importing = service.execute(
      AttachmentRequestSchema.parse({
        kind: "import-bytes",
        threadId: draft.threadId,
        traceId: crypto.randomUUID(),
        operationId,
        name: "late.txt",
        mimeType: "text/plain",
        dataBase64: Buffer.from("late body").toString("base64"),
        source: "drop",
      }),
      owner,
    );
    await vi.waitFor(() => expect(finish).not.toEqual(() => {}));
    service.store.releaseEditorHistories(owner);
    finish();
    await importing;
    expect(await service.store.cleanStorage(draft.threadId)).toMatchObject({
      deletedObjects: 1,
    });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("adopt settlement keeps source pin until durable/history ownership and document release preserves actual Undo leases", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-import-adopt-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(root),
      owner = crypto.randomUUID(),
      operationId = crypto.randomUUID();
    const request = (command: Record<string, unknown>) =>
      service.execute(
        AttachmentRequestSchema.parse({
          ...command,
          threadId: draft.threadId,
          traceId: crypto.randomUUID(),
        }),
        owner,
      );
    const importing = {
      kind: "import-bytes",
      operationId,
      name: "adopt.txt",
      mimeType: "text/plain",
      dataBase64: Buffer.from("adopted body").toString("base64"),
      source: "paste",
    };
    const first = await request(importing),
      duplicate = await request(importing);
    expect(duplicate).toEqual(first);
    if (first.kind !== "attachments" || !first.items[0])
      throw Error("missing source");
    const item = first.items[0];
    expect(
      await request({
        kind: "import-settle",
        operationId,
        disposition: "adopt",
      }),
    ).toEqual({ kind: "import-settled" });
    expect(await service.store.cleanStorage(draft.threadId)).toMatchObject({
      deletedObjects: 0,
    });
    const history = await request({
      kind: "history-open",
      epoch: crypto.randomUUID(),
    });
    if (history.kind !== "history-lease") throw Error("missing history");
    await request({
      kind: "history-update",
      leaseId: history.leaseId,
      version: 1,
      ids: [item.id],
    });
    expect(
      await request({
        kind: "import-settle",
        operationId,
        disposition: "release",
      }),
    ).toEqual({ kind: "import-settled" });
    expect(await service.store.cleanStorage(draft.threadId)).toMatchObject({
      deletedObjects: 0,
    });
    await request({ kind: "history-release", leaseId: history.leaseId });
    expect(await service.store.cleanStorage(draft.threadId)).toMatchObject({
      deletedObjects: 1,
    });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
it("settlement during pending conversion waits for source/derived publication and releases both exact pins", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-import-convert-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const { AttachmentStore } = await import(
    "../../src/modules/input/main/public"
  );
  const { createAttachmentReferences } = await import(
    "../../src/app/main/wiring/attachment-service-references"
  );
  let finish: () => void = () => {};
  let started = false;
  const store = new AttachmentStore({
    directory: join(root, "content"),
    database: storage.database,
    lifecycle: createAttachmentReferences(storage, (threadId, id) =>
      store.referenceSource(threadId, id),
    ),
    convertPdf: async () => {
      started = true;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        text: "derived words",
        pageCount: 1,
        pagesNeedingOcr: [],
        hasVisualContent: false,
        converterVersion: "fixture",
      };
    },
  });
  try {
    const draft = storage.drafts.create(root),
      owner = crypto.randomUUID(),
      operationId = crypto.randomUUID();
    const importing = store.importOperation(
      owner,
      draft.threadId,
      operationId,
      {
        name: "late.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("%PDF-1.7 original"),
        source: "drop",
      },
    );
    await vi.waitFor(() => expect(started).toBe(true));
    let settled = false;
    const settlement = store
      .settleImportOperation(owner, draft.threadId, operationId, "release")
      .then((reply) => {
        settled = true;
        return reply;
      });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    expect(await importing).toEqual({ kind: "cancelled" });
    expect(await settlement).toEqual({ kind: "import-settled" });
    expect(await store.cleanStorage(draft.threadId)).toMatchObject({
      deletedObjects: 2,
    });
    expect(await store.list(draft.threadId)).toHaveLength(1);
  } finally {
    await store.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
it("admission stays bounded before await and rejected attempts cannot impersonate an accepted identity", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-import-limit-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(root),
      owner = crypto.randomUUID(),
      operationId = crypto.randomUUID();
    const original = service.store.importBytes.bind(service.store);
    let finish: () => void = () => {},
      started = false;
    vi.spyOn(service.store, "importBytes").mockImplementation(
      async (...args) => {
        started = true;
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return original(...args);
      },
    );
    const input = {
      name: "one.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("one"),
      source: "paste" as const,
    };
    const first = service.store.importOperation(
      owner,
      draft.threadId,
      operationId,
      input,
    );
    await vi.waitFor(() => expect(started).toBe(true));
    expect(
      await service.store.importOperation(
        owner,
        draft.threadId,
        crypto.randomUUID(),
        input,
      ),
    ).toMatchObject({ kind: "unavailable", reason: "storage-unavailable" });
    expect(
      await service.store.importOperation(owner, draft.threadId, operationId, {
        ...input,
        name: "forged",
      }),
    ).toMatchObject({ kind: "unavailable", reason: "reference-denied" });
    const second = service.store.importOperation(
      owner,
      draft.threadId,
      operationId,
      input,
    );
    finish();
    expect(await second).toEqual(await first);
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
