import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  type Dir,
  fsyncSync,
  openSync,
  unlinkSync,
} from "node:fs";
import { open, opendir } from "node:fs/promises";
import { join } from "node:path";
import type { AppDatabase } from "../../../../platform/main/storage/public";
import type {
  Attachment,
  AttachmentStorageReport,
} from "../../contracts/public";

export interface AttachmentReferenceQuery {
  digests: string[];
  attachmentIds: { threadId: string; id: string }[];
  reportThreadId?: string;
}
export interface AttachmentSource {
  draftBoundRevision?: number | undefined;
  attachmentId: string;
  threadId: string;
  name: string;
  inputDigest?: string | undefined;
  derivedDigest?: string | undefined;
}
export interface AttachmentReferenceReader {
  read(query: AttachmentReferenceQuery): Promise<AttachmentReferences>;
  version(): number;
}
export interface AttachmentReferences {
  version: number;
  complete: boolean;
  counts: { digest: string; count: number }[];
  durableAttachmentIds: string[];
  frozenDigests: string[];
  sources: {
    digest: string;
    attachmentId: string;
    threadId: string;
    name: string;
    object: "original" | "derived";
  }[];
  sourcesTruncated: boolean;
}
export interface ContentManifest {
  attachment: Attachment;
  derivedDigest?: string | undefined;
}
const RETENTION = 7 * 86400000;
const BATCH = 32;
const SCAN_BYTES = 32 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
/** The counts are a repairable projection, never authority for deletion. */
export class ContentLifecycle {
  private readonly pendingImports = new Map<
    string,
    { threadId: string; id: string; digests: Set<string> }
  >();
  private readonly editorHistories = new Map<string, Set<string>>();
  private transientEpoch = 0;
  setEditorHistory(id: string, digests: Set<string> | null): void {
    if (digests) this.editorHistories.set(id, digests);
    else this.editorHistories.delete(id);
    this.transientEpoch++;
  }
  private readonly pendingPreparations = new Set<string>();
  private directory: Dir | undefined;
  private scanStarted = 0;
  private lastScanStarted = 0;
  private manifestCursor = 0;
  private manifestRevision = -1;
  private manifestComplete = false;
  constructor(
    private readonly options: {
      directory: string;
      database: Pick<AppDatabase, "connection">;
      references: AttachmentReferenceReader;
      manifestVersion: () => number;
      scanManifests: (cursor: number) => {
        items: ContentManifest[];
        cursor: number;
        complete: boolean;
      };
      issueManifests: (
        hashes: string[],
        threadId?: string,
      ) => { items: ContentManifest[]; complete: boolean };
      maxObjectBytes: number;
    },
  ) {}
  private get db() {
    return this.options.database.connection;
  }
  register(hash: string, bytes: number): void {
    this.db
      .prepare(`INSERT INTO input_content_object(digest,byte_length,last_released_at) VALUES(?,?,?)
      ON CONFLICT(digest) DO UPDATE SET byte_length=excluded.byte_length,state='available',problem=NULL,
      last_released_at=CASE WHEN state='deleted' THEN excluded.last_released_at ELSE last_released_at END`)
      .run(hash, bytes, Date.now());
  }
  failure(
    hashes: (string | undefined)[],
  ): "content-missing" | "content-corrupt" | "storage-unavailable" | undefined {
    for (const hash of hashes) {
      if (!hash) continue;
      const row = this.db
        .prepare("SELECT problem FROM input_content_object WHERE digest=?")
        .get(hash);
      if (
        row?.problem === "content-missing" ||
        row?.problem === "content-corrupt" ||
        row?.problem === "storage-unavailable"
      )
        return row.problem;
    }
    return undefined;
  }
  pinImport(threadId: string, id: string, hash: string): void {
    const key = `${threadId}:${id}`;
    const pin = this.pendingImports.get(key) ?? {
      threadId,
      id,
      digests: new Set<string>(),
    };
    pin.digests.add(hash);
    this.pendingImports.set(key, pin);
  }
  releaseImport(threadId: string, id: string): void {
    this.pendingImports.delete(`${threadId}:${id}`);
    this.transientEpoch++;
  }
  pinPreparation(hashes: string[]): void {
    for (const hash of hashes) this.pendingPreparations.add(hash);
  }
  private references(
    snapshot: AttachmentReferences,
    candidates: Set<string>,
  ): Map<string, number> {
    const counts = new Map(
      snapshot.counts.map((row) => [row.digest, row.count]),
    );
    const add = (hash: string) => {
      if (candidates.has(hash)) counts.set(hash, (counts.get(hash) ?? 0) + 1);
    };
    const durableIds = new Set(snapshot.durableAttachmentIds);
    for (const [key, pin] of this.pendingImports) {
      if (![...pin.digests].some((hash) => candidates.has(hash))) continue;
      if (durableIds.has(key)) this.pendingImports.delete(key);
      else for (const hash of pin.digests) add(hash);
    }
    const frozen = new Set(snapshot.frozenDigests);
    for (const hash of this.pendingPreparations) {
      if (frozen.has(hash)) this.pendingPreparations.delete(hash);
      else add(hash);
    }
    for (const hashes of this.editorHistories.values())
      for (const hash of hashes) add(hash);
    return counts;
  }
  private reconcile(
    snapshot: AttachmentReferences,
    candidates: Set<string>,
  ): Map<string, number> {
    const refs = this.references(snapshot, candidates);
    const now = Date.now();
    for (const hash of candidates) {
      const count = refs.get(hash) ?? 0;
      this.db
        .prepare(`UPDATE input_content_object SET
        last_released_at=CASE WHEN ?>0 THEN NULL WHEN reference_count>0 THEN ? ELSE COALESCE(last_released_at,?) END,
        reference_count=? WHERE digest=?`)
        .run(count, now, now, count, hash);
    }
    return refs;
  }
  private async discover(): Promise<void> {
    try {
      this.directory ??= await opendir(join(this.options.directory, "objects"));
      for (let count = 0; count < BATCH; count++) {
        const entry = await this.directory.read();
        if (!entry) {
          await this.directory.close();
          this.directory = undefined;
          break;
        }
        if (!HASH.test(entry.name)) continue;
        this.db
          .prepare(
            "INSERT OR IGNORE INTO input_content_object(digest,byte_length,last_released_at) VALUES(?,0,?)",
          )
          .run(entry.name, Date.now());
      }
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      )
        throw error;
    }
  }
  async run(
    mode: "check" | "manual" | "automatic",
    threadId?: string,
  ): Promise<AttachmentStorageReport> {
    const started = Date.now();
    const manifestVersion = this.options.manifestVersion();
    if (manifestVersion !== this.manifestRevision) {
      this.manifestCursor = 0;
      this.manifestComplete = false;
      this.manifestRevision = manifestVersion;
    }
    if (!this.manifestComplete) {
      const page = this.options.scanManifests(this.manifestCursor);
      this.manifestCursor = page.cursor;
      this.manifestComplete = page.complete;
      for (const item of page.items)
        for (const hash of [item.attachment.inputDigest, item.derivedDigest]) {
          if (hash)
            this.db
              .prepare(
                "INSERT OR IGNORE INTO input_content_object(digest,byte_length,last_released_at) VALUES(?,?,?)",
              )
              .run(hash, item.attachment.byteLength, started);
        }
    }
    await this.discover();
    if (!this.scanStarted) {
      this.scanStarted = Math.max(started, this.lastScanStarted + 1);
      this.lastScanStarted = this.scanStarted;
    }
    const rows = this.db
      .prepare(
        "SELECT digest,byte_length,last_released_at,state FROM input_content_object WHERE state!='deleted' AND (checked_at IS NULL OR checked_at<?) ORDER BY COALESCE(checked_at,0),digest LIMIT ?",
      )
      .all(this.scanStarted, BATCH);
    const candidates = new Set(rows.map((row) => String(row.digest)));
    const query: AttachmentReferenceQuery = {
      digests: [...candidates],
      attachmentIds: [...this.pendingImports.values()]
        .filter((pin) => [...pin.digests].some((hash) => candidates.has(hash)))
        .map((pin) => ({ threadId: pin.threadId, id: pin.id })),
      ...(threadId ? { reportThreadId: threadId } : {}),
    };
    let snapshot = this.manifestComplete
      ? await this.options.references.read(query)
      : ({
          version: this.options.references.version(),
          complete: false,
          counts: [],
          durableAttachmentIds: [],
          frozenDigests: [],
          sources: [],
          sourcesTruncated: false,
        } as AttachmentReferences);
    let referenceEpoch = this.transientEpoch;
    let currentRefs = snapshot.complete
      ? this.reconcile(snapshot, candidates)
      : new Map<string, number>();
    let checkedObjects = 0,
      deletedObjects = 0,
      deletedBytes = 0,
      scannedBytes = 0;
    let storageUnavailable = false;
    for (const row of snapshot.complete ? rows : []) {
      const hash = String(row.digest);
      let problem:
        | "content-missing"
        | "content-corrupt"
        | "storage-unavailable"
        | null = null;
      let size = Number(row.byte_length);
      let handle;
      try {
        handle = await open(
          join(this.options.directory, "objects", hash),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        const info = await handle.stat();
        size = info.size;
        if (!info.isFile() || size > this.options.maxObjectBytes)
          problem = "content-corrupt";
        else if (scannedBytes + size > SCAN_BYTES && checkedObjects > 0) break;
        else {
          scannedBytes += size;
          const hasher = createHash("sha256");
          const buffer = Buffer.alloc(Math.min(1024 * 1024, size + 1));
          let offset = 0;
          while (offset < size) {
            const read = await handle.read(
              buffer,
              0,
              Math.min(buffer.length, size - offset),
              offset,
            );
            if (read.bytesRead === 0) {
              problem = "content-corrupt";
              break;
            }
            hasher.update(buffer.subarray(0, read.bytesRead));
            offset += read.bytesRead;
          }
          const end = await handle.read(buffer, 0, 1, size);
          if (end.bytesRead !== 0 || hasher.digest("hex") !== hash)
            problem = "content-corrupt";
        }
      } catch (error) {
        problem =
          error instanceof Error && "code" in error && error.code === "ENOENT"
            ? "content-missing"
            : error instanceof Error &&
                "code" in error &&
                error.code === "ELOOP"
              ? "content-corrupt"
              : "storage-unavailable";
      } finally {
        await handle?.close();
      }
      storageUnavailable ||= problem === "storage-unavailable";
      checkedObjects++;
      this.db
        .prepare(
          "UPDATE input_content_object SET checked_at=?,byte_length=?,problem=? WHERE digest=?",
        )
        .run(this.scanStarted, size, problem, hash);
      if (mode === "check" || problem === "storage-unavailable") continue;
      // Re-read the actual owners after every awaited read. The short unlink
      // has no await: no Main write can interleave between check and deletion.
      if (
        snapshot.version !== this.options.references.version() ||
        referenceEpoch !== this.transientEpoch
      ) {
        snapshot = await this.options.references.read(query);
        if (!snapshot.complete) break;
        referenceEpoch = this.transientEpoch;
        currentRefs = this.reconcile(snapshot, candidates);
      }
      const current = this.db
        .prepare(
          "SELECT last_released_at FROM input_content_object WHERE digest=?",
        )
        .get(hash);
      if (
        (currentRefs.get(hash) ?? 0) > 0 ||
        typeof current?.last_released_at !== "number" ||
        (mode === "automatic" &&
          Date.now() - current.last_released_at < RETENTION)
      )
        continue;
      this.db
        .prepare(
          "UPDATE input_content_object SET state='deleting' WHERE digest=?",
        )
        .run(hash);
      try {
        this.db.exec("BEGIN IMMEDIATE");
        try {
          // Block other SQLite writers during the short final unlink. Recheck
          // the authoritative epoch under that lock; no await follows.
          if (
            snapshot.version !== this.options.references.version() ||
            referenceEpoch !== this.transientEpoch
          ) {
            this.db.exec("ROLLBACK");
            continue;
          }
          try {
            unlinkSync(join(this.options.directory, "objects", hash));
          } catch (error) {
            if (
              !(
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
              )
            )
              throw error;
          }
          const folder = openSync(
            join(this.options.directory, "objects"),
            constants.O_RDONLY,
          );
          try {
            fsyncSync(folder);
          } finally {
            closeSync(folder);
          }
          this.db
            .prepare(
              "UPDATE input_content_object SET state='deleted',problem='content-missing' WHERE digest=?",
            )
            .run(hash);
          this.db.exec("COMMIT");
          deletedObjects++;
          deletedBytes += size;
        } catch (error) {
          this.db.exec("ROLLBACK");
          throw error;
        }
      } catch {
        storageUnavailable = true;
        this.db
          .prepare(
            "UPDATE input_content_object SET problem='storage-unavailable' WHERE digest=?",
          )
          .run(hash);
      }
    }
    if (
      this.manifestComplete &&
      snapshot.version !== this.options.references.version()
    )
      snapshot = await this.options.references.read(query);
    if (snapshot.complete) this.reconcile(snapshot, candidates);
    const summary = this.db
      .prepare(
        "SELECT SUM(CASE WHEN reference_count>0 THEN 1 ELSE 0 END) AS retained,SUM(CASE WHEN reference_count=0 AND state!='deleted' THEN 1 ELSE 0 END) AS unused,SUM(CASE WHEN state!='deleted' AND (checked_at IS NULL OR checked_at<?) THEN 1 ELSE 0 END) AS remaining FROM input_content_object",
      )
      .get(this.scanStarted);

    const issues: AttachmentStorageReport["issues"] = [];
    const issueKeys = new Set<string>();
    let totalIssues = 0;
    const manifestIssues = this.manifestComplete
      ? this.options.issueManifests(
          [...candidates].filter((hash) => this.failure([hash])),
          threadId,
        )
      : { items: [], complete: false };
    for (const item of manifestIssues.items) {
      if (threadId && item.attachment.threadId !== threadId) continue;
      for (const [object, hash] of [
        ["original", item.attachment.inputDigest],
        ["derived", item.derivedDigest],
      ] as const) {
        const reason = this.failure([hash]);
        if (
          reason !== "content-missing" &&
          reason !== "content-corrupt" &&
          reason !== "storage-unavailable"
        )
          continue;
        const key = `${item.attachment.id}:${object}:${hash}`;
        issueKeys.add(key);
        totalIssues++;
        if (issues.length < 128)
          issues.push({
            attachmentId: item.attachment.id,
            name: item.attachment.name,
            object,
            reason,
            ...(hash ? { digest: hash } : {}),
          });
      }
    }
    // Frozen versions may no longer match the mutable @ manifest. Their
    // receipt provenance still locates a missing or corrupt exact object.
    for (const source of snapshot.sources) {
      if (threadId && source.threadId !== threadId) continue;
      const reason = this.failure([source.digest]);
      const key = `${source.attachmentId}:${source.object}:${source.digest}`;
      if (!reason || issueKeys.has(key)) continue;
      issueKeys.add(key);
      totalIssues++;
      if (issues.length < 128)
        issues.push({
          attachmentId: source.attachmentId,
          name: source.name,
          object: source.object,
          reason,
          digest: source.digest,
        });
    }
    const remainingObjects = Number(summary?.remaining ?? 0);
    if (remainingObjects === 0) this.scanStarted = 0;
    if (mode === "automatic" && storageUnavailable)
      throw Error("Attachment storage unavailable");
    return {
      kind: "storage-report",
      checkedObjects,
      remainingObjects,
      retainedObjects: Number(summary?.retained ?? 0),
      unreferencedObjects: Number(summary?.unused ?? 0),
      deletedObjects,
      deletedBytes,
      issues,
      issuesTruncated:
        totalIssues > issues.length ||
        snapshot.sourcesTruncated ||
        !manifestIssues.complete,
      manifestScanIncomplete: !this.manifestComplete,
      referenceScanIncomplete: this.manifestComplete && !snapshot.complete,
      discoveryPending: !!this.directory,
    };
  }
  async close(): Promise<void> {
    this.editorHistories.clear();
    this.transientEpoch++;
    await this.directory?.close();
    this.directory = undefined;
  }
}
