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
  type ContentPreparationResult,
  type PreparedContent,
} from "../../contracts/public";
import { attachmentToken, readAttachmentTokens } from "../../core/public";
import { type ImageMime, identifyContent } from "./representation";

const PdfConversionSchema = z.strictObject({
  text: z.string(),
  pageCount: z.number().int().positive(),
  pagesNeedingOcr: z.array(z.number().int().positive()).max(100),
  hasVisualContent: z.boolean(),
  converterVersion: z.string().min(1).max(128),
});
export type PdfConversion = z.infer<typeof PdfConversionSchema>;
export interface AttachmentStoreOptions {
  directory: string;
  database: Pick<AppDatabase, "connection">;
  readReference?: (
    threadId: string,
    path: string,
  ) => Promise<{ bytes: Uint8Array; version: string }>;
  validateImage?: (
    bytes: Uint8Array,
    mimeType: ImageMime,
  ) => boolean | Promise<boolean>;
  convertPdf?: (bytes: Uint8Array) => Promise<PdfConversion>;
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
  constructor(private readonly options: AttachmentStoreOptions) {
    this.limits = options.limits ?? DEFAULT_LIMITS;
  }
  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  private async put(bytes: Uint8Array): Promise<string> {
    const hash = digest(bytes);
    const objects = join(this.options.directory, "objects");
    await mkdir(objects, { recursive: true, mode: 0o700 });
    await chmod(this.options.directory, 0o700);
    await chmod(objects, 0o700);
    const target = join(objects, hash);
    try {
      if (digest(await this.readObject(hash)) === hash) return hash;
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
    return hash;
  }
  private async readObject(hash: string): Promise<Uint8Array> {
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
      return bytes;
    } finally {
      await handle.close();
    }
  }
  private save(record: StoredRecord): Attachment {
    const parsed = RecordSchema.parse(record);
    this.options.database.connection
      .prepare(
        "INSERT INTO input_attachment(id,thread_id,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(
        parsed.attachment.id,
        parsed.attachment.threadId,
        JSON.stringify(parsed),
      );
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
  async list(threadId: string): Promise<Attachment[]> {
    const rows = this.options.database.connection
      .prepare(
        "SELECT payload FROM input_attachment WHERE thread_id=? ORDER BY rowid",
      )
      .all(threadId);
    return rows.map(
      (row) => RecordSchema.parse(JSON.parse(String(row.payload))).attachment,
    );
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
      const hash = await this.put(bytes);
      const record: StoredRecord = {
        attachment: { ...base, inputDigest: hash },
      };
      this.save(record);
      return this.convert(record, bytes);
    });
  }
  async addReference(threadId: string, path: string): Promise<Attachment> {
    const id = randomUUID();
    return this.save({
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
        path,
        status: "ready",
        representation: "reference",
        coverageGaps: [],
        textOnly: false,
      }),
    });
  }
  private async convert(
    record: StoredRecord,
    bytes: Uint8Array,
  ): Promise<Attachment> {
    const representation = identifyContent(
      bytes,
      record.attachment.mimeType,
      record.attachment.name,
    );
    const attachment = { ...record.attachment, coverageGaps: [] as string[] };
    delete attachment.reason;
    return match(representation)
      .returnType<Promise<Attachment>>()
      .with({ kind: "failed" }, async ({ reason }) =>
        this.save({
          ...record,
          attachment: {
            ...attachment,
            status: "failed",
            reason,
            representation: "unsupported",
          },
        }),
      )
      .with({ kind: "text" }, async ({ encoding }) =>
        this.save({
          ...record,
          attachment: {
            ...attachment,
            status: "ready",
            representation: "text",
            converterVersion: encoding,
          },
        }),
      )
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
        return this.save({
          ...record,
          attachment: {
            ...attachment,
            mimeType,
            status: reason ? "failed" : "ready",
            representation: "image",
            converterVersion: "original-image-v1",
            ...(reason ? { reason } : {}),
          },
        });
      })
      .with({ kind: "pdf" }, async () => {
        if (!this.options.convertPdf)
          return this.save({
            ...record,
            attachment: {
              ...attachment,
              status: "failed",
              reason: "pdf-conversion-unavailable",
              representation: "pdf-text",
            },
          });
        try {
          const result = PdfConversionSchema.parse(
            await this.options.convertPdf(bytes),
          );
          const coverageGaps = [
            ...(result.hasVisualContent ? ["visual-content"] : []),
            ...Array.from(
              { length: Math.ceil(result.pagesNeedingOcr.length / 20) },
              (_, index) =>
                `ocr-pages:${result.pagesNeedingOcr.slice(index * 20, index * 20 + 20).join(",")}`,
            ),
          ];
          if (result.pageCount > 100)
            return this.save({
              ...record,
              attachment: {
                ...attachment,
                status: "failed",
                reason: "pdf-too-many-pages",
                representation: "pdf-text",
                coverageGaps,
              },
            });
          if (
            !Number.isInteger(result.pageCount) ||
            result.pageCount < 1 ||
            !result.text.trim()
          )
            throw new Error("invalid-pdf");
          const derivedDigest = await this.put(
            new TextEncoder().encode(result.text),
          );
          const ready = coverageGaps.length === 0 || attachment.textOnly;
          return this.save({
            attachment: {
              ...attachment,
              status: ready ? "ready" : "failed",
              ...(ready ? {} : { reason: "pdf-coverage-gap" }),
              representation: "pdf-text",
              coverageGaps,
              converterVersion: result.converterVersion,
            },
            derivedDigest,
          });
        } catch (error) {
          return this.save({
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
          });
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
      } catch {
        return this.save({
          ...record,
          attachment: {
            ...record.attachment,
            status: "failed",
            reason: "content-corrupt",
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
  async preview(threadId: string, id: string): Promise<AttachmentPreview> {
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
    } catch {
      return { kind: "unavailable", reason: "content-corrupt" };
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
    return this.serialized(() => this.prepareContent(threadId, text));
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
      let version: string | undefined;
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
            attachment.representation === "reference"
              ? error instanceof Error && error.message === "reference-denied"
                ? "reference-denied"
                : "reference-unavailable"
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
        attachment.mimeType,
        attachment.name,
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
        } catch {
          return {
            ok: false,
            reason: "content-corrupt",
            attachmentId: token.id,
          };
        }
      } else if (representation.kind === "text")
        content.message += `\n[${attachment.path ?? attachment.name}]\n${representation.text}\n[/attachment]\n`;
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
              ? representation.encoding
              : "original-image-v1",
        };
        delete attachment.reason;
        this.save({ attachment });
      }
      content.sources.push({
        attachmentId: attachment.id,
        inputDigest: digest(bytes),
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
        ...(version ? { version } : {}),
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
