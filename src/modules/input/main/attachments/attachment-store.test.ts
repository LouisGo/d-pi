import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachmentToken } from "../../core/attachments/tokens";
import { serializeReference } from "../../core/references/serialize";
import { AttachmentStore } from "./attachment-store";

let directory: string;
let database: { connection: DatabaseSync };
const thread = randomUUID();
const otherThread = randomUUID();
const bytes = (text: string) => new TextEncoder().encode(text);
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "d-pi-attachments-"));
  database = { connection: new DatabaseSync(":memory:") };
  database.connection.exec(
    "CREATE TABLE thread(id TEXT PRIMARY KEY); CREATE TABLE input_attachment(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES thread(id),payload TEXT NOT NULL);",
  );
  database.connection.prepare("INSERT INTO thread VALUES(?)").run(thread);
  database.connection.prepare("INSERT INTO thread VALUES(?)").run(otherThread);
});
afterEach(async () => {
  database.connection.close();
  await rm(directory, { recursive: true, force: true });
});
function store(
  options: Partial<ConstructorParameters<typeof AttachmentStore>[0]> = {},
) {
  return new AttachmentStore({ directory, database, ...options });
}
async function add(s: AttachmentStore, text = "original") {
  return s.importBytes(thread, {
    name: "example.txt",
    mimeType: "text/plain",
    bytes: bytes(text),
    source: "file",
  });
}

