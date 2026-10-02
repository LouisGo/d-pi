import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AttachmentRequestSchema } from "../../src/app/contracts/attachments";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createAttachmentService } from "../../src/app/main/wiring/attachment-service";
import { createAttachmentBridge } from "../../src/app/preload/bridges/attachments";
import { ThreadIdSchema } from "../../src/shared/identity";

it("large text preview crosses the validated preload boundary without truncating the frozen send", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-preview-"));
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
    const text = "preview source\n".repeat(80000);
    const item = await service.store.importBytes(draft.threadId, {
      name: "large.txt",
      mimeType: "text/plain",
      bytes: Buffer.from(text),
      source: "file",
    });
    const bridge = createAttachmentBridge({
      invoke: async (_channel, request) =>
        service.execute(AttachmentRequestSchema.parse(request)),
    }).attachments;
    const preview = await bridge.request({
      kind: "preview",
      id: item.id,
      threadId: ThreadIdSchema.parse(draft.threadId),
      traceId: crypto.randomUUID(),
    });
    expect(preview).toMatchObject({ kind: "text", truncated: true });
    if (preview.kind === "text")
      expect(Buffer.byteLength(preview.text)).toBeLessThanOrEqual(64 * 1024);
    // Transport refuses the actual oversized content rather than sending the preview slice.
    expect(
      await service.store.prepare(draft.threadId, item.token),
    ).toMatchObject({ ok: false, reason: "transport-too-large" });
  } finally {
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
});
