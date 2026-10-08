import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { AttachmentRequestSchema } from "../../src/app/contracts/attachments";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createAttachmentService } from "../../src/app/main/wiring/attachment-service";
import {
  AttachmentStore,
  type AttachmentStoreOptions,
} from "../../src/modules/input/main/public";

vi.mock("electron", () => ({ utilityProcess: {} }));
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-live-preview-")));
  const project = join(root, "project");
  mkdirSync(project);
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const draft = storage.drafts.create(project);
  const service = createAttachmentService(
    storage,
    join(root, "data"),
    "unused",
    () => true,
    async () => null,
  );
  const preview = (id: string, threadId = draft.threadId) =>
    service.execute(
      AttachmentRequestSchema.parse({
        kind: "preview",
        threadId,
        id,
        traceId: crypto.randomUUID(),
      }),
    );
  const manifest = (id: string) =>
    storage.database.connection
      .prepare("SELECT payload FROM input_attachment WHERE id=?")
      .get(id)?.payload;
  return {
    root,
    project,
    storage,
    draft,
    service,
    preview,
    manifest,
    close: async () => {
      await service.close();
      storage.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
it("previews live project text without freezing its manifest, private bytes or execution permission", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.project, "beta.ts"), "export const beta = 1;\n");
    const item = await f.service.store.addReference(
      f.draft.threadId,
      "beta.ts",
    );
    const before = f.manifest(item.id);
    expect(await f.preview(item.id)).toEqual({
      kind: "text",
      text: "export const beta = 1;\n",
    });
    writeFileSync(join(f.project, "beta.ts"), "export const beta = 2;\n");
    expect(await f.preview(item.id)).toEqual({
      kind: "text",
      text: "export const beta = 2;\n",
    });
    const other = f.storage.drafts.create(f.project);
    expect(await f.preview(item.id, other.threadId)).toEqual({
      kind: "unavailable",
      reason: "attachment-not-found",
    });
    expect(f.manifest(item.id)).toBe(before);
    expect(
      f.storage.database.connection
        .prepare("SELECT COUNT(*) AS n FROM input_content_object")
        .get()?.n,
    ).toBe(0);
    expect(
      f.storage.threads.executionGrant(f.draft.workingDirectoryId),
    ).toBeNull();
  } finally {
    await f.close();
  }
});
it("previews a directory's current direct names and kinds without reading nested file bodies", async () => {
  const f = fixture();
  try {
    mkdirSync(join(f.project, "selected.pdf", "nested"), { recursive: true });
    writeFileSync(
      join(f.project, "selected.pdf", "beta.ts"),
      "never inline this body",
    );
    const item = await f.service.store.addReference(
      f.draft.threadId,
      "selected.pdf",
      "directory",
    );
    const before = f.manifest(item.id);
    const reply = await f.preview(item.id);
    expect(reply.kind).toBe("text");
    if (reply.kind !== "text") throw Error("missing listing");
    expect(JSON.parse(reply.text)).toEqual({
      schemaVersion: 1,
      path: "selected.pdf",
      entries: [
        { name: "beta.ts", kind: "file" },
        { name: "nested", kind: "directory" },
      ],
    });
    expect(reply.text).not.toContain("never inline");
    writeFileSync(join(f.project, "selected.pdf", "new.ts"), "new body");
    const updated = await f.preview(item.id);
    expect(updated.kind === "text" && updated.text.includes("new.ts")).toBe(
      true,
    );
    expect(f.manifest(item.id)).toBe(before);
  } finally {
    await f.close();
  }
});
it("rejects escaped, missing and unsupported live sources with their actual typed cause", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "secret.ts"), "secret");
    symlinkSync(join(f.root, "secret.ts"), join(f.project, "escape.ts"));
    writeFileSync(join(f.project, "binary.bin"), Buffer.from([0, 1, 2]));
    for (const [path, reason] of [
      ["escape.ts", "reference-denied"],
      ["missing.ts", "reference-unavailable"],
      ["binary.bin", "unsupported-format"],
    ] as const) {
      const item = await f.service.store.addReference(f.draft.threadId, path);
      expect(await f.preview(item.id)).toEqual({ kind: "unavailable", reason });
    }
  } finally {
    await f.close();
  }
});
it("bounds UTF-8 preview to 64 KiB and maps the real 25 MiB read guard to source-too-large", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.project, "large.ts"), `${"a".repeat(65535)}😀tail`);
    const text = await f.service.store.addReference(
      f.draft.threadId,
      "large.ts",
    );
    const preview = await f.preview(text.id);
    expect(preview.kind).toBe("text");
    if (preview.kind !== "text") throw Error("missing text preview");
    expect(preview.truncated).toBe(true);
    expect(Buffer.byteLength(preview.text)).toBe(65535);
    expect(/^a+$/.test(preview.text)).toBe(true);
    writeFileSync(join(f.project, "oversized.ts"), "");
    truncateSync(join(f.project, "oversized.ts"), 25 * 1024 * 1024 + 1);
    const big = await f.service.store.addReference(
      f.draft.threadId,
      "oversized.ts",
    );
    expect(await f.preview(big.id)).toEqual({
      kind: "unavailable",
      reason: "source-too-large",
    });
    expect(
      await f.service.store.prepare(f.draft.threadId, big.token),
    ).toMatchObject({ ok: false, reason: "source-too-large" });
    expect(
      f.storage.database.connection
        .prepare("SELECT COUNT(*) AS n FROM input_content_object")
        .get()?.n,
    ).toBe(0);
  } finally {
    await f.close();
  }
});
it.each([
  ["no-reader", "reference-unavailable"],
  ["denied", "reference-denied"],
  ["too-large", "source-too-large"],
  ["read-failed", "reference-unavailable"],
  ["not-current", "reference-denied"],
  ["over-limit", "source-too-large"],
] as const)(
  "preserves the %s read boundary without publishing a preview snapshot",
  async (mode, reason) => {
    const f = fixture();
    const read = vi.fn<NonNullable<AttachmentStoreOptions["readReference"]>>(
      async () => {
        if (mode === "denied") throw Error("reference-denied");
        if (mode === "too-large") throw Error("source-too-large");
        if (mode === "read-failed") throw Error("changed or unreadable");
        return {
          bytes: Buffer.from("ab"),
          version: "fixture",
          current: () => mode !== "not-current",
        };
      },
    );
    const store = new AttachmentStore({
      directory: join(f.root, "stub-content"),
      database: f.storage.database,
      ...(mode === "no-reader" ? {} : { readReference: read }),
      limits: {
        sourceBytes: mode === "over-limit" ? 1 : 25 * 1024 * 1024,
        submissionBytes: 100 * 1024 * 1024,
        encodedBytes: 1024 * 1024,
        storageBytes: 1024 * 1024 * 1024,
      },
    });
    try {
      const item = await store.addReference(f.draft.threadId, "beta.ts");
      const before = f.manifest(item.id);
      expect(await store.preview(f.draft.threadId, item.id)).toEqual({
        kind: "unavailable",
        reason,
      });
      expect(f.manifest(item.id)).toBe(before);
      expect(read).toHaveBeenCalledTimes(mode === "no-reader" ? 0 : 1);
    } finally {
      await store.close();
      await f.close();
    }
  },
);