describe("private immutable input preparation", () => {
  it("privately copies and deduplicates bytes but preserves separate reference identity and provenance", async () => {
    const s = store();
    const a = await add(s);
    const b = await add(s);
    expect(a.id).not.toBe(b.id);
    expect(a.inputDigest).toBe(b.inputDigest);
    expect(
      (await stat(join(directory, "objects", a.inputDigest ?? ""))).mode &
        0o777,
    ).toBe(0o600);
    expect(await s.list(thread)).toHaveLength(2);
    const restored = store();
    expect(await restored.prepare(thread, a.token)).toMatchObject({
      ok: true,
      content: { message: expect.stringContaining("original") },
    });
  });
  it("freezes authorized references at prepare and rejects a reference owned by another Thread", async () => {
    let current = "one";
    const s = store({
      readReference: async () => ({ bytes: bytes(current), version: current }),
    });
    const a = await s.addReference(thread, "src/a.ts");
    const frozen = await s.prepare(thread, a.token);
    current = "two";
    expect(frozen).toMatchObject({
      ok: true,
      content: { message: expect.stringContaining("one") },
    });
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: true,
      content: { message: expect.stringContaining("two") },
    });
    expect(await s.prepare(otherThread, a.token)).toMatchObject({
      ok: false,
      reason: "attachment-not-found",
    });
  });
  it("does not dispatch unknown or malformed tokens as literal filenames", async () => {
    expect(
      await store().prepare(thread, attachmentToken(randomUUID())),
    ).toMatchObject({ ok: false, reason: "attachment-not-found" });
    expect(
      await store().prepare(thread, "[[dpi-attachment:broken]]"),
    ).toMatchObject({ ok: false, reason: "invalid-token" });
  });
  it("retains failed binary and corrupt/private missing objects block the whole submission", async () => {
    const s = store();
    const bad = await s.importBytes(thread, {
      name: "binary.bin",
      mimeType: "application/octet-stream",
      bytes: new Uint8Array([0, 1, 2]),
      source: "drop",
    });
    expect(bad.status).toBe("failed");
    expect(await s.prepare(thread, bad.token)).toMatchObject({
      ok: false,
      reason: "unsupported-format",
    });
    const a = await add(s);
    await writeFile(join(directory, "objects", a.inputDigest ?? ""), "changed");
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: false,
      reason: "content-corrupt",
    });
    expect(await s.list(thread)).toHaveLength(2);
  });
  it("accepts known extensionless/configuration source files with empty MIME and validates their actual encoding", async () => {
    const s = store({
      readReference: async () => ({
        bytes: bytes("# 中文\nFROM example\n"),
        version: "text-source-v1",
      }),
    });
    for (const name of [
      "Dockerfile",
      "Dockerfile.dev",
      "Makefile",
      "GNUmakefile",
      "README",
      "LICENSE",
      ".gitignore",
      ".gitattributes",
      ".editorconfig",
      ".env.local",
      ".npmrc",
    ]) {
      const a = await s.importBytes(thread, {
        name,
        mimeType: "",
        bytes: bytes("# 中文\nFROM example\n"),
        source: "file",
      });
      expect(a, name).toMatchObject({
        status: "ready",
        representation: "text",
        converterVersion: "utf-8",
      });
      expect(await s.prepare(thread, a.token)).toMatchObject({
        ok: true,
        content: { message: expect.stringContaining("# 中文") },
      });
      const reference = await s.addReference(thread, `config/${name}`);
      expect(await s.prepare(thread, reference.token)).toMatchObject({
        ok: true,
        content: { message: expect.stringContaining("# 中文") },
      });
    }
    const invalid = await s.importBytes(thread, {
      name: "Dockerfile",
      mimeType: "",
      bytes: new Uint8Array([0xc3, 0x28]),
      source: "file",
    });
    expect(invalid).toMatchObject({
      status: "failed",
      reason: "invalid-encoding",
    });
    const binary = await s.importBytes(thread, {
      name: ".gitignore",
      mimeType: "",
      bytes: new Uint8Array([1, 2, 3]),
      source: "file",
    });
    expect(binary).toMatchObject({
      status: "failed",
      reason: "unsupported-format",
    });
    const unknown = await s.importBytes(thread, {
      name: "opaque.bin",
      mimeType: "",
      bytes: bytes("opaque"),
      source: "file",
    });
    expect(unknown).toMatchObject({
      status: "failed",
      reason: "unsupported-format",
    });
  });
  it("strict UTF-8 and declared MIME avoid pretending unsupported bytes are text", async () => {
    const s = store();
    const invalid = await s.importBytes(thread, {
      name: "a.txt",
      mimeType: "text/plain",
      bytes: new Uint8Array([0xc3, 0x28]),
      source: "paste",
    });
    expect(invalid).toMatchObject({
      status: "failed",
      reason: "invalid-encoding",
    });
  });
  it("validates image decoding and emits exact bytes in image payload", async () => {
    const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const s = store({ validateImage: () => true });
    const a = await s.importBytes(thread, {
      name: "a.png",
      mimeType: "image/png",
      bytes: image,
      source: "paste",
    });
    expect(await s.preview(thread, a.id)).toMatchObject({
      kind: "image",
      dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
    });
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: true,
      content: {
        images: [
          {
            type: "image",
            mimeType: "image/png",
            resource: { digest: a.inputDigest, byteLength: image.byteLength },
          },
        ],
      },
    });
    const rejected = await store({ validateImage: () => false }).importBytes(
      thread,
      { name: "bad.png", mimeType: "image/png", bytes: image, source: "file" },
    );
    expect(rejected).toMatchObject({
      status: "failed",
      reason: "invalid-image",
    });
  });
  it("PDF conversion never silently drops visuals and allows explicit text-only", async () => {
    const s = store({
      convertPdf: async () => ({
        text: "PDF words",
        pageCount: 2,
        pagesNeedingOcr: [2],
        hasVisualContent: true,
        converterVersion: "fixture-v1",
      }),
    });
    const a = await s.importBytes(thread, {
      name: "a.pdf",
      mimeType: "application/pdf",
      bytes: bytes("%PDF-1.7\ncontent"),
      source: "file",
    });
    expect(a).toMatchObject({
      status: "failed",
      reason: "pdf-coverage-gap",
      coverageGaps: expect.arrayContaining(["visual-content", "ocr-pages:2"]),
    });
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: false,
      reason: "pdf-coverage-gap",
    });
    await s.setTextOnly(thread, a.id, true);
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: true,
      content: {
        message: expect.stringContaining("PDF words"),
        sources: [
          expect.objectContaining({
            coverageGaps: expect.arrayContaining(["visual-content"]),
          }),
        ],
      },
    });
  });
  it("explicit text-only cannot override conversion failure or the page limit", async () => {
    let pageCount = 1;
    const s = store({
      convertPdf: async () => ({
        text: "words",
        pageCount,
        pagesNeedingOcr: [],
        hasVisualContent: true,
        converterVersion: "fixture",
      }),
    });
    const a = await s.importBytes(thread, {
      name: "a.pdf",
      mimeType: "application/pdf",
      source: "file",
      bytes: bytes("%PDF-1.7"),
    });
    pageCount = 101;
    const failed = await s.retry(thread, a.id);
    expect(failed).toMatchObject({
      status: "failed",
      reason: "pdf-too-many-pages",
    });
    expect(await s.setTextOnly(thread, a.id, true)).toMatchObject({
      status: "failed",
      reason: "pdf-too-many-pages",
    });
  });
  it("validates referenced image bytes rather than trusting the file extension", async () => {
    const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const s = store({
      readReference: async () => ({ bytes: image, version: "v1" }),
      validateImage: () => false,
    });
    const a = await s.addReference(thread, "broken.png");
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: false,
      reason: "invalid-image",
    });
  });
  it("retains the original when private storage fills and serializes concurrent duplicate imports", async () => {
    const s = store({
      limits: {
        sourceBytes: 100,
        submissionBytes: 100,
        encodedBytes: 1000,
        storageBytes: 8,
      },
    });
    const [a, b] = await Promise.all([add(s, "12345678"), add(s, "12345678")]);
    expect(a.inputDigest).toBe(b.inputDigest);
    await expect(add(s, "another")).rejects.toThrow("storage-full");
    expect(await s.list(thread)).toHaveLength(2);
    expect(await s.prepare(thread, a.token)).toMatchObject({ ok: true });
  });
  it("preserves authorization failures and supports known UTF-16 BOM text", async () => {
    const s = store({
      readReference: async () => {
        throw new Error("reference-denied");
      },
    });
    const a = await s.addReference(thread, "private.txt");
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: false,
      reason: "reference-denied",
    });
    const unicode = await s.importBytes(thread, {
      name: "unicode.txt",
      mimeType: "text/plain",
      source: "file",
      bytes: new Uint8Array([255, 254, 45, 78, 135, 101]),
    });
    expect(unicode).toMatchObject({
      status: "ready",
      converterVersion: "utf-16le",
    });
    expect(await s.prepare(thread, unicode.token)).toMatchObject({
      ok: true,
      content: { message: expect.stringContaining("中文") },
    });
  });
  it("prepares @ PDF from current authorized bytes, keeps explicit loss consent, and never reuses a prior frozen conversion", async () => {
    let current = "%PDF-old";
    let pageCount = 2;
    let denied = false;
    let conversions = 0;
    const s = store({
      readReference: async () => {
        if (denied) throw new Error("reference-denied");
        return { bytes: bytes(current), version: current };
      },
      convertPdf: async (value) => {
        conversions++;
        return {
          text: new TextDecoder().decode(value),
          pageCount,
          pagesNeedingOcr: [2],
          hasVisualContent: true,
          converterVersion: "pdf-reference-fixture",
        };
      },
    });
    const a = await s.addReference(thread, "report.pdf");
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: false,
      reason: "pdf-coverage-gap",
    });
    expect(await s.list(thread)).toMatchObject([
      {
        source: "reference",
        representation: "reference",
        coverageGaps: expect.arrayContaining(["visual-content"]),
      },
    ]);
    expect(await s.preview(thread, a.id)).toMatchObject({
      kind: "text",
      text: "%PDF-old",
    });
    await s.setTextOnly(thread, a.id, true);
    const frozen = await s.prepare(thread, a.token);
    expect(frozen).toMatchObject({
      ok: true,
      content: { message: expect.stringContaining("%PDF-old") },
    });
    if (!frozen.ok) throw new Error("expected prepared PDF");
    expect(
      await readFile(
        join(
          directory,
          "objects",
          frozen.content.sources[0]?.inputDigest ?? "",
        ),
        "utf8",
      ),
    ).toBe("%PDF-old");
    current = "%PDF-new";
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: true,
      content: { message: expect.stringContaining("%PDF-new") },
    });
    expect(frozen.content.message).toContain("%PDF-old");
    expect(frozen.content.message).not.toContain("%PDF-new");
    pageCount = 101;
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: false,
      reason: "pdf-too-many-pages",
    });
    await s.setTextOnly(thread, a.id, true);
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: false,
      reason: "pdf-too-many-pages",
    });
    denied = true;
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: false,
      reason: "reference-denied",
    });
    expect(conversions).toBe(5);
  });
  it("bounds text previews on UTF-8 boundaries while retaining complete source and send content", async () => {
    const original = "中文🙂".repeat(20000);
    const s = store();
    const a = await add(s, original);
    const preview = await s.preview(thread, a.id);
    expect(preview).toMatchObject({ kind: "text", truncated: true });
    if (preview.kind !== "text") throw new Error("expected preview");
    expect(Buffer.byteLength(preview.text, "utf8")).toBeLessThanOrEqual(65536);
    expect(original.startsWith(preview.text)).toBe(true);
    expect(preview.text).not.toContain("\uFFFD");
    expect(
      await readFile(join(directory, "objects", a.inputDigest ?? ""), "utf8"),
    ).toBe(original);
    expect(await s.prepare(thread, a.token)).toMatchObject({
      ok: true,
      content: { message: expect.stringContaining(original) },
    });
  });
  it("source and total/encoded capacity fail without truncating stored input", async () => {
    const s = store({
      limits: {
        sourceBytes: 10,
        submissionBytes: 15,
        encodedBytes: 1000,
        storageBytes: 1000,
      },
    });
    await expect(add(s, "too long content")).rejects.toThrow(
      "source-too-large",
    );
    const a = await add(s, "12345678");
    const b = await add(s, "abcdefgi");
    expect(await s.prepare(thread, `${a.token}${b.token}`)).toMatchObject({
      ok: false,
      reason: "submission-too-large",
    });
    const tight = store({
      limits: {
        sourceBytes: 100,
        submissionBytes: 100,
        encodedBytes: 5,
        storageBytes: 1000,
      },
    });
    expect(await tight.prepare(thread, a.token)).toMatchObject({
      ok: false,
      reason: "transport-too-large",
    });
    expect(
      await readFile(join(directory, "objects", a.inputDigest ?? ""), "utf8"),
    ).toBe("12345678");
  });
});
it("prepares frozen source containing private-token-shaped literals without attachment authority", async () => {
  const s = store();
  const file = await add(s);
  const literal = `${file.token} [[dpi-attachment:${randomUUID()}]] [[dpi-attachment:broken]]`;
  const frozen = serializeReference({
    kind: "selection",
    path: "source.txt",
    source: "working-tree",
    version: "v1",
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: literal.length + 1,
    text: literal,
  });
  const sourceOnly = await s.prepare(thread, frozen);
  expect(sourceOnly).toMatchObject({
    ok: true,
    content: { sources: [], images: [], message: frozen },
  });
  const mixed = await s.prepare(thread, `${file.token}\n${frozen}`);
  expect(mixed.ok).toBe(true);
  if (mixed.ok) {
    expect(mixed.content.sources).toHaveLength(1);
    expect(mixed.content.message).toContain(literal);
  }
});

