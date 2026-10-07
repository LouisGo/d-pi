import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { match } from "ts-pattern";
import { z } from "zod";
import type { AppDatabase } from "../../../../platform/main/storage/public";
import {
  type Attachment,
  type AttachmentFailureReason,
  type AttachmentPreview,
  AttachmentSchema,
  type ClipboardTicket,
  type ContentPreparationResult,
  type PreparedContent,
} from "../../contracts/public";
import {
  attachmentToken,
  parseDraftBlocks,
  readAttachmentTokens,
  serializeReference,
} from "../../core/public";
import {
  type ClipboardSnapshot,
  ClipboardSnapshotError,
  ClipboardSnapshots,
} from "./clipboard-snapshots";
import {
  type AttachmentReferenceReader,
  ContentLifecycle,
} from "./content-lifecycle";
import { EditorHistoryLeases, EditorHistoryLimitError } from "./editor-history";
import { type ImageMime, identifyContent } from "./representation";

const PdfConversionSchema = z.strictObject({
  text: z.string().max(1048576),
  pageCount: z.number().int().positive(),
  pagesNeedingOcr: z.array(z.number().int().positive()).max(100),
  hasVisualContent: z.boolean(),
  converterVersion: z.string().min(1).max(128),
});
export type PdfConversion = z.infer<typeof PdfConversionSchema>;
export interface AttachmentStoreOptions {
  directory: string;
  lifecycle?: AttachmentReferenceReader;
  database: Pick<AppDatabase, "connection">;
  readReference?: (
    threadId: string,
    path: string,
    kind: "file" | "directory",
  ) => Promise<{
    bytes: Uint8Array;
    version: string;
    projectPath?: string;
    current?: () => boolean;
  }>;
  validateImage?: (
    bytes: Uint8Array,
    mimeType: ImageMime,
  ) => boolean | Promise<boolean>;
  convertPdf?: (bytes: Uint8Array) => Promise<PdfConversion>;
  editorHistoryLimits?: { epochs: number; ids: number; bytes: number };
  limits?: {
    sourceBytes: number;
    submissionBytes: number;
    encodedBytes: number;
    storageBytes: number;
  };
}
export interface AttachmentImport {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  source: "file" | "paste" | "drop";
}
const RecordSchema = z.strictObject({
  draftBoundRevision: z.number().int().nonnegative().optional(),
  attachment: AttachmentSchema,
  derivedDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
type StoredRecord = z.infer<typeof RecordSchema>;
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const DEFAULT_LIMITS = {
  sourceBytes: 25 * 1024 * 1024,
  submissionBytes: 100 * 1024 * 1024,
  encodedBytes: 1024 * 1024,
  storageBytes: 1024 * 1024 * 1024,
};
export class AttachmentStore {
  private tail: Promise<void> = Promise.resolve();
  private readonly limits;
  private readonly lifecycle?: ContentLifecycle;
  private closed = false;
  private readonly clipboard: ClipboardSnapshots<StoredRecord>;
  private readonly clipboardPending = new Map<string, number>();
  private readonly clipboardImports = new Map<
    string,
    { owner: string; threadId: string }
  >();
  private readonly editorHistories: EditorHistoryLeases;
  constructor(private readonly options: AttachmentStoreOptions) {
    this.clipboard = new ClipboardSnapshots({
      capture: (threadId, text, ids) =>
        this.captureClipboard(threadId, text, ids),
      verify: (snapshot, commit, current) =>
        this.serialized(() => this.prepareClipboard(snapshot, commit, current)),
      pin: (id, hashes) => this.lifecycle?.setEditorHistory(id, hashes),
    });
    this.editorHistories = new EditorHistoryLeases({
      ...(options.editorHistoryLimits
        ? { limits: options.editorHistoryLimits }
        : {}),
      manifest: (threadId, id) => this.read(threadId, id),
      objectBytes: (digest) =>
        Number(
          this.options.database.connection
            .prepare(
              "SELECT byte_length FROM input_content_object WHERE digest=?",
            )
            .get(digest)?.byte_length ?? 0,
        ),
      pin: (id, digests) => this.lifecycle?.setEditorHistory(id, digests),
    });
    this.limits = options.limits ?? DEFAULT_LIMITS;
    if (options.lifecycle)
      this.lifecycle = new ContentLifecycle({
        directory: options.directory,
        database: options.database,
        references: options.lifecycle,
        maxObjectBytes: Math.max(this.limits.sourceBytes, 1048576),
        manifestVersion: () =>
          Number(
            this.options.database.connection
              .prepare(
                "SELECT manifest_revision FROM input_content_epoch WHERE id=1",
              )
              .get()?.manifest_revision,
          ),
        scanManifests: (cursor) => {
          const rows = this.options.database.connection
            .prepare(
              "SELECT rowid,id,thread_id,CASE WHEN length(payload)<=65536 THEN payload END AS payload FROM input_attachment WHERE rowid>? ORDER BY rowid LIMIT 33",
            )
            .all(cursor);
          const items = rows.slice(0, 32).map((row) => {
            const record = RecordSchema.parse(JSON.parse(String(row.payload)));
            if (
              record.attachment.id !== row.id ||
              record.attachment.threadId !== row.thread_id
            )
              throw Error("Attachment manifest identity mismatch");
            return record;
          });
          return {
            items,
            cursor: Number(
              rows[Math.min(rows.length, 32) - 1]?.rowid ?? cursor,
            ),
            complete: rows.length <= 32,
          };
        },
        issueManifests: (hashes, threadId) => {
          if (!hashes.length) return { items: [], complete: true };
          const slots = hashes.map(() => "?").join(",");
          const rows = this.options.database.connection
            .prepare(
              `SELECT id,thread_id,payload FROM input_attachment WHERE ${threadId ? "thread_id=? AND " : ""}(CASE WHEN json_valid(payload) THEN json_extract(payload,'$.attachment.inputDigest') END IN (${slots}) OR CASE WHEN json_valid(payload) THEN json_extract(payload,'$.derivedDigest') END IN (${slots})) LIMIT 129`,
            )
            .all(...(threadId ? [threadId] : []), ...hashes, ...hashes);
          return {
            items: rows
              .slice(0, 128)
              .map((row) =>
                RecordSchema.parse(JSON.parse(String(row.payload))),
              ),
            complete: rows.length <= 128,
          };
        },
      });
  }
  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(Error("Attachment storage closed"));
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  private async put(
    bytes: Uint8Array,
    importOwner?: { threadId: string; id: string },
  ): Promise<string> {
    const hash = digest(bytes);
    const objects = join(this.options.directory, "objects");
    await mkdir(objects, { recursive: true, mode: 0o700 });
    await chmod(this.options.directory, 0o700);
    await chmod(objects, 0o700);
    const target = join(objects, hash);
    try {
      if (digest(await this.readObject(hash)) === hash) {
        this.lifecycle?.register(hash, bytes.byteLength);
        if (importOwner)
          this.lifecycle?.pinImport(importOwner.threadId, importOwner.id, hash);
        return hash;
      }
    } catch {
      /* Import can repair the exact original blob. */
    }
    let size = 0;
    for (const file of await readdir(objects)) {
      if (/^[a-f0-9]{64}$/.test(file))
        size += (await stat(join(objects, file))).size;
    }
    if (size + bytes.byteLength > this.limits.storageBytes)
      throw new Error("storage-full");
    const temporary = join(objects, `${hash}.${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, target);
      const folder = await open(objects, "r");
      try {
        await folder.sync();
      } finally {
        await folder.close();
      }
    } finally {
      await rm(temporary, { force: true });
    }
    this.lifecycle?.register(hash, bytes.byteLength);
    if (importOwner)
      this.lifecycle?.pinImport(importOwner.threadId, importOwner.id, hash);
    return hash;
  }
  private async readObject(hash: string): Promise<Uint8Array> {
    try {
      return await this.readVerifiedObject(hash);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        throw Error("content-missing");
      throw error;
    }
  }
  private async readVerifiedObject(hash: string): Promise<Uint8Array> {
    const handle = await open(
      join(this.options.directory, "objects", hash),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > this.limits.sourceBytes * 4)
        throw new Error("content-corrupt");
      const bytes = await handle.readFile();
      if (digest(bytes) !== hash) throw new Error("content-corrupt");
      this.lifecycle?.register(hash, bytes.byteLength);
      return bytes;
    } finally {
      await handle.close();
    }
  }
  private save(record: StoredRecord): Attachment {
    const parsed = RecordSchema.parse(record);
    if (
      !this.editorHistories.publishManifest(parsed, () => {
        this.options.database.connection
          .prepare(
            `INSERT INTO input_attachment(id,thread_id,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=CASE
          WHEN json_valid(input_attachment.payload) AND json_type(input_attachment.payload,'$.draftBoundRevision') IN ('integer','real')
          THEN json_set(excluded.payload,'$.draftBoundRevision',json_extract(input_attachment.payload,'$.draftBoundRevision'))
          ELSE excluded.payload END`,
          )
          .run(
            parsed.attachment.id,
            parsed.attachment.threadId,
            JSON.stringify(parsed),
          );
      })
    )
      throw new EditorHistoryLimitError(parsed.attachment.id);
    return parsed.attachment;
  }
  private read(threadId: string, id: string): StoredRecord | null {
    const row = this.options.database.connection
      .prepare(
        "SELECT payload FROM input_attachment WHERE id=? AND thread_id=?",
      )
      .get(id, threadId);
    if (!row || typeof row.payload !== "string") return null;
    const value: unknown = JSON.parse(row.payload);
    const parsed = RecordSchema.safeParse(value);
    return parsed.success &&
      parsed.data.attachment.id === id &&
      parsed.data.attachment.threadId === threadId
      ? parsed.data
      : null;
  }
  referenceSource(threadId: string, id: string) {
    const record = this.read(threadId, id);
    return record
      ? {
          attachmentId: id,
          threadId,
          name: record.attachment.name,
          inputDigest: record.attachment.inputDigest,
          derivedDigest: record.derivedDigest,
          draftBoundRevision: record.draftBoundRevision,
        }
      : null;
  }
  openEditorHistory(owner: string, threadId: string, epoch: string) {
    if (this.closed || !this.lifecycle)
      return { kind: "unavailable", reason: "storage-unavailable" } as const;
    return this.editorHistories.open(owner, threadId, epoch);
  }
  updateEditorHistory(
    owner: string,
    threadId: string,
    leaseId: string,
    version: number,
    ids: string[],
  ) {
    if (this.closed)
      return { kind: "unavailable", reason: "storage-unavailable" } as const;
    return this.editorHistories.update(owner, threadId, leaseId, version, ids);
  }
  releaseEditorHistory(
    owner: string,
    threadId: string,
    leaseId?: string,
    releaseIds?: string[],
    retainIds: string[] = [],
  ) {
    const dependencies = leaseId
      ? this.editorHistories.dependencyIds(owner, threadId, leaseId)
      : [];
    const reply = leaseId
      ? this.editorHistories.release(owner, threadId, leaseId)
      : ({ kind: "history-released" } as const);
    if (reply.kind !== "history-released" || releaseIds === undefined)
      return reply;
    const candidates = new Set([...dependencies, ...releaseIds]);
    const retained = new Set(retainIds);
    // Synchronous with lease release: retained body clones keep their original
    // import pins throughout. Other epochs and documents remain authoritative.
    for (const [id, item] of this.clipboardImports) {
      if (
        item.owner === owner &&
        item.threadId === threadId &&
        candidates.has(id) &&
        !retained.has(id) &&
        !this.editorHistories.retains(threadId, id)
      ) {
        this.lifecycle?.releaseImport(threadId, id);
        this.clipboardImports.delete(id);
      }
    }
    return reply;
  }
  releaseEditorHistories(owner: string): void {
    this.editorHistories.releaseOwner(owner);
    this.clipboard.releaseOwner(owner);
    for (const [id, item] of this.clipboardImports)
      if (item.owner === owner) {
        this.lifecycle?.releaseImport(item.threadId, id);
        this.clipboardImports.delete(id);
      }
  }
  reserveClipboard(owner: string, threadId: string) {
    return this.clipboard.reserve(owner, threadId);
  }
  exportClipboard(
    owner: string,
    threadId: string,
    ticket: ClipboardTicket,
    text: string,
    ids: string[],
  ) {
    return this.clipboard.export(owner, threadId, ticket, text, ids);
  }
  releaseClipboard(
    owner: string,
    threadId: string,
    tickets: ClipboardTicket[],
  ) {
    this.clipboard.releaseReserved(owner, threadId, tickets);
    return { kind: "cancelled" } as const;
  }
  discardClipboard(owner: string, threadId: string, ids: string[]) {
    for (const id of ids) {
      const item = this.clipboardImports.get(id);
      if (item?.owner === owner && item.threadId === threadId) {
        this.lifecycle?.releaseImport(threadId, id);
        this.clipboardImports.delete(id);
      }
    }
    return { kind: "cancelled" } as const;
  }
  private captureClipboard(
    threadId: string,
    text: string,
    ids: string[],
  ): ClipboardSnapshot<StoredRecord> {
    if (Buffer.byteLength(text) > 1048576) throw Error("clipboard-too-large");
    const selected = new Set(ids);
    if (selected.size !== ids.length || selected.size > 32)
      throw Error("invalid-selection");
    const encountered = new Set<string>();
    const records = new Map<string, StoredRecord>();
    const digests = new Set<string>();
    let bytes = Buffer.byteLength(text),
      degraded = false;
    const body = parseDraftBlocks(text)
      .map((block) => {
        if (block.kind === "selection") return serializeReference(block.value);
        const parsed = readAttachmentTokens(block.text);
        if (!parsed.ok) throw Error("invalid-token");
        let value = block.text;
        for (const token of [...parsed.tokens].reverse()) {
          if (!selected.has(token.id)) {
            degraded = true;
            value =
              value.slice(0, token.position) +
              "[d-pi:attachment unavailable]" +
              value.slice(token.position + token.token.length);
            continue;
          }
          encountered.add(token.id);
          const record = this.read(threadId, token.id);
          if (!record) throw Error("attachment-not-found");
          const item = record.attachment;
          if (
            item.source !== "reference" &&
            (item.status !== "ready" ||
              !["text", "image", "pdf-text"].includes(item.representation) ||
              !item.inputDigest)
          ) {
            degraded = true;
            // Names are readable data, never token authority in the destination.
            const name = item.name.replace(
              /\[\[dpi-attachment:/g,
              "[attachment:",
            );
            value =
              value.slice(0, token.position) +
              `[d-pi:attachment ${name}]` +
              value.slice(token.position + token.token.length);
          } else {
            records.set(item.id, record);
            if (item.source !== "reference") {
              for (const hash of [item.inputDigest, record.derivedDigest]) {
                if (!hash || digests.has(hash)) continue;
                digests.add(hash);
                bytes += this.objectBytes(
                  hash,
                  hash === item.inputDigest ? item.byteLength : 0,
                );
              }
            }
          }
        }
        return value;
      })
      .join("\n");
    if (encountered.size !== selected.size) throw Error("invalid-selection");
    if (Buffer.byteLength(body) > 1048576) throw Error("clipboard-too-large");
    return {
      text: body,
      records: [...records.values()],
      digests,
      bytes,
      degraded,
    };
  }
  private objectBytes(hash: string, fallback?: number): number {
    const value = this.options.database.connection
      .prepare("SELECT byte_length FROM input_content_object WHERE digest=?")
      .get(hash)?.byte_length;
    if (value === undefined) {
      if (fallback !== undefined) return fallback;
      throw Error("content-missing");
    }
    return Number(value);
  }
  private async prepareClipboard(
    snapshot: ClipboardSnapshot<StoredRecord>,
    commit: (snapshot: ClipboardSnapshot<StoredRecord>) => void,
    current: () => boolean,
  ): Promise<void> {
    // Legacy object metadata can be repaired only by reading and verifying the private object.
    if (!current()) throw new ClipboardSnapshotError("expired");
    await this.verifyClipboard(snapshot, current);
    const prepared: ClipboardSnapshot<StoredRecord> = {
      ...snapshot,
      records: [],
      digests: new Set(),
      bytes: Buffer.byteLength(snapshot.text),
    };
    const sources: {
      original: Attachment;
      current?: (() => boolean) | undefined;
    }[] = [];
    for (const originalRecord of snapshot.records) {
      if (!current()) throw new ClipboardSnapshotError("expired");
      let record = originalRecord;
      const original = record.attachment;
      if (original.source === "reference") {
        if (!this.options.readReference || !original.path)
          throw Error("reference-unavailable");
        const value = await this.options.readReference(
          original.threadId,
          original.path,
          original.referenceKind ?? "file",
        );
        if (!current()) throw new ClipboardSnapshotError("expired");
        if (
          !value.projectPath ||
          value.bytes.byteLength > this.limits.sourceBytes
        )
          throw Error("reference-unavailable");
        const bytes = value.bytes.slice();
        const inputDigest = await this.put(bytes);
        const frozen = AttachmentSchema.parse({
          ...original,
          source: "paste",
          status: "preparing",
          representation: "unsupported",
          reason: undefined,
          inputDigest,
          byteLength: bytes.byteLength,
          mimeType: original.referenceKind === "directory" ? "text/plain" : "",
          frozenReference: {
            projectPath: value.projectPath,
            path: original.path,
            kind: original.referenceKind ?? "file",
            version: value.version,
            capturedAt: new Date().toISOString(),
          },
        });
        record = await this.describe(
          { attachment: frozen },
          bytes,
          false,
          current,
        );
        if (record.attachment.status !== "ready")
          throw Error("reference-unavailable");
        if (original.referenceKind === "directory")
          record.attachment.converterVersion = "directory-listing-v1";
        sources.push({ original, current: value.current });
      }
      prepared.records.push(record);
      for (const hash of [
        record.attachment.inputDigest,
        record.derivedDigest,
      ]) {
        if (!hash || prepared.digests.has(hash)) continue;
        prepared.digests.add(hash);
        prepared.bytes += this.objectBytes(hash);
      }
      if (prepared.bytes > 64 * 1024 * 1024)
        throw new ClipboardSnapshotError("busy");
    }
    await this.verifyClipboard(prepared, current);
    for (const { original, current: sourceCurrent } of sources) {
      const actual = this.read(original.threadId, original.id)?.attachment;
      if (
        !actual ||
        actual.source !== "reference" ||
        actual.path !== original.path ||
        actual.referenceKind !== original.referenceKind ||
        (sourceCurrent && !sourceCurrent())
      )
        throw Error("reference-unavailable");
    }
    // Publication and final pins occur before the serialized resource lane can admit GC.
    commit(prepared);
  }
  private async verifyClipboard(
    snapshot: ClipboardSnapshot<StoredRecord>,
    current?: () => boolean,
  ): Promise<void> {
    for (const hash of snapshot.digests) {
      if (current && !current()) throw new ClipboardSnapshotError("expired");
      const bytes = await this.readVerifiedObject(hash);
      if (current && !current()) throw new ClipboardSnapshotError("expired");
      if (
        bytes.byteLength > this.limits.sourceBytes ||
        snapshot.records.some(
          (record) =>
            record.attachment.source !== "reference" &&
            record.attachment.inputDigest === hash &&
            record.attachment.byteLength !== bytes.byteLength,
        )
      )
        throw Error("content-corrupt");
    }
  }
  async importClipboard(
    owner: string,
    threadId: string,
    ticket: ClipboardTicket,
  ) {
    if (this.closed)
      return { kind: "clipboard-unavailable", reason: "invalid" } as const;
    const pending = this.clipboardPending.get(owner) ?? 0;
    if (
      pending >= 4 ||
      [...this.clipboardPending.values()].reduce(
        (sum, count) => sum + count,
        0,
      ) >= 16
    )
      return { kind: "clipboard-unavailable", reason: "busy" } as const;
    this.clipboardPending.set(owner, pending + 1);
    try {
      const acquired = await this.clipboard.acquire(ticket, owner);
      if (acquired.kind !== "snapshot") return acquired;
      return await this.serialized(async () => {
        try {
          if (!acquired.valid())
            return {
              kind: "clipboard-unavailable",
              reason: "expired",
            } as const;
          await this.verifyClipboard(acquired.snapshot, acquired.valid);
          if (!acquired.valid())
            return {
              kind: "clipboard-unavailable",
              reason: "expired",
            } as const;
          for (const [id, pending] of this.clipboardImports) {
            if (
              this.read(pending.threadId, id)?.draftBoundRevision !== undefined
            ) {
              this.lifecycle?.releaseImport(pending.threadId, id);
              this.clipboardImports.delete(id);
            }
          }
          if (
            this.clipboardImports.size + acquired.snapshot.records.length >
            128
          )
            return { kind: "clipboard-unavailable", reason: "busy" } as const;
          const mapping = new Map<string, string>();
          const items: Attachment[] = [];
          const db = this.options.database.connection;
          db.exec("BEGIN IMMEDIATE");
          try {
            for (const record of acquired.snapshot.records) {
              const id = randomUUID();
              mapping.set(record.attachment.id, id);
              items.push(
                this.save({
                  ...(record.derivedDigest
                    ? { derivedDigest: record.derivedDigest }
                    : {}),
                  attachment: {
                    ...record.attachment,
                    id,
                    threadId,
                    token: attachmentToken(id),
                    source: "paste",
                    capturedAt: new Date().toISOString(),
                  },
                }),
              );
            }
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
          for (const item of items) {
            if (item.inputDigest)
              this.lifecycle?.pinImport(threadId, item.id, item.inputDigest);
            const derived = this.read(threadId, item.id)?.derivedDigest;
            if (derived) this.lifecycle?.pinImport(threadId, item.id, derived);
            this.clipboardImports.set(item.id, { owner, threadId });
          }
          const text = parseDraftBlocks(acquired.snapshot.text)
            .map((block) =>
              block.kind === "selection"
                ? serializeReference(block.value)
                : block.text.replace(
                    /\[\[dpi-attachment:([0-9a-f-]{36})\]\]/g,
                    (token, id: string) =>
                      mapping.has(id)
                        ? attachmentToken(mapping.get(id) ?? "")
                        : token,
                  ),
            )
            .join("\n");
          return {
            kind: "clipboard-imported",
            text,
            items,
            degraded: acquired.snapshot.degraded,
          } as const;
        } catch (error) {
          return {
            kind: "clipboard-unavailable",
            reason:
              error instanceof ClipboardSnapshotError ? error.reason : "failed",
          } as const;
        }
      });
    } finally {
      const remaining = (this.clipboardPending.get(owner) ?? 1) - 1;
      if (remaining) this.clipboardPending.set(owner, remaining);
      else this.clipboardPending.delete(owner);
    }
  }
  checkStorage(threadId: string) {
    return this.serialized(() => {
      if (!this.lifecycle) throw Error("Attachment lifecycle unavailable");
      return this.lifecycle.run("check", threadId);
    });
  }
  cleanStorage(threadId: string) {
    return this.serialized(() => {
      if (!this.lifecycle) throw Error("Attachment lifecycle unavailable");
      return this.lifecycle.run("manual", threadId);
    });
  }
  collectGarbage() {
    return this.serialized(() => {
      if (!this.lifecycle) throw Error("Attachment lifecycle unavailable");
      return this.lifecycle.run("automatic");
    });
  }
  async close(): Promise<void> {
    this.closed = true;
    this.editorHistories.dispose();
    this.clipboard.close();
    for (const [id, item] of this.clipboardImports)
      this.lifecycle?.releaseImport(item.threadId, id);
    this.clipboardImports.clear();
    await this.tail;
    await this.lifecycle?.close();
  }
  list(threadId: string): Promise<Attachment[]> {
    return this.serialized(async () => this.listItems(threadId));
  }
  private listItems(threadId: string): Attachment[] {
    const rows = this.options.database.connection
      .prepare(
        "SELECT payload FROM input_attachment WHERE thread_id=? ORDER BY rowid",
      )
      .all(threadId);
    return rows.map((row) => {
      const record = RecordSchema.parse(JSON.parse(String(row.payload)));
      const reason = this.lifecycle?.failure([
        record.attachment.inputDigest,
        record.derivedDigest,
      ]);
      return reason && record.attachment.source !== "reference"
        ? { ...record.attachment, status: "failed" as const, reason }
        : record.attachment;
    });
  }
  async importBytes(
    threadId: string,
    input: AttachmentImport,
  ): Promise<Attachment> {
    // Copy before the first await: callers cannot mutate source bytes during conversion.
    if (input.bytes.byteLength > this.limits.sourceBytes)
      throw new Error("source-too-large");
    const bytes = input.bytes.slice();
    const id = randomUUID();
    const base = AttachmentSchema.parse({
      schemaVersion: 1,
      id,
      threadId,
      token: attachmentToken(id),
      name: input.name,
      mimeType: input.mimeType,
      byteLength: bytes.byteLength,
      capturedAt: new Date().toISOString(),
      source: input.source,
      status: "preparing",
      representation: "unsupported",
      coverageGaps: [],
      textOnly: false,
    });
    return this.serialized(async () => {
      const hash = await this.put(bytes, base);
      const record: StoredRecord = {
        attachment: { ...base, inputDigest: hash },
      };
      this.save(record);
      return this.convert(record, bytes);
    });
  }
  async addReference(
    threadId: string,
    path: string,
    referenceKind: "file" | "directory" = "file",
  ): Promise<Attachment> {
    const id = randomUUID();
    return this.serialized(async () =>
      this.save({
        attachment: AttachmentSchema.parse({
          schemaVersion: 1,
          id,
          threadId,
          token: attachmentToken(id),
          name: path.split("/").at(-1) ?? path,
          mimeType: "",
          byteLength: 0,
          capturedAt: new Date().toISOString(),
          source: "reference",
          referenceKind,
          path,
          status: "ready",
          representation: "reference",
          coverageGaps: [],
          textOnly: false,
        }),
      }),
    );
  }
  private async convert(
    record: StoredRecord,
    bytes: Uint8Array,
  ): Promise<Attachment> {
    return this.save(await this.describe(record, bytes));
  }
  private async describe(
    record: StoredRecord,
    bytes: Uint8Array,
    pinImport = true,
    current?: () => boolean,
  ): Promise<StoredRecord> {
    const representation = identifyContent(
      bytes,
      record.attachment.mimeType,
      record.attachment.name,
    );
    const attachment = { ...record.attachment, coverageGaps: [] as string[] };
    delete attachment.reason;
    return match(representation)
      .returnType<Promise<StoredRecord>>()
      .with({ kind: "failed" }, async ({ reason }) => ({
        ...record,
        attachment: {
          ...attachment,
          status: "failed",
          reason,
          representation: "unsupported",
        },
      }))
      .with({ kind: "text" }, async ({ encoding }) => ({
        ...record,
        attachment: {
          ...attachment,
          status: "ready",
          representation: "text",
          converterVersion: encoding,
        },
      }))
      .with({ kind: "image" }, async ({ mimeType }) => {
        let reason: AttachmentFailureReason | undefined;
        try {
          reason = !this.options.validateImage
            ? "image-decoder-unavailable"
            : (await this.options.validateImage(bytes, mimeType))
              ? undefined
              : "invalid-image";
        } catch {
          reason = "invalid-image";
        }
        if (current && !current()) throw new ClipboardSnapshotError("expired");
        return {
          ...record,
          attachment: {
            ...attachment,
            mimeType,
            status: reason ? "failed" : "ready",
            representation: "image",
            converterVersion: "original-image-v1",
            ...(reason ? { reason } : {}),
          },
        };
      })
      .with({ kind: "pdf" }, async () => {
        if (!this.options.convertPdf)
          return {
            ...record,
            attachment: {
              ...attachment,
              status: "failed",
              reason: "pdf-conversion-unavailable",
              representation: "pdf-text",
            },
          };
        try {
          const result = PdfConversionSchema.parse(
            await this.options.convertPdf(bytes),
          );
          if (current && !current())
            throw new ClipboardSnapshotError("expired");
          const coverageGaps = [
            ...(result.hasVisualContent ? ["visual-content"] : []),
            ...Array.from(
              { length: Math.ceil(result.pagesNeedingOcr.length / 20) },
              (_, index) =>
                `ocr-pages:${result.pagesNeedingOcr.slice(index * 20, index * 20 + 20).join(",")}`,
            ),
          ];
          if (result.pageCount > 100)
            return {
              ...record,
              attachment: {
                ...attachment,
                status: "failed",
                reason: "pdf-too-many-pages",
                representation: "pdf-text",
                coverageGaps,
              },
            };
          if (
            !Number.isInteger(result.pageCount) ||
            result.pageCount < 1 ||
            !result.text.trim()
          )
            throw new Error("invalid-pdf");
          const derivedDigest = await this.put(
            new TextEncoder().encode(result.text),
            pinImport ? attachment : undefined,
          );
          const ready = coverageGaps.length === 0 || attachment.textOnly;
          return {
            attachment: {
              ...attachment,
              status: ready ? "ready" : "failed",
              ...(ready ? {} : { reason: "pdf-coverage-gap" }),
              representation: "pdf-text",
              coverageGaps,
              converterVersion: result.converterVersion,
            },
            derivedDigest,
          };
        } catch (error) {
          if (
            error instanceof EditorHistoryLimitError ||
            error instanceof ClipboardSnapshotError
          )
            throw error;
          return {
            ...record,
            attachment: {
              ...attachment,
              status: "failed",
              reason:
                error instanceof Error && error.message === "storage-full"
                  ? "storage-full"
                  : "pdf-conversion-failed",
              representation: "pdf-text",
            },
          };
        }
      })
      .exhaustive();
  }
  async retry(threadId: string, id: string): Promise<Attachment | null> {
    return this.serialized(async () => {
      const record = this.read(threadId, id);
      if (!record) return null;
      if (record.attachment.representation === "reference")
        return record.attachment;
      if (!record.attachment.inputDigest)
        return this.save({
          ...record,
          attachment: {
            ...record.attachment,
            status: "failed",
            reason: "content-corrupt",
          },
        });
      try {
        return await this.convert(
          record,
          await this.readObject(record.attachment.inputDigest),
        );
      } catch (error) {
        if (error instanceof EditorHistoryLimitError) throw error;
        return this.save({
          ...record,
          attachment: {
            ...record.attachment,
            status: "failed",
            reason:
              error instanceof Error && error.message === "content-missing"
                ? "content-missing"
                : "content-corrupt",
          },
        });
      }
    });
  }
  async setTextOnly(
    threadId: string,
    id: string,
    enabled: boolean,
  ): Promise<Attachment | null> {
    return this.serialized(async () => {
      const record = this.read(threadId, id);
      if (!record) return null;
      if (record.attachment.representation === "reference")
        return this.save({
          ...record,
          attachment: { ...record.attachment, textOnly: enabled },
        });
      if (record.attachment.representation !== "pdf-text")
        return record.attachment;
      if (
        record.attachment.status === "failed" &&
        record.attachment.reason !== "pdf-coverage-gap"
      )
        return record.attachment;
      const ready =
        Boolean(record.derivedDigest) &&
        (enabled || record.attachment.coverageGaps.length === 0);
      const attachment = {
        ...record.attachment,
        textOnly: enabled,
        status: ready ? ("ready" as const) : ("failed" as const),
      };
      if (ready) delete attachment.reason;
      else
        attachment.reason = record.derivedDigest
          ? "pdf-coverage-gap"
          : (attachment.reason ?? "pdf-conversion-failed");
      return this.save({ ...record, attachment });
    });
  }
  preview(threadId: string, id: string): Promise<AttachmentPreview> {
    return this.serialized(() => this.previewContent(threadId, id));
  }
  private async previewContent(
    threadId: string,
    id: string,
  ): Promise<AttachmentPreview> {
    const record = this.read(threadId, id);
    if (!record) return { kind: "unavailable", reason: "attachment-not-found" };
    try {
      if (record.derivedDigest)
        return this.textPreview(
          new TextDecoder().decode(await this.readObject(record.derivedDigest)),
        );
      if (!record.attachment.inputDigest)
        return { kind: "unavailable", reason: "reference-unavailable" };
      const bytes = await this.readObject(record.attachment.inputDigest);
      if (
        record.attachment.representation === "image" &&
        record.attachment.status === "ready"
      )
        return {
          kind: "image",
          dataUrl: `data:${record.attachment.mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
        };
      const content = identifyContent(
        bytes,
        record.attachment.mimeType,
        record.attachment.name,
      );
      return content.kind === "text"
        ? this.textPreview(content.text)
        : {
            kind: "unavailable",
            reason: record.attachment.reason ?? "unsupported-format",
          };
    } catch (error) {
      return {
        kind: "unavailable",
        reason:
          error instanceof Error && error.message === "content-missing"
            ? "content-missing"
            : "content-corrupt",
      };
    }
  }
  private textPreview(
    text: string,
  ): Extract<AttachmentPreview, { kind: "text" }> {
    const encoded = Buffer.from(text, "utf8");
    if (encoded.byteLength <= 65536) return { kind: "text", text };
    let end = 65536;
    while (
      end > 0 &&
      (encoded[end] ?? 0) >= 128 &&
      ((encoded[end] ?? 0) & 0xc0) === 0x80
    )
      end--;
    return {
      kind: "text",
      text: new TextDecoder().decode(encoded.subarray(0, end)),
      truncated: true,
    };
  }
  private async prepareReferencePdf(
    record: StoredRecord,
    bytes: Uint8Array,
  ): Promise<
    | { ok: true; text: string; record: StoredRecord }
    | { ok: false; reason: AttachmentFailureReason }
  > {
    const attachment = { ...record.attachment, coverageGaps: [] as string[] };
    delete attachment.reason;
    const failed = (reason: AttachmentFailureReason) => {
      this.save({ attachment: { ...attachment, status: "failed", reason } });
      return { ok: false as const, reason };
    };
    if (!this.options.convertPdf) return failed("pdf-conversion-unavailable");
    try {
      const result = PdfConversionSchema.parse(
        await this.options.convertPdf(bytes),
      );
      if (result.pageCount > 100) return failed("pdf-too-many-pages");
      if (!result.text.trim()) return failed("pdf-conversion-failed");
      attachment.coverageGaps = [
        ...(result.hasVisualContent ? ["visual-content"] : []),
        ...Array.from(
          { length: Math.ceil(result.pagesNeedingOcr.length / 20) },
          (_, index) =>
            `ocr-pages:${result.pagesNeedingOcr.slice(index * 20, index * 20 + 20).join(",")}`,
        ),
      ];
      attachment.converterVersion = result.converterVersion;
      const derivedDigest = await this.put(
        new TextEncoder().encode(result.text),
        attachment,
      );
      const ready = attachment.textOnly || attachment.coverageGaps.length === 0;
      const updated: StoredRecord = {
        attachment: {
          ...attachment,
          status: ready ? "ready" : "failed",
          ...(ready ? {} : { reason: "pdf-coverage-gap" }),
        },
        derivedDigest,
      };
      this.save(updated);
      return ready
        ? { ok: true, text: result.text, record: updated }
        : { ok: false, reason: "pdf-coverage-gap" };
    } catch (error) {
      if (error instanceof EditorHistoryLimitError)
        return { ok: false, reason: "editor-history-limit" };
      return failed(
        error instanceof Error && error.message === "storage-full"
          ? "storage-full"
          : "pdf-conversion-failed",
      );
    }
  }
  async prepare(
    threadId: string,
    text: string,
  ): Promise<ContentPreparationResult> {
    return this.serialized(async () => {
      try {
        const result = await this.prepareContent(threadId, text);
        if (result.ok)
          this.lifecycle?.pinPreparation(
            result.content.sources.flatMap((source) => {
              const record = this.read(threadId, source.attachmentId);
              return [
                source.inputDigest,
                ...(record?.derivedDigest ? [record.derivedDigest] : []),
              ];
            }),
          );
        return result;
      } catch (error) {
        if (!(error instanceof EditorHistoryLimitError)) throw error;
        return {
          ok: false,
          reason: "editor-history-limit",
          ...(error.attachmentId ? { attachmentId: error.attachmentId } : {}),
        };
      }
    });
  }
  private async prepareContent(
    threadId: string,
    text: string,
  ): Promise<ContentPreparationResult> {
    const tokens = readAttachmentTokens(text);
    if (!tokens.ok) return { ok: false, reason: "invalid-token" };
    const content: PreparedContent = {
      schemaVersion: 1,
      message: "",
      images: [],
      sources: [],
      rawBytes: 0,
    };
    let cursor = 0;
    for (const token of tokens.tokens) {
      let record = this.read(threadId, token.id);
      if (!record)
        return {
          ok: false,
          reason: "attachment-not-found",
          attachmentId: token.id,
        };
      let attachment = record.attachment;
      if (
        attachment.status !== "ready" &&
        attachment.representation !== "reference"
      )
        return {
          ok: false,
          reason: attachment.reason ?? "content-corrupt",
          attachmentId: token.id,
        };
      let bytes: Uint8Array;
      let version: string | undefined = attachment.frozenReference?.version;
      try {
        if (attachment.representation === "reference") {
          if (!this.options.readReference || !attachment.path)
            return {
              ok: false,
              reason: "reference-unavailable",
              attachmentId: token.id,
            };
          const value = await this.options.readReference(
            threadId,
            attachment.path,
            attachment.referenceKind ?? "file",
          );
          bytes = value.bytes.slice();
          version = value.version;
        } else {
          if (!attachment.inputDigest)
            return {
              ok: false,
              reason: "content-corrupt",
              attachmentId: token.id,
            };
          bytes = await this.readObject(attachment.inputDigest);
        }
      } catch (error) {
        return {
          ok: false,
          reason:
            error instanceof Error && error.message === "source-too-large"
              ? "source-too-large"
              : attachment.representation === "reference"
                ? error instanceof Error && error.message === "reference-denied"
                  ? "reference-denied"
                  : "reference-unavailable"
                : error instanceof Error && error.message === "content-missing"
                  ? "content-missing"
                  : "content-corrupt",
          attachmentId: token.id,
        };
      }
      if (bytes.byteLength > this.limits.sourceBytes)
        return {
          ok: false,
          reason: "source-too-large",
          attachmentId: token.id,
        };
      content.rawBytes += bytes.byteLength;
      if (content.rawBytes > this.limits.submissionBytes)
        return {
          ok: false,
          reason: "submission-too-large",
          attachmentId: token.id,
        };
      if (attachment.representation === "reference") {
        try {
          const inputDigest = await this.put(bytes);
          attachment = {
            ...attachment,
            inputDigest,
            byteLength: bytes.byteLength,
          };
          record = { ...record, attachment };
        } catch (error) {
          return {
            ok: false,
            reason:
              error instanceof Error && error.message === "storage-full"
                ? "storage-full"
                : "storage-unavailable",
            attachmentId: token.id,
          };
        }
      }
      content.message += text.slice(cursor, token.position);
      cursor = token.position + token.token.length;
      const representation = identifyContent(
        bytes,
        attachment.referenceKind === "directory"
          ? "text/plain"
          : attachment.mimeType,
        attachment.referenceKind === "directory"
          ? "directory"
          : attachment.name,
      );
      let outputRepresentation = attachment.representation;
      if (
        attachment.representation === "reference" &&
        representation.kind === "pdf"
      ) {
        const converted = await this.prepareReferencePdf(record, bytes);
        if (!converted.ok) return { ...converted, attachmentId: token.id };
        record = converted.record;
        attachment = record.attachment;
        outputRepresentation = "pdf-text";
        content.message += `\n[${attachment.path ?? attachment.name}; PDF text${attachment.textOnly ? "; explicit text-only" : ""}]\n${converted.text}\n[/attachment]\n`;
      } else if (attachment.representation === "pdf-text") {
        if (!record.derivedDigest)
          return {
            ok: false,
            reason: "content-corrupt",
            attachmentId: token.id,
          };
        try {
          content.message += `\n[${attachment.name}; PDF text${attachment.textOnly ? "; explicit text-only" : ""}]\n${new TextDecoder().decode(await this.readObject(record.derivedDigest))}\n[/attachment]\n`;
        } catch (error) {
          return {
            ok: false,
            reason:
              error instanceof Error && error.message === "content-missing"
                ? "content-missing"
                : "content-corrupt",
            attachmentId: token.id,
          };
        }
      } else if (representation.kind === "text")
        content.message += `\n[${attachment.path ?? attachment.name}${attachment.referenceKind === "directory" ? "; directory listing" : ""}]\n${representation.text}\n[/attachment]\n`;
      else if (representation.kind === "image") {
        if (attachment.representation === "reference") {
          if (!this.options.validateImage)
            return {
              ok: false,
              reason: "image-decoder-unavailable",
              attachmentId: token.id,
            };
          try {
            if (
              !(await this.options.validateImage(
                bytes,
                representation.mimeType,
              ))
            )
              return {
                ok: false,
                reason: "invalid-image",
                attachmentId: token.id,
              };
          } catch {
            return {
              ok: false,
              reason: "invalid-image",
              attachmentId: token.id,
            };
          }
        }
        content.message += `\n[image: ${attachment.name}]\n`;
        content.images.push({
          type: "image",
          mimeType: representation.mimeType,
          data: Buffer.from(bytes).toString("base64"),
        });
      } else
        return {
          ok: false,
          reason:
            representation.kind === "failed"
              ? representation.reason
              : "unsupported-format",
          attachmentId: token.id,
        };
      if (
        attachment.representation === "reference" &&
        representation.kind !== "pdf"
      ) {
        outputRepresentation =
          representation.kind === "text" ? "text" : "image";
        attachment = {
          ...attachment,
          status: "ready",
          coverageGaps: [],
          converterVersion:
            representation.kind === "text"
              ? attachment.referenceKind === "directory"
                ? "directory-listing-v1"
                : representation.encoding
              : "original-image-v1",
        };
        delete attachment.reason;
        this.save({ attachment });
      }
      content.sources.push({
        attachmentId: attachment.id,
        inputDigest: digest(bytes),
        ...(record.derivedDigest
          ? { derivedDigest: record.derivedDigest }
          : {}),
        representation: outputRepresentation,
        converterVersion:
          attachment.converterVersion ??
          (representation.kind === "text"
            ? representation.encoding
            : "reference-v1"),
        coverageGaps: [...attachment.coverageGaps],
        byteLength: bytes.byteLength,
        name: attachment.name,
        ...(attachment.path ? { path: attachment.path } : {}),
        ...(attachment.referenceKind
          ? { referenceKind: attachment.referenceKind }
          : {}),
        ...(version ? { version } : {}),
        ...(attachment.frozenReference
          ? { frozenReference: attachment.frozenReference }
          : {}),
      });
    }
    content.message += text.slice(cursor);
    if (
      Buffer.byteLength(JSON.stringify(content), "utf8") >
      this.limits.encodedBytes
    )
      return { ok: false, reason: "transport-too-large" };
    return { ok: true, content };
  }
}
