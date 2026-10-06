import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ThreadIdSchema } from "../../../shared/identity";
import { AppStorage } from "./app-storage";
import { createAttachmentService } from "./attachment-service";

it("freezes an @ image from the real authorised project read and rejects escaping symlinks", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-ref-"));
  const project = join(root, "project");
  mkdirSync(project);
  const storage = AppStorage.open(join(root, "app.sqlite"));
  try {
    const draft = storage.drafts.create(project);
    const service = createAttachmentService(
      storage,
      join(root, "data"),
      "unused",
      () => true,
      async () => null,
    );
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
      "base64",
    );
    writeFileSync(join(project, "image.png"), bytes);
    const item = await service.store.addReference(draft.threadId, "image.png");
    const frozen = await service.store.prepare(draft.threadId, item.token);
    expect(frozen).toMatchObject({
      ok: true,
      content: {
        images: [{ data: bytes.toString("base64"), mimeType: "image/png" }],
      },
    });
    writeFileSync(join(root, "outside.txt"), "secret");
    symlinkSync(join(root, "outside.txt"), join(project, "escape.txt"));
    const outside = await service.store.addReference(
      draft.threadId,
      "escape.txt",
    );
    expect(
      await service.store.prepare(draft.threadId, outside.token),
    ).toMatchObject({ ok: false, reason: "reference-denied" });
    writeFileSync(join(project, "image.png"), "changed");
    expect(frozen).toMatchObject({
      ok: true,
      content: { images: [{ data: bytes.toString("base64") }] },
    });
  } finally {
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("privately captures a valid large pasted source without recursive Base64 validation overflow", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-base64-"));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  try {
    const draft = storage.drafts.create(root);
    const service = createAttachmentService(
      storage,
      root,
      "unused",
      () => true,
      async () => null,
    );
    const data = Buffer.from("source line\n".repeat(500000));
    const reply = await service.execute({
      kind: "import-bytes",
      threadId: ThreadIdSchema.parse(draft.threadId),
      traceId: crypto.randomUUID(),
      name: "large.txt",
      mimeType: "text/plain",
      source: "paste",
      dataBase64: data.toString("base64"),
    });
    expect(reply).toMatchObject({
      kind: "attachments",
      items: [{ status: "ready", byteLength: data.byteLength }],
    });
    if (reply.kind === "attachments" && reply.items[0])
      expect(
        await service.store.prepare(draft.threadId, reply.items[0].token),
      ).toMatchObject({ ok: false, reason: "transport-too-large" });
    expect(
      await service.execute({
        kind: "import-bytes",
        threadId: ThreadIdSchema.parse(draft.threadId),
        traceId: crypto.randomUUID(),
        name: "bad.txt",
        mimeType: "text/plain",
        source: "paste",
        dataBase64: "not!base64",
      }),
    ).toMatchObject({ kind: "unavailable", reason: "content-corrupt" });
  } finally {
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("freezes a typed directory listing at send, preserves it after edits and rejects foreign directory reads", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-dir-ref-"));
  const project = join(root, "project");
  mkdirSync(join(project, "@virtualList.pdf", "utils"), { recursive: true });
  writeFileSync(
    join(project, "@virtualList.pdf", "index.ts"),
    "never-inline-this-body",
  );
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    join(root, "data"),
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(project);
    const reply = await service.execute({
      kind: "add-reference",
      threadId: draft.threadId,
      traceId: crypto.randomUUID(),
      path: "@virtualList.pdf",
      referenceKind: "directory",
    });
    expect(reply.kind).toBe("attachments");
    if (reply.kind !== "attachments") throw Error("missing reference");
    const item = reply.items[0];
    if (!item) throw Error("missing item");
    expect(item.referenceKind).toBe("directory");
    const frozen = await service.store.prepare(draft.threadId, item.token);
    expect(frozen).toMatchObject({
      ok: true,
      content: {
        sources: [
          {
            path: "@virtualList.pdf",
            referenceKind: "directory",
            converterVersion: "directory-listing-v1",
          },
        ],
      },
    });
    if (!frozen.ok) throw Error("directory not prepared");
    expect(frozen.content.message).toContain("directory listing");
    expect(frozen.content.message).toContain('"kind":"directory"');
    expect(frozen.content.message).toContain("index.ts");
    expect(frozen.content.message).not.toContain("never-inline-this-body");
    writeFileSync(join(project, "@virtualList.pdf", "later.ts"), "later");
    const second = await service.store.prepare(draft.threadId, item.token);
    expect(second.ok).toBe(true);
    expect(frozen.content.message).not.toContain("later.ts");
    if (second.ok) expect(second.content.message).toContain("later.ts");
    expect((await service.store.list(draft.threadId))[0]?.referenceKind).toBe(
      "directory",
    );
    mkdirSync(join(root, "outside"));
    symlinkSync(join(root, "outside"), join(project, "escape"));
    const escape = await service.store.addReference(
      draft.threadId,
      "escape",
      "directory",
    );
    expect(
      await service.store.prepare(draft.threadId, escape.token),
    ).toMatchObject({ ok: false, reason: "reference-denied" });
    const file = await service.store.addReference(
      draft.threadId,
      "@virtualList.pdf/index.ts",
    );
    expect(
      await service.store.prepare(draft.threadId, file.token),
    ).toMatchObject({ ok: true });
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("rejects an oversized directory listing without silently truncating the frozen input", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-large-dir-ref-"));
  const project = join(root, "project");
  mkdirSync(join(project, "big"), { recursive: true });
  for (let i = 0; i < 501; i++)
    writeFileSync(join(project, "big", `${i}.ts`), "x");
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    join(root, "data"),
    "unused",
    () => true,
    async () => null,
  );
  try {
    const draft = storage.drafts.create(project);
    const item = await service.store.addReference(
      draft.threadId,
      "big",
      "directory",
    );
    expect(
      await service.store.prepare(draft.threadId, item.token),
    ).toMatchObject({
      ok: false,
      reason: "source-too-large",
      attachmentId: item.id,
    });
    expect((await service.store.list(draft.threadId))[0]?.token).toBe(
      item.token,
    );
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
