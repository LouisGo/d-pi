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