it("prepares a normal pasted PNG above the old 1 MiB encoded floor without changing its source bytes", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
    "base64",
  );
  const image = Buffer.concat([png, Buffer.alloc(908202 - png.length)]);
  const s = store({ validateImage: async () => true });
  const attachment = await s.importBytes(thread, {
    name: "question.png",
    mimeType: "image/png",
    bytes: image,
    source: "paste",
  });
  expect(attachment.status).toBe("ready");
  const prepared = await s.prepare(thread, `解释这张图片${attachment.token}`);
  expect(prepared).toMatchObject({
    ok: true,
    content: {
      images: [
        {
          resource: {
            digest: attachment.inputDigest,
            byteLength: image.byteLength,
          },
          mimeType: "image/png",
        },
      ],
      rawBytes: image.byteLength,
    },
  });
  expect(
    (
      await readFile(join(directory, "objects", attachment.inputDigest ?? ""))
    ).equals(image),
  ).toBe(true);
});

it("freezes a compressed image as a pinned derived resource and retains its original", async () => {
  const original = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
    "base64",
  );
  const derived = Buffer.from([255, 216, 255, 1, 2, 3]);
  const compressImage = vi.fn(async () => ({
    ok: true as const,
    bytes: derived,
    mimeType: "image/jpeg" as const,
    recompressed: true,
    width: 1,
    height: 1,
    originalWidth: 2,
    originalHeight: 2,
  }));
  const s = store({ validateImage: async () => true, compressImage });
  const item = await s.importBytes(thread, {
    name: "large.png",
    mimeType: "image/png",
    bytes: original,
    source: "paste",
  });
  expect(item).toMatchObject({
    status: "ready",
    imageTransformation: { mimeType: "image/jpeg", width: 1, height: 1 },
  });
  const prepared = await s.prepare(thread, item.token);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw Error("not prepared");
  const image = prepared.content.images[0];
  expect(image).toMatchObject({
    mimeType: "image/jpeg",
    resource: { byteLength: derived.length },
  });
  expect(image).not.toHaveProperty("data");
  expect(prepared.content.sources[0]?.derivedDigest).toBe(
    image && "resource" in image ? image.resource.digest : "missing",
  );
  expect(
    await readFile(join(directory, "objects", item.inputDigest ?? "")),
  ).toEqual(original);
  expect(prepared.content.sources[0]?.imageTransformation).toMatchObject({
    width: 1,
    height: 1,
  });
});
it("retains the compressed resource across repeated @ preparation and refreshes it after the file changes", async () => {
  const header = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
    "base64",
  );
  let original = Buffer.concat([header, Buffer.alloc(11 * 1024 * 1024)]);
  const compressImage = vi.fn(async () => ({
    ok: true as const,
    bytes: header,
    mimeType: "image/png" as const,
    recompressed: true,
    width: 1,
    height: 1,
    originalWidth: 2,
    originalHeight: 2,
  }));
  const s = store({
    compressImage,
    readReference: async () => ({
      bytes: original,
      version: String(original.at(-1)),
    }),
  });
  const item = await s.addReference(thread, "large.png");
  const first = await s.prepare(thread, item.token);
  expect(first.ok).toBe(true);
  const second = await s.prepare(thread, item.token);
  expect(second).toEqual(first);
  expect(compressImage).toHaveBeenCalledTimes(1);
  expect(await s.preview(thread, item.id)).toMatchObject({
    kind: "image",
    dataUrl: `data:image/png;base64,${header.toString("base64")}`,
  });
  original = Buffer.from(original);
  original[original.length - 1] = 1;
  expect(await s.preview(thread, item.id)).toMatchObject({
    kind: "unavailable",
    reason: "reference-unavailable",
  });
  const changed = await s.prepare(thread, item.token);
  expect(changed.ok).toBe(true);
  expect(compressImage).toHaveBeenCalledTimes(2);
  if (first.ok && changed.ok)
    expect(changed.content.sources[0]?.inputDigest).not.toBe(
      first.content.sources[0]?.inputDigest,
    );
});
