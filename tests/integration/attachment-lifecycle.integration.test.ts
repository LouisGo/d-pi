import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { access, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createAttachmentService } from "../../src/app/main/wiring/attachment-service";
import { createAttachmentReferences } from "../../src/app/main/wiring/attachment-service-references";
import { serializeReference } from "../../src/modules/input/core/public";
import { AttachmentStore } from "../../src/modules/input/main/public";

vi.mock("electron", () => ({ utilityProcess: {} }));
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof import("node:fs/promises")>()),
}));

it("releases shared originals only after the last durable draft reference and waits seven days", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-lifecycle-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(root);
    const a = await service.store.importBytes(draft.threadId, {
      name: "a.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("same original"),
      source: "file",
    });
    const b = await service.store.importBytes(draft.threadId, {
      name: "b.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("same original"),
      source: "drop",
    });
    storage.drafts.save(draft.threadId, 0, `${a.token}${b.token}`);
    expect(await service.store.checkStorage(draft.threadId)).toMatchObject({
      retainedObjects: 1,
      unreferencedObjects: 0,
    });
    storage.drafts.save(draft.threadId, 1, b.token);
    expect(await service.store.cleanStorage(draft.threadId)).toMatchObject({
      deletedObjects: 0,
    });
    expect(
      await readFile(
        join(root, "content", "objects", a.inputDigest ?? ""),
        "utf8",
      ),
    ).toBe("same original");
    storage.drafts.save(draft.threadId, 2, "new edit");
    expect(await service.store.collectGarbage()).toMatchObject({
      deletedObjects: 0,
    });
    storage.database.connection
      .prepare("UPDATE input_content_object SET last_released_at=?")
      .run(Date.now() - 7 * 86400000 - 1);
    expect(await service.store.collectGarbage()).toMatchObject({
      deletedObjects: 1,
    });
    await expect(
      access(join(root, "content", "objects", a.inputDigest ?? "")),
    ).rejects.toThrow();
    expect(storage.drafts.read(draft.threadId).text).toBe("new edit");
    expect(await service.store.list(draft.threadId)).toHaveLength(2);
  } finally {
    if ("close" in service) await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("keeps a late duplicate import pinned to its own source identity while an older shared source is released", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-late-import-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(root);
    const input = {
      name: "same.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("shared bytes"),
      source: "file" as const,
    };
    const a = await service.store.importBytes(draft.threadId, input);
    storage.drafts.save(draft.threadId, 0, a.token);
    await service.store.checkStorage(draft.threadId);
    const late = await service.store.importBytes(draft.threadId, input);
    await service.store.checkStorage(draft.threadId);
    storage.drafts.save(draft.threadId, 1, "");
    expect(await service.store.cleanStorage(draft.threadId)).toMatchObject({
      deletedObjects: 0,
      retainedObjects: 1,
    });
    expect(
      await service.store.prepare(draft.threadId, late.token),
    ).toMatchObject({ ok: true });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("reports missing originals and marks the affected source without removing the durable input", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-missing-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(root);
    const a = await service.store.importBytes(draft.threadId, {
      name: "lost.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("important"),
      source: "file",
    });
    storage.drafts.save(draft.threadId, 0, a.token);
    await import("node:fs/promises").then((fs) =>
      fs.rm(join(root, "content", "objects", a.inputDigest ?? "")),
    );
    expect(await service.store.checkStorage(draft.threadId)).toMatchObject({
      issues: [
        { attachmentId: a.id, object: "original", reason: "content-missing" },
      ],
    });
    expect(await service.store.list(draft.threadId)).toMatchObject([
      { status: "failed", reason: "content-missing" },
    ]);
    expect(await service.store.prepare(draft.threadId, a.token)).toMatchObject({
      ok: false,
      reason: "content-missing",
      attachmentId: a.id,
    });
    expect(storage.drafts.read(draft.threadId).text).toBe(a.token);
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it.each(["prepared", "unknown", "acknowledged", "completed"] as const)(
  "retains frozen source bytes for %s receipts after draft consumption and later edits",
  async (state) => {
    const root = mkdtempSync(join(tmpdir(), "dpi-frozen-"));
    const storage = AppStorage.open(join(root, "app.sqlite"));
    const service = createAttachmentService(
      storage,
      root,
      "unused",
      () => true,
      async () => null,
    );
    try {
      const draft = storage.drafts.create(root);
      const a = await service.store.importBytes(draft.threadId, {
        name: "receipt.txt",
        mimeType: "text/plain",
        bytes: Buffer.from("frozen source"),
        source: "file",
      });
      storage.drafts.save(draft.threadId, 0, a.token);
      const prepared = await service.store.prepare(draft.threadId, a.token);
      if (!prepared.ok) throw Error("fixture preparation failed");
      const { SubmissionIdSchema } = await import(
        "../../src/modules/execution/contracts/public"
      );
      const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
      storage.submissions.prepareSubmission({
        submissionId,
        threadId: draft.threadId,
        traceId: crypto.randomUUID(),
        revision: 1,
        text: a.token,
        content: prepared.content,
        requestId: crypto.randomUUID(),
        target: {
          processInstanceId: crypto.randomUUID(),
          connectionGeneration: crypto.randomUUID(),
          configContextId: "fixture",
          nativeSessionRef: "fixture.jsonl",
        },
      });
      if (state !== "prepared")
        storage.submissions.dispatchSubmission(submissionId);
      if (state === "unknown")
        storage.submissions.unknownSubmission(submissionId);
      if (state === "acknowledged" || state === "completed")
        storage.submissions.acknowledgeSubmission(submissionId);
      if (state === "completed")
        storage.submissions.observePromptResult(submissionId, {
          source: "native-prompt-result",
          status: "completed",
          agentInvoked: true,
          sessionSettled: true,
        });
      storage.drafts.save(draft.threadId, 1, "a newer edit");
      expect(await service.store.cleanStorage(draft.threadId)).toMatchObject({
        deletedObjects: 0,
        retainedObjects: 1,
      });
      expect(
        await readFile(
          join(root, "content", "objects", a.inputDigest ?? ""),
          "utf8",
        ),
      ).toBe("frozen source");
      expect(storage.drafts.read(draft.threadId).text).toBe("a newer edit");
      expect(storage.submissions.submission(submissionId)?.state).toBe(
        state === "completed" ? "acknowledged" : state,
      );
    } finally {
      await service.close();
      storage.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it("retains queue-change original sources even after the edited queue text and durable draft no longer contain them", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-queue-source-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(root);
    const a = await service.store.importBytes(draft.threadId, {
      name: "queue.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("previous source"),
      source: "file",
    });
    storage.drafts.save(draft.threadId, 0, a.token);
    await service.store.checkStorage(draft.threadId);
    storage.queueChanges.prepare({
      traceId: crypto.randomUUID(),
      threadId: draft.threadId,
      target: {
        processInstanceId: crypto.randomUUID(),
        connectionGeneration: crypto.randomUUID(),
        configContextId: "fixture",
        nativeSessionRef: "fixture.jsonl",
      },
      command: {
        action: "save-edit",
        entryId: crypto.randomUUID(),
        revision: 1,
        text: "changed queue entry",
      },
      previousText: a.token,
    });
    storage.drafts.save(draft.threadId, 1, "");
    expect(await service.store.cleanStorage(draft.threadId)).toMatchObject({
      retainedObjects: 1,
      deletedObjects: 0,
    });
    expect(
      await readFile(
        join(root, "content", "objects", a.inputDigest ?? ""),
        "utf8",
      ),
    ).toBe("previous source");
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("scans beyond 1024 receipts without losing the last unknown reference or disabling independent cache cleanup", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-many-receipts-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  let service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(root);
    const referenced = await service.store.importBytes(draft.threadId, {
      name: "keep.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("last receipt original"),
      source: "file",
    });
    const unused = await service.store.importBytes(draft.threadId, {
      name: "unused.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("independent cache"),
      source: "file",
    });
    const { SubmissionIdSchema } = await import(
      "../../src/modules/execution/contracts/public"
    );
    const template = storage.submissions.prepareSubmission({
      submissionId: SubmissionIdSchema.parse(crypto.randomUUID()),
      threadId: draft.threadId,
      traceId: crypto.randomUUID(),
      revision: 0,
      text: "free text",
      origin: "free",
      requestId: crypto.randomUUID(),
      target: {
        processInstanceId: crypto.randomUUID(),
        connectionGeneration: crypto.randomUUID(),
        configContextId: "fixture",
        nativeSessionRef: "fixture.jsonl",
      },
    });
    storage.database.transaction(() => {
      const insert = storage.database.connection.prepare(
        "INSERT INTO submission VALUES(?,?,?)",
      );
      for (let n = 0; n < 1025; n++) {
        const receipt = {
          ...template,
          submissionId: crypto.randomUUID(),
          traceId: crypto.randomUUID(),
          requestId: crypto.randomUUID(),
          ...(n === 1024
            ? {
                state: "unknown",
                outcome: "unknown",
                content: {
                  schemaVersion: 1,
                  message: "frozen source",
                  images: [],
                  rawBytes: referenced.byteLength,
                  sources: [
                    {
                      attachmentId: referenced.id,
                      inputDigest: referenced.inputDigest,
                      representation: "text",
                      converterVersion: "utf-8",
                      coverageGaps: [],
                      byteLength: referenced.byteLength,
                      name: referenced.name,
                    },
                  ],
                },
              }
            : {}),
        };
        insert.run(
          receipt.submissionId,
          draft.threadId,
          JSON.stringify(receipt),
        );
      }
    });
    await service.close();
    service = createAttachmentService(
      storage,
      root,
      "unused",
      () => true,
      async () => null,
    );
    const command = {
      kind: "clean-storage" as const,
      threadId: draft.threadId,
      traceId: crypto.randomUUID(),
    };
    let report = await service.execute(command);
    expect(report).toMatchObject({
      kind: "storage-report",
      referenceScanIncomplete: true,
      deletedObjects: 0,
    });
    for (
      let n = 0;
      n < 32 &&
      report.kind === "storage-report" &&
      (report.referenceScanIncomplete || report.manifestScanIncomplete);
      n++
    )
      report = await service.execute(command);
    expect(report).toMatchObject({
      kind: "storage-report",
      retainedObjects: 1,
      deletedObjects: 1,
    });
    expect(
      await readFile(
        join(root, "content", "objects", referenced.inputDigest ?? ""),
        "utf8",
      ),
    ).toBe("last receipt original");
    await expect(
      access(join(root, "content", "objects", unused.inputDigest ?? "")),
    ).rejects.toThrow();
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("locates a missing frozen original even after an @ source has been prepared from a newer file version", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-old-frozen-")));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const fs = await import("node:fs/promises");
    await fs.writeFile(join(root, "file.txt"), "old source");
    const draft = storage.drafts.create(root);
    const a = await service.store.addReference(draft.threadId, "file.txt");
    const old = await service.store.prepare(draft.threadId, a.token);
    if (!old.ok) throw Error(`fixture preparation failed: ${old.reason}`);
    const { SubmissionIdSchema } = await import(
      "../../src/modules/execution/contracts/public"
    );
    storage.submissions.prepareSubmission({
      submissionId: SubmissionIdSchema.parse(crypto.randomUUID()),
      threadId: draft.threadId,
      traceId: crypto.randomUUID(),
      revision: 0,
      text: "frozen original",
      content: old.content,
      origin: "free",
      requestId: crypto.randomUUID(),
      target: {
        processInstanceId: crypto.randomUUID(),
        connectionGeneration: crypto.randomUUID(),
        configContextId: "fixture",
        nativeSessionRef: "fixture.jsonl",
      },
    });
    await fs.writeFile(join(root, "file.txt"), "new source");
    expect(await service.store.prepare(draft.threadId, a.token)).toMatchObject({
      ok: true,
      content: { message: expect.stringContaining("new source") },
    });
    await fs.rm(
      join(
        root,
        "content",
        "objects",
        old.content.sources[0]?.inputDigest ?? "",
      ),
    );
    expect(await service.store.checkStorage(draft.threadId)).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          attachmentId: a.id,
          name: "file.txt",
          object: "original",
          reason: "content-missing",
        }),
      ]),
    });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("rebuilds a damaged derived PDF while retaining its original and independent source identities", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-derived-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const store: AttachmentStore = new AttachmentStore({
    directory: join(root, "content"),
    database: storage.database,
    convertPdf: async () => ({
      text: "complete extracted text",
      pageCount: 1,
      pagesNeedingOcr: [],
      hasVisualContent: false,
      converterVersion: "fixture-v1",
    }),
    lifecycle: createAttachmentReferences(storage, (thread, id) =>
      store.referenceSource(thread, id),
    ),
  });
  try {
    const draft = storage.drafts.create(root);
    const input = {
      name: "report.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.7 original"),
      source: "file" as const,
    };
    const a = await store.importBytes(draft.threadId, input);
    storage.drafts.save(draft.threadId, 0, a.token);
    const prepared = await store.prepare(draft.threadId, a.token);
    if (!prepared.ok) throw Error("fixture preparation failed");
    const derived = prepared.content.sources[0]?.derivedDigest;
    if (!derived) throw Error("missing derived provenance");
    await writeFile(
      join(root, "content", "objects", derived),
      "corrupt conversion",
    );
    expect(await store.checkStorage(draft.threadId)).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          attachmentId: a.id,
          object: "derived",
          reason: "content-corrupt",
        }),
      ]),
    });
    expect(await store.list(draft.threadId)).toMatchObject([
      { status: "failed", reason: "content-corrupt" },
    ]);
    expect(await store.retry(draft.threadId, a.id)).toMatchObject({
      status: "ready",
    });
    expect(await store.preview(draft.threadId, a.id)).toMatchObject({
      kind: "text",
      text: "complete extracted text",
    });
    await rm(join(root, "content", "objects", a.inputDigest ?? ""));
    expect(await store.prepare(draft.threadId, a.token)).toMatchObject({
      ok: false,
      reason: "content-missing",
    });
    const b = await store.importBytes(draft.threadId, input);
    expect(b.id).not.toBe(a.id);
    expect(b.inputDigest).toBe(a.inputDigest);
    expect(await store.prepare(draft.threadId, a.token)).toMatchObject({
      ok: true,
    });
  } finally {
    await store.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([false, true])(
  "recovers an interrupted deletion when the canonical file was already unlinked: %s",
  async (alreadyUnlinked) => {
    const root = mkdtempSync(join(tmpdir(), "dpi-delete-crash-"));
    const storage = AppStorage.open(join(root, "app.sqlite"));
    let service = createAttachmentService(
      storage,
      root,
      "unused",
      () => true,
      async () => null,
    );
    try {
      const draft = storage.drafts.create(root);
      const a = await service.store.importBytes(draft.threadId, {
        name: "orphan.txt",
        mimeType: "text/plain",
        bytes: Buffer.from("crash window"),
        source: "file",
      });
      await service.close();
      storage.database.connection
        .prepare(
          "UPDATE input_content_object SET state='deleting',last_released_at=?,reference_count=0",
        )
        .run(Date.now() - 8 * 86400000);
      if (alreadyUnlinked)
        await rm(join(root, "content", "objects", a.inputDigest ?? ""));
      service = createAttachmentService(
        storage,
        root,
        "unused",
        () => true,
        async () => null,
      );
      expect(await service.store.collectGarbage()).toMatchObject({
        deletedObjects: 1,
      });
      expect(await service.store.collectGarbage()).toMatchObject({
        deletedObjects: 0,
      });
      await expect(
        access(join(root, "content", "objects", a.inputDigest ?? "")),
      ).rejects.toThrow();
      expect(await service.store.list(draft.threadId)).toMatchObject([
        { id: a.id, status: "failed", reason: "content-missing" },
      ]);
    } finally {
      await service.close();
      storage.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it("rechecks a new durable owner arriving while file inspection is awaiting I/O", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-clean-race-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  const fs = await import("node:fs/promises");
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived = () => {};
  const atRead = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let spy: ReturnType<typeof vi.spyOn> | undefined;
  try {
    const draft = storage.drafts.create(root);
    const a = await service.store.importBytes(draft.threadId, {
      name: "race.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("retain on recheck"),
      source: "file",
    });
    storage.drafts.save(draft.threadId, 0, a.token);
    await service.store.checkStorage(draft.threadId);
    storage.drafts.save(draft.threadId, 1, "");
    await service.store.checkStorage(draft.threadId);
    const target = join(root, "content", "objects", a.inputDigest ?? "");
    let hold = true;
    const original = fs.open;
    spy = vi
      .spyOn(fs, "open")
      .mockImplementation(async (...args: Parameters<typeof open>) => {
        const handle = await original(...args);
        if (String(args[0]) === target && hold) {
          hold = false;
          arrived();
          await gate;
        }
        return handle;
      });
    const cleaning = service.store.cleanStorage(draft.threadId);
    await atRead;
    storage.drafts.save(draft.threadId, 2, a.token);
    release();
    expect(await cleaning).toMatchObject({
      deletedObjects: 0,
      retainedObjects: 1,
    });
    expect(await readFile(target, "utf8")).toBe("retain on recheck");
  } finally {
    release();
    spy?.mockRestore();
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("continues a large deduplicated source inventory without making it an unbounded object reference list", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-many-sources-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  let service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(root);
    const a = await service.store.importBytes(draft.threadId, {
      name: "shared.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("shared inventory bytes"),
      source: "file",
    });
    const unused = await service.store.importBytes(draft.threadId, {
      name: "unused.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("independent unused"),
      source: "file",
    });
    const row = storage.database.connection
      .prepare("SELECT payload FROM input_attachment WHERE id=?")
      .get(a.id);
    const original = JSON.parse(String(row?.payload));
    let lastToken = "";
    storage.database.transaction(() => {
      const insert = storage.database.connection.prepare(
        "INSERT INTO input_attachment VALUES(?,?,?)",
      );
      for (let n = 0; n < 1025; n++) {
        const id = crypto.randomUUID();
        lastToken = `[[dpi-attachment:${id}]]`;
        insert.run(
          id,
          draft.threadId,
          JSON.stringify({
            ...original,
            attachment: {
              ...original.attachment,
              id,
              token: lastToken,
              name: `source-${n}.txt`,
            },
          }),
        );
      }
    });
    storage.drafts.save(draft.threadId, 0, lastToken);
    await service.close();
    service = createAttachmentService(
      storage,
      root,
      "unused",
      () => true,
      async () => null,
    );
    let report = await service.store.cleanStorage(draft.threadId);
    expect(report).toMatchObject({
      manifestScanIncomplete: true,
      deletedObjects: 0,
    });
    for (
      let n = 0;
      n < 64 &&
      (report.manifestScanIncomplete || report.referenceScanIncomplete);
      n++
    )
      report = await service.store.cleanStorage(draft.threadId);
    expect(report).toMatchObject({
      manifestScanIncomplete: false,
      referenceScanIncomplete: false,
      retainedObjects: 1,
      deletedObjects: 1,
    });
    expect(
      await readFile(
        join(root, "content", "objects", a.inputDigest ?? ""),
        "utf8",
      ),
    ).toBe("shared inventory bytes");
    await expect(
      access(join(root, "content", "objects", unused.inputDigest ?? "")),
    ).rejects.toThrow();
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("reports a background storage failure once without exposing object or error contents", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-maintenance-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  const failed = vi.fn();
  try {
    vi.spyOn(service.store, "collectGarbage").mockResolvedValue({
      kind: "storage-report",
      checkedObjects: 1,
      remainingObjects: 0,
      retainedObjects: 0,
      unreferencedObjects: 1,
      deletedObjects: 0,
      deletedBytes: 0,
      issues: [
        {
          attachmentId: crypto.randomUUID(),
          name: "private",
          object: "original",
          reason: "storage-unavailable",
        },
      ],
      issuesTruncated: false,
    });
    service.startMaintenance(failed);
    service.startMaintenance(failed);
    await Promise.resolve();
    await Promise.resolve();
    expect(failed.mock.calls).toEqual([[]]);
    expect(service.store.collectGarbage).toHaveBeenCalledTimes(1);
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("serializes active import and queued cleanup, and drains them before closing", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-close-import-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  let release = () => {};
  let entered = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const store = new AttachmentStore({
    directory: join(root, "content"),
    database: storage.database,
    lifecycle: createAttachmentReferences(storage, (threadId, id) =>
      store.referenceSource(threadId, id),
    ),
    convertPdf: async () => {
      entered();
      await gate;
      return {
        text: "parsed",
        pageCount: 1,
        pagesNeedingOcr: [],
        hasVisualContent: false,
        converterVersion: "fixture",
      };
    },
  });
  try {
    const draft = storage.drafts.create(root);
    const importing = store.importBytes(draft.threadId, {
      name: "active.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-original"),
      source: "file",
    });
    await started;
    const cleaning = store.cleanStorage(draft.threadId);
    let finished = false;
    const closing = store.close().then(() => {
      finished = true;
    });
    await expect(store.list(draft.threadId)).rejects.toThrow("closed");
    await Promise.resolve();
    expect(finished).toBe(false);
    release();
    const item = await importing;
    expect(await cleaning).toMatchObject({
      deletedObjects: 0,
      retainedObjects: 2,
    });
    await closing;
    expect(
      await readFile(
        join(root, "content", "objects", item.inputDigest ?? ""),
        "utf8",
      ),
    ).toBe("%PDF-original");
    await store.close();
  } finally {
    release();
    await store.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("automatic cleanup honors seven days after a reference was briefly reacquired", async () => {
  const data = mkdtempSync(join(tmpdir(), "dpi-retention-repro-"));
  const storage = AppStorage.open(join(data, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    data,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(data);
    const item = await service.store.importBytes(draft.threadId, {
      name: "existing.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("keep me"),
      source: "file",
    });
    storage.drafts.save(draft.threadId, 0, item.token);
    await service.store.checkStorage(draft.threadId);
    storage.drafts.save(draft.threadId, 1, "");
    await service.store.collectGarbage();
    const now = Date.now();
    storage.database.connection
      .prepare("UPDATE input_content_object SET last_released_at=?")
      .run(now - 7 * 86400000 + 500);
    const previousPass = await service.store.collectGarbage();
    expect(previousPass.deletedObjects).toBe(0);
    // Both durable edits occur between the minute-based maintenance passes.
    storage.drafts.save(draft.threadId, 2, item.token);
    storage.drafts.save(draft.threadId, 3, "");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 1000);
    const report = await service.store.collectGarbage();
    clock.mockRestore();
    expect(report.deletedObjects).toBe(0);
    await expect(
      access(join(data, "content", "objects", item.inputDigest!)),
    ).resolves.toBeUndefined();
  } finally {
    await service.close();
    storage.close();
    rmSync(data, { recursive: true, force: true });
  }
});

it("manual cleanup releases a completed import that was durably used and removed before first scan", async () => {
  const data = mkdtempSync(join(tmpdir(), "dpi-import-release-"));
  const storage = AppStorage.open(join(data, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    data,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(data);
    const item = await service.store.importBytes(draft.threadId, {
      name: "finished.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("released original"),
      source: "file",
    });
    storage.drafts.save(draft.threadId, 0, item.token);
    storage.drafts.save(draft.threadId, 1, "");
    const report = await service.store.cleanStorage(draft.threadId);
    expect(report.retainedObjects).toBe(0);
    expect(report.deletedObjects).toBe(1);
  } finally {
    await service.close();
    storage.close();
    rmSync(data, { recursive: true, force: true });
  }
});

it("preserves durable source adoption when an in-flight PDF retry publishes an older manifest", async () => {
  const data = mkdtempSync(join(tmpdir(), "dpi-adoption-retry-"));
  const storage = AppStorage.open(join(data, "app.sqlite"));
  let release = () => {},
    entered = () => {},
    calls = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const converting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const store = new AttachmentStore({
    directory: join(data, "content"),
    database: storage.database,
    lifecycle: createAttachmentReferences(storage, (thread, id) =>
      store.referenceSource(thread, id),
    ),
    convertPdf: async () => {
      if (++calls === 1) throw Error("initial failure");
      entered();
      await gate;
      return {
        text: "repaired PDF",
        pageCount: 1,
        pagesNeedingOcr: [],
        hasVisualContent: false,
        converterVersion: "fixture",
      };
    },
  });
  try {
    const draft = storage.drafts.create(data);
    const item = await store.importBytes(draft.threadId, {
      name: "retry.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.7 original"),
      source: "file",
    });
    const retry = store.retry(draft.threadId, item.id);
    await converting;
    storage.drafts.save(draft.threadId, 0, item.token);
    storage.drafts.save(draft.threadId, 1, "");
    release();
    await retry;
    expect(
      store.referenceSource(draft.threadId, item.id)?.draftBoundRevision,
    ).toBe(1);
    expect((await store.cleanStorage(draft.threadId)).retainedObjects).toBe(0);
    await expect(
      access(join(data, "content", "objects", item.inputDigest!)),
    ).rejects.toThrow();
  } finally {
    release();
    await store.close();
    storage.close();
    rmSync(data, { recursive: true, force: true });
  }
});
it("does not durably bind a frozen source literal and counts only the real inline attachment", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-frozen-literal-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(root);
    const file = await service.store.importBytes(draft.threadId, {
      name: "literal.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("actual attachment"),
      source: "file",
    });
    const frozen = serializeReference({
      kind: "selection",
      path: "source.txt",
      source: "working-tree",
      version: "v1",
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: file.token.length + 1,
      text: file.token,
    });
    storage.drafts.save(draft.threadId, 0, frozen);
    expect(
      service.store.referenceSource(draft.threadId, file.id)
        ?.draftBoundRevision,
    ).toBeUndefined();
    const references = createAttachmentReferences(storage, (thread, id) =>
      service.store.referenceSource(thread, id),
    );
    const query = {
      digests: [file.inputDigest!],
      attachmentIds: [{ threadId: draft.threadId, id: file.id }],
    };
    expect(await references.read(query)).toMatchObject({
      complete: true,
      counts: [],
      durableAttachmentIds: [],
    });
    expect(await service.store.prepare(draft.threadId, frozen)).toMatchObject({
      ok: true,
      content: { sources: [] },
    });
    storage.drafts.save(draft.threadId, 1, `${file.token}\n${frozen}`);
    expect(
      service.store.referenceSource(draft.threadId, file.id)
        ?.draftBoundRevision,
    ).toBe(2);
    expect(await references.read(query)).toMatchObject({
      complete: true,
      counts: [{ digest: file.inputDigest, count: 1 }],
      durableAttachmentIds: [`${draft.threadId}:${file.id}`],
    });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
