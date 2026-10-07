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
import {
  type AttachmentReferences,
  ContentLifecycle,
} from "./content-lifecycle";

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
