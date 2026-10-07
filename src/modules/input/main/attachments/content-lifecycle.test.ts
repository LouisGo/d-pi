import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AppDatabase } from "../../../../platform/main/storage/public";
import { AttachmentSchema } from "../../contracts/public";
import {
  type AttachmentReferences,
  ContentLifecycle,
  type ContentManifest,
} from "./content-lifecycle";
import { EditorHistoryLeases } from "./editor-history";

it("rechecks a transient history epoch created after its SQLite owner snapshot and before actual unlink", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-history-race-"));
  const database = new AppDatabase(join(root, "app.sqlite"));
  database.completeSchemaMigrations();
  mkdirSync(join(root, "objects"));
  const bytes = Buffer.alloc(8 * 1024 * 1024, "x");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const object = join(root, "objects", hash);
  writeFileSync(object, bytes);
  const snapshot: AttachmentReferences = {
    version: 0,
    complete: true,
    counts: [],
    durableAttachmentIds: [],
    frozenDigests: [],
    sources: [],
    sourcesTruncated: false,
  };
  let pinned = false,
    reads = 0;
  const collector = new ContentLifecycle({
    directory: root,
    database,
    manifestVersion: () => 0,
    scanManifests: () => ({ items: [], cursor: 0, complete: true }),
    issueManifests: () => ({ items: [], complete: true }),
    maxObjectBytes: bytes.length,
    references: {
      version: () => 0,
      read: async () => {
        if (reads++ === 0)
          setTimeout(() => {
            collector.setEditorHistory("new-epoch", new Set([hash]));
            pinned = true;
          }, 0);
        return snapshot;
      },
    },
  });
  collector.register(hash, bytes.length);
  try {
    const protectedReport = await collector.run("manual");
    expect(pinned).toBe(true);
    expect(protectedReport.deletedObjects).toBe(0);
    expect(reads).toBeGreaterThan(1);
    expect(existsSync(object)).toBe(true);
    collector.setEditorHistory("new-epoch", null);
    expect((await collector.run("manual")).deletedObjects).toBe(1);
    expect(existsSync(object)).toBe(false);
  } finally {
    await collector.close();
    database.connection.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("rechecks a same-ID manifest publication that adds a derived digest while GC awaits its object read", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-history-publish-race-"));
  const database = new AppDatabase(join(root, "app.sqlite"));
  database.completeSchemaMigrations();
  mkdirSync(join(root, "objects"));
  const bytes = Buffer.alloc(8 * 1024 * 1024, "d");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const input = createHash("sha256").update("PDF original").digest("hex");
  writeFileSync(join(root, "objects", hash), bytes);
  writeFileSync(join(root, "objects", input), "PDF original");
  const threadId = crypto.randomUUID(),
    id = crypto.randomUUID();
  let manifest: ContentManifest = {
    attachment: AttachmentSchema.parse({
      schemaVersion: 1,
      id,
      threadId,
      token: `[[dpi-attachment:${id}]]`,
      name: "retry.pdf",
      mimeType: "application/pdf",
      byteLength: 12,
      capturedAt: new Date().toISOString(),
      source: "paste",
      status: "ready",
      representation: "pdf-text",
      coverageGaps: [],
      textOnly: false,
      inputDigest: input,
    }),
  };
  let published = false,
    reads = 0;
  const snapshot: AttachmentReferences = {
    version: 0,
    complete: true,
    counts: [],
    durableAttachmentIds: [],
    frozenDigests: [],
    sources: [],
    sourcesTruncated: false,
  };
  const collector = new ContentLifecycle({
    directory: root,
    database,
    manifestVersion: () => 0,
    scanManifests: () => ({ items: [], cursor: 0, complete: true }),
    issueManifests: () => ({ items: [], complete: true }),
    maxObjectBytes: bytes.length,
    references: {
      version: () => 0,
      read: async () => {
        if (reads++ === 0)
          setTimeout(() => {
            const updated = { ...manifest, derivedDigest: hash };
            published = leases.publishManifest(updated, () => {
              manifest = updated;
            });
          }, 0);
        return snapshot;
      },
    },
  });
  collector.register(hash, bytes.length);
  collector.register(input, 12);
  const leases = new EditorHistoryLeases({
    manifest: () => manifest,
    objectBytes: (digest) => (digest === hash ? bytes.length : 12),
    pin: (id, digests) => collector.setEditorHistory(id, digests),
  });
  const opened = leases.open("document", threadId, crypto.randomUUID());
  if (opened.kind !== "history-lease") throw Error("not opened");
  leases.update("document", threadId, opened.leaseId, 1, [id]);
  try {
    expect((await collector.run("manual")).deletedObjects).toBe(0);
    expect(published).toBe(true);
    expect(reads).toBeGreaterThan(1);
    expect(existsSync(join(root, "objects", hash))).toBe(true);
    leases.releaseOwner("document");
    expect((await collector.run("manual")).deletedObjects).toBe(2);
    expect(existsSync(join(root, "objects", hash))).toBe(false);
  } finally {
    leases.dispose();
    await collector.close();
    database.connection.close();
    rmSync(root, { recursive: true, force: true });
  }
});
