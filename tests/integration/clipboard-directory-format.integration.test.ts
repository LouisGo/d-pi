import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createAttachmentService } from "../../src/app/main/wiring/attachment-service";

it.each(["documents.pdf", "images.png", "lists.docx"])(
  "freezes directory %s by its known listing format and preserves its source name",
  async (name) => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "dpi-directory-copy-")),
    );
    const sourceRoot = join(root, "source"),
      targetRoot = join(root, "target");
    mkdirSync(join(sourceRoot, name), { recursive: true });
    mkdirSync(join(targetRoot, name), { recursive: true });
    writeFileSync(join(sourceRoot, name, "one.txt"), "Do not inline this body");
    writeFileSync(join(targetRoot, name, "target.txt"), "Target conflict");
    const storage = AppStorage.open(join(root, "app.sqlite"));
    const service = createAttachmentService(
      storage,
      root,
      "unused",
      () => true,
      async () => null,
    );
    try {
      const source = storage.drafts.create(sourceRoot),
        target = storage.drafts.create(targetRoot);
      const directory = await service.store.addReference(
        source.threadId,
        name,
        "directory",
      );
      expect(
        await service.store.prepare(source.threadId, directory.token),
      ).toMatchObject({
        ok: true,
        content: { message: expect.stringContaining("one.txt") },
      });
      const reserved = service.store.reserveClipboard(
        "source",
        source.threadId,
      );
      if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
        throw Error("No clipboard ticket");
      const ticket = reserved.tickets[0];
      expect(
        await service.store.exportClipboard(
          "source",
          source.threadId,
          ticket,
          directory.token,
          [directory.id],
        ),
      ).toEqual({ kind: "clipboard-exported", degraded: false });
      rmSync(join(sourceRoot, name), { recursive: true });
      const imported = await service.store.importClipboard(
        "target",
        target.threadId,
        ticket,
      );
      if (imported.kind !== "clipboard-imported" || !imported.items[0])
        throw Error("Frozen directory unavailable");
      const item = imported.items[0];
      expect(item).toMatchObject({
        name,
        source: "paste",
        status: "ready",
        representation: "text",
        converterVersion: "directory-listing-v1",
        frozenReference: {
          projectPath: sourceRoot,
          path: name,
          kind: "directory",
        },
      });
      expect(item.id).not.toBe(directory.id);
      const preview = await service.execute(
        {
          kind: "preview",
          threadId: target.threadId,
          traceId: crypto.randomUUID(),
          id: item.id,
        },
        "target",
      );
      expect(preview).toMatchObject({
        kind: "text",
        text: expect.stringContaining("one.txt"),
      });
      const prepared = await service.store.prepare(target.threadId, item.token);
      expect(prepared).toMatchObject({ ok: true });
      if (!prepared.ok) throw Error("Frozen directory failed to prepare");
      expect(prepared.content.message).toContain("one.txt");
      expect(prepared.content.message).not.toContain("target.txt");
      expect(prepared.content.message).not.toContain("Do not inline this body");
    } finally {
      await service.close();
      storage.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
