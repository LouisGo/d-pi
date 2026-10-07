import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { EditorHistoryLimitError } from "../../../modules/input/main/public";
import { AppStorage } from "./app-storage";
import { createAttachmentService } from "./attachment-service";

it("keeps adopted originals sendable after removal and never revives a released editor lease", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-history-")));
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
    const item = await service.store.importBytes(draft.threadId, {
      name: "original.txt",
      mimeType: "text/plain",
      source: "paste",
      bytes: new TextEncoder().encode("original"),
    });
    storage.drafts.save(draft.threadId, 0, item.token);
    const identity = { threadId: draft.threadId, traceId: crypto.randomUUID() };
    const opened = await service.execute(
      { ...identity, kind: "history-open", epoch: crypto.randomUUID() },
      "renderer-document",
    );
    expect(opened.kind).toBe("history-lease");
    if (opened.kind !== "history-lease") throw Error("lease unavailable");
    expect(
      await service.execute(
        {
          ...identity,
          kind: "history-update",
          leaseId: opened.leaseId,
          version: 1,
          ids: [item.id],
        },
        "renderer-document",
      ),
    ).toMatchObject({ kind: "history-lease", version: 1 });
    storage.drafts.save(draft.threadId, 1, "removed");
    const object = join(
      root,
      "content",
      "objects",
      item.inputDigest ?? "missing",
    );
    await service.store.cleanStorage(draft.threadId);
    expect(existsSync(object)).toBe(true);
    expect(
      await service.store.prepare(draft.threadId, item.token),
    ).toMatchObject({ ok: true });
    await service.execute(
      { ...identity, kind: "history-release", leaseId: opened.leaseId },
      "renderer-document",
    );
    expect(
      await service.execute(
        {
          ...identity,
          kind: "history-update",
          leaseId: opened.leaseId,
          version: 2,
          ids: [item.id],
        },
        "renderer-document",
      ),
    ).toMatchObject({ kind: "unavailable" });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("binds leases to Main manifests, a document and Thread, bounds epoch count and releases a whole document", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-history-owner-")));
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
    const foreign = storage.drafts.create(root);
    const item = await service.store.importBytes(foreign.threadId, {
      name: "foreign.txt",
      mimeType: "text/plain",
      source: "paste",
      bytes: new TextEncoder().encode("foreign"),
    });
    const identity = { threadId: draft.threadId, traceId: crypto.randomUUID() };
    const opened = await service.execute(
      { ...identity, kind: "history-open", epoch: crypto.randomUUID() },
      "document",
    );
    if (opened.kind !== "history-lease") throw Error("lease unavailable");
    const update = {
      ...identity,
      kind: "history-update" as const,
      leaseId: opened.leaseId,
      version: 1,
      ids: [item.id],
    };
    expect(await service.execute(update, "document")).toMatchObject({
      kind: "unavailable",
      reason: "attachment-not-found",
    });
    expect(
      await service.execute({ ...update, ids: [] }, "another-document"),
    ).toMatchObject({ kind: "unavailable" });
    for (let i = 0; i < 8; i++)
      expect(
        (
          await service.execute(
            { ...identity, kind: "history-open", epoch: crypto.randomUUID() },
            "document",
          )
        ).kind,
      ).toBe("history-lease");
    expect(
      await service.execute(
        { ...identity, kind: "history-open", epoch: crypto.randomUUID() },
        "document",
      ),
    ).toEqual({ kind: "history-limit" });
    service.store.releaseEditorHistories("document");
    expect(
      (
        await service.execute(
          { ...identity, kind: "history-open", epoch: crypto.randomUUID() },
          "document",
        )
      ).kind,
    ).toBe("history-lease");
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("reports a history publication budget refusal accurately rather than as a PDF conversion failure", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-history-reply-")));
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
    const retry = vi
      .spyOn(service.store, "retry")
      .mockRejectedValue(new EditorHistoryLimitError());
    expect(
      await service.execute(
        {
          kind: "retry",
          threadId: draft.threadId,
          id: crypto.randomUUID(),
          traceId: crypto.randomUUID(),
        },
        "document",
      ),
    ).toEqual({ kind: "unavailable", reason: "editor-history-limit" });
    retry.mockRestore();
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
