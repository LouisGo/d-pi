import {
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { AppStorage } from "./app-storage";
import { createAttachmentService } from "./attachment-service";

vi.mock("../../../platform/node/images/public", () => ({
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

it("copies only owned selected private images, freezes through cut/GC, remaps every paste and releases source-document tickets", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-clipboard-")));
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
    const image = await service.store.importBytes(source.threadId, {
      name: "image.png",
      mimeType: "image/png",
      source: "paste",
      bytes: Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
        "hex",
      ),
    });
    expect(image.status).toBe("ready");
    storage.drafts.save(source.threadId, 0, image.token);
    const identity = {
      threadId: source.threadId,
      traceId: crypto.randomUUID(),
    };
    const reserved = await service.execute(
      { ...identity, kind: "clipboard-reserve" },
      "document",
    );
    expect(reserved?.kind).toBe("clipboard-tickets");
    if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
      throw Error("no tickets");
    const ticket = reserved.tickets[0];
    const pending = service.execute(
      {
        threadId: target.threadId,
        traceId: crypto.randomUUID(),
        kind: "clipboard-import",
        ticket,
      },
      "target-document",
    );
    expect(
      await service.execute(
        {
          ...identity,
          kind: "clipboard-export",
          ticket,
          text: `selected ${image.token}`,
          ids: [image.id],
        },
        "document",
      ),
    ).toEqual({ kind: "clipboard-exported", degraded: false });
    storage.drafts.save(source.threadId, 1, "cut");
    await service.store.cleanStorage(source.threadId);
    expect(
      existsSync(
        join(root, "content", "objects", image.inputDigest ?? "missing"),
      ),
    ).toBe(true);
    const first = await pending;
    expect(first.kind).toBe("clipboard-imported");
    if (first.kind !== "clipboard-imported") throw Error("no import");
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      threadId: target.threadId,
      inputDigest: image.inputDigest,
    });
    expect(first.items[0]?.id).not.toBe(image.id);
    expect(first.text).toBe(`selected ${first.items[0]?.token}`);
    const second = await service.execute(
      {
        threadId: target.threadId,
        traceId: crypto.randomUUID(),
        kind: "clipboard-import",
        ticket,
      },
      "target-document",
    );
    if (second.kind !== "clipboard-imported") throw Error("no second import");
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect(
      await service.execute(
        {
          ...identity,
          kind: "clipboard-export",
          ticket,
          text: "overwrite",
          ids: [],
        },
        "document",
      ),
    ).toMatchObject({ kind: "clipboard-unavailable", reason: "invalid" });
    service.store.releaseEditorHistories("document");
    expect(
      await service.execute(
        {
          threadId: target.threadId,
          traceId: crypto.randomUUID(),
          kind: "clipboard-import",
          ticket,
        },
        "target-document",
      ),
    ).toMatchObject({ kind: "clipboard-unavailable" });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("refuses foreign source assets, forged instances and missing references without creating partial target assets", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-clipboard-auth-")));
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
    const ref = await service.store.addReference(source.threadId, "README.md");
    const identity = {
      threadId: source.threadId,
      traceId: crypto.randomUUID(),
    };
    const reserved = await service.execute(
      { ...identity, kind: "clipboard-reserve" },
      "document",
    );
    if (
      reserved.kind !== "clipboard-tickets" ||
      !reserved.tickets[0] ||
      !reserved.tickets[1]
    )
      throw Error("no tickets");
    const ticket = reserved.tickets[0];
    expect(
      await service.execute(
        {
          ...identity,
          kind: "clipboard-export",
          ticket,
          text: ref.token,
          ids: [ref.id],
        },
        "foreign-document",
      ),
    ).toMatchObject({ kind: "clipboard-unavailable", reason: "invalid" });
    expect(
      await service.execute(
        {
          ...identity,
          kind: "clipboard-export",
          ticket,
          text: ref.token,
          ids: [ref.id],
        },
        "document",
      ),
    ).toMatchObject({ kind: "clipboard-unavailable", reason: "failed" });
    const imported = await service.execute(
      {
        threadId: target.threadId,
        traceId: crypto.randomUUID(),
        kind: "clipboard-import",
        ticket,
      },
      "target-document",
    );
    expect(imported).toMatchObject({
      kind: "clipboard-unavailable",
      reason: "invalid",
    });
    expect(await service.store.list(target.threadId)).toEqual([]);
    expect(
      await service.execute(
        {
          ...identity,
          kind: "clipboard-import",
          ticket: { ...ticket, instanceId: crypto.randomUUID() },
        },
        "document",
      ),
    ).toMatchObject({ kind: "clipboard-unavailable", reason: "invalid" });
    expect(
      await service.execute(
        {
          threadId: target.threadId,
          traceId: crypto.randomUUID(),
          kind: "clipboard-export",
          ticket: reserved.tickets[1],
          text: ref.token,
          ids: [ref.id],
        },
        "document",
      ),
    ).toMatchObject({ kind: "clipboard-unavailable", reason: "invalid" });
    for (let i = 0; i < 3; i++)
      await service.execute(
        { ...identity, kind: "clipboard-reserve" },
        "document",
      );
    expect(
      await service.execute(
        { ...identity, kind: "clipboard-reserve" },
        "document",
      ),
    ).toMatchObject({ kind: "clipboard-unavailable", reason: "busy" });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("does not promote literal tokens or foreign manifests, verifies captured bytes, and bounds unadopted import handoff", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "dpi-clipboard-bounds-")),
  );
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
    const image = await service.store.importBytes(source.threadId, {
      name: "private.png",
      mimeType: "image/png",
      source: "paste",
      bytes: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    const identity = {
      threadId: source.threadId,
      traceId: crypto.randomUUID(),
    };
    const reserved = await service.execute(
      { ...identity, kind: "clipboard-reserve" },
      "document",
    );
    if (
      reserved.kind !== "clipboard-tickets" ||
      !reserved.tickets[0] ||
      !reserved.tickets[1]
    )
      throw Error("no tickets");
    expect(
      await service.execute(
        {
          ...identity,
          kind: "clipboard-export",
          ticket: reserved.tickets[0],
          text: image.token,
          ids: [],
        },
        "document",
      ),
    ).toMatchObject({ kind: "clipboard-exported", degraded: true });
    expect(
      await service.execute(
        { ...identity, kind: "clipboard-import", ticket: reserved.tickets[0] },
        "document",
      ),
    ).toMatchObject({
      kind: "clipboard-imported",
      text: "[d-pi:attachment unavailable]",
      items: [],
    });
    expect(
      await service.execute(
        {
          threadId: target.threadId,
          traceId: crypto.randomUUID(),
          kind: "clipboard-export",
          ticket: reserved.tickets[1],
          text: image.token,
          ids: [image.id],
        },
        "document",
      ),
    ).toMatchObject({ reason: "invalid" });
    expect(
      await service.execute(
        {
          ...identity,
          kind: "clipboard-export",
          ticket: reserved.tickets[1],
          text: image.token,
          ids: [image.id],
        },
        "document",
      ),
    ).toMatchObject({ kind: "clipboard-exported" });
    expect(
      await service.store.prepare(target.threadId, image.token),
    ).toMatchObject({ ok: false, reason: "attachment-not-found" });
    const importedIds: string[] = [];
    for (let i = 0; i < 128; i++) {
      const reply = await service.execute(
        {
          threadId: target.threadId,
          traceId: crypto.randomUUID(),
          kind: "clipboard-import",
          ticket: reserved.tickets[1],
        },
        "target-document",
      );
      expect(reply.kind).toBe("clipboard-imported");
      if (reply.kind === "clipboard-imported" && reply.items[0])
        importedIds.push(reply.items[0].id);
    }
    expect(new Set(importedIds).size).toBe(128);
    expect(readdirSync(join(root, "content", "objects"))).toHaveLength(1);
    expect(
      await service.execute(
        {
          threadId: target.threadId,
          traceId: crypto.randomUUID(),
          kind: "clipboard-import",
          ticket: reserved.tickets[1],
        },
        "target-document",
      ),
    ).toMatchObject({ reason: "busy" });
    await service.execute(
      {
        threadId: target.threadId,
        traceId: crypto.randomUUID(),
        kind: "clipboard-discard",
        ids: importedIds.slice(0, 32),
      },
      "foreign-document",
    );
    expect(
      await service.execute(
        {
          threadId: target.threadId,
          traceId: crypto.randomUUID(),
          kind: "clipboard-import",
          ticket: reserved.tickets[1],
        },
        "target-document",
      ),
    ).toMatchObject({ reason: "busy" });
    await service.execute(
      {
        threadId: target.threadId,
        traceId: crypto.randomUUID(),
        kind: "clipboard-discard",
        ids: importedIds.slice(0, 32),
      },
      "target-document",
    );
    expect(
      await service.execute(
        {
          threadId: target.threadId,
          traceId: crypto.randomUUID(),
          kind: "clipboard-import",
          ticket: reserved.tickets[1],
        },
        "target-document",
      ),
    ).toMatchObject({ kind: "clipboard-imported" });
    writeFileSync(
      join(root, "content", "objects", image.inputDigest ?? "missing"),
      "corrupted",
    );
    expect(
      await service.execute(
        {
          threadId: target.threadId,
          traceId: crypto.randomUUID(),
          kind: "clipboard-import",
          ticket: reserved.tickets[1],
        },
        "target-document",
      ),
    ).toMatchObject({ reason: "failed" });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
