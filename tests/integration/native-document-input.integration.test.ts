import { createHash } from "node:crypto";
import {
  constants,
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createAttachmentService } from "../../src/app/main/wiring/attachment-service";

vi.mock("electron", () => ({ utilityProcess: {} }));

it("keeps Composer document admission aligned with the fixed OMP convertible set", async () => {
  const source = readFileSync(
    join(
      import.meta.dirname,
      "../../node_modules/@oh-my-pi/pi-coding-agent/src/utils/markit.ts",
    ),
    "utf8",
  );
  const declaration = source.match(
    /CONVERTIBLE_EXTENSIONS[^=]*= new Set\(\[([^\]]+)\]/,
  )?.[1];
  if (!declaration)
    throw Error(
      "fixed OMP convertible declaration changed; re-audit attachment support",
    );
  const extensions = [...declaration.matchAll(/"(\.[a-z]+)"/g)].map(
    (match) => match[1],
  );
  expect(extensions.sort()).toEqual([
    ".docx",
    ".epub",
    ".pdf",
    ".pptx",
    ".xlsx",
  ]);
});

function pdfFixture() {
  const stream =
    "BT /F1 12 Tf 20 180 Td (NATIVE PDF INPUT contains ordinary selectable document text.) Tj 0 -20 Td (A second sentence provides enough text for native coverage inspection.) Tj 0 -20 Td (The original PDF remains in private storage after Markdown conversion.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let value = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(value));
    value += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const offset = Buffer.byteLength(value);
  value += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((position) => `${String(position).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.from(value);
}

// A minimal OOXML workbook with real ZIP members, interpreted by fixed OMP.
const xlsx = Buffer.from(
  "UEsDBBQAAAAAAAAAIVDI5BsiSAAAAEgAAAAPAAAAeGwvd29ya2Jvb2sueG1sPHdvcmtib29rPjxzaGVldHM+PHNoZWV0IG5hbWU9IkNvdW50cyIgcjppZD0icklkMSIvPjwvc2hlZXRzPjwvd29ya2Jvb2s+UEsDBBQAAAAAAAAAIVDUxK1ZVwAAAFcAAAAaAAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHM8UmVsYXRpb25zaGlwcz48UmVsYXRpb25zaGlwIElkPSJySWQxIiBUYXJnZXQ9IndvcmtzaGVldHMvc2hlZXQxLnhtbCIvPjwvUmVsYXRpb25zaGlwcz5QSwMEFAAAAAAAAAAhUDUhfBjQAAAA0AAAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWw8d29ya3NoZWV0PjxzaGVldERhdGE+PHJvdz48YyB0PSJpbmxpbmVTdHIiPjxpcz48dD5OYW1lPC90PjwvaXM+PC9jPjxjIHQ9ImlubGluZVN0ciI+PGlzPjx0PkNvdW50PC90PjwvaXM+PC9jPjwvcm93Pjxyb3c+PGMgdD0iaW5saW5lU3RyIj48aXM+PHQ+QWxpY2U8L3Q+PC9pcz48L2M+PGM+PHY+Nzwvdj48L2M+PC9yb3c+PC9zaGVldERhdGE+PC93b3Jrc2hlZXQ+UEsBAhQDFAAAAAAAAAAhUMjkGyJIAAAASAAAAA8AAAAAAAAAAAAAAIABAAAAAHhsL3dvcmtib29rLnhtbFBLAQIUAxQAAAAAAAAAIVDUxK1ZVwAAAFcAAAAaAAAAAAAAAAAAAACAAXUAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc1BLAQIUAxQAAAAAAAAAIVA1IXwY0AAAANAAAAAYAAAAAAAAAAAAAACAAQQBAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxQSwUGAAAAAAMAAwDLAAAACgIAAAAA",
  "base64",
);

it("imports all fixed OMP document formats and notebooks, prepares real contents and freezes clipboard versions", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "dpi-native-document-")),
  );
  const resources = join(root, "runtime");
  const sdk = join(resources, "sdk");
  cpSync(join(import.meta.dirname, "../../resources/sdk"), sdk, {
    recursive: true,
    verbatimSymlinks: true,
    mode: constants.COPYFILE_FICLONE,
  });
  // Validate current adapter sources against a private copy of the fixed SDK;
  // do not replace resources held by the user's running desktop.
  const manifest = JSON.parse(readFileSync(join(sdk, "manifest.json"), "utf8"));
  for (const name of ["pdf-content.mjs", "document-content.mjs"]) {
    const body = readFileSync(join(import.meta.dirname, "../../runtime", name));
    writeFileSync(join(sdk, name), body);
    manifest.hashes[name] = createHash("sha256").update(body).digest("hex");
  }
  writeFileSync(join(sdk, "manifest.json"), JSON.stringify(manifest));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    resources,
    () => true,
    async () => null,
  );
  try {
    const source = storage.drafts.create(root),
      target = storage.drafts.create(root);
    const pdf = await service.store.importBytes(source.threadId, {
      name: "document.pdf",
      mimeType: "",
      bytes: pdfFixture(),
      source: "file",
    });
    const sheet = await service.store.importBytes(source.threadId, {
      name: "sheet.xlsx",
      mimeType: "",
      bytes: xlsx,
      source: "file",
    });
    expect(pdf).toMatchObject({
      status: "ready",
      representation: "pdf-text",
      coverageGaps: [],
      textOnly: false,
    });
    expect(sheet).toMatchObject({
      status: "ready",
      representation: "document-text",
      coverageGaps: [],
    });
    const text = `${pdf.token}\n${sheet.token}`;
    const prepared = await service.store.prepare(source.threadId, text);
    expect(prepared).toMatchObject({
      ok: true,
      content: {
        message: expect.stringContaining("NATIVE PDF INPUT"),
        sources: [
          expect.objectContaining({
            representation: "pdf-text",
            derivedDigest: expect.any(String),
          }),
          expect.objectContaining({
            representation: "document-text",
            derivedDigest: expect.any(String),
          }),
        ],
      },
    });
    if (!prepared.ok) throw Error("unprepared input");
    expect(prepared.content.message).toContain("Alice");
    expect(prepared.content.message).toContain("7");
    const reserve = service.store.reserveClipboard("source", source.threadId);
    if (reserve.kind !== "clipboard-tickets" || !reserve.tickets[0])
      throw Error("missing clipboard ticket");
    expect(
      await service.store.exportClipboard(
        "source",
        source.threadId,
        reserve.tickets[0],
        text,
        [pdf.id, sheet.id],
      ),
    ).toMatchObject({ kind: "clipboard-exported", degraded: false });
    const copied = await service.store.importClipboard(
      "target",
      target.threadId,
      reserve.tickets[0],
    );
    if (copied.kind !== "clipboard-imported") throw Error("copy unavailable");
    expect(copied.items.map((item) => item.representation)).toEqual([
      "pdf-text",
      "document-text",
    ]);
    expect(
      await service.store.prepare(target.threadId, copied.text),
    ).toMatchObject({
      ok: true,
      content: { message: expect.stringContaining("Alice") },
    });
    writeFileSync(join(root, "sheet.xlsx"), xlsx);
    const reference = await service.store.addReference(
      source.threadId,
      "sheet.xlsx",
    );
    expect(
      await service.store.prepare(source.threadId, reference.token),
    ).toMatchObject({
      ok: true,
      content: {
        message: expect.stringContaining("Alice"),
        sources: [expect.objectContaining({ representation: "document-text" })],
      },
    });
    for (const [name, bytes, expected] of [
      [
        "sample.docx",
        readFileSync(
          join(import.meta.dirname, "../fixtures/native-documents/sample.docx"),
        ),
        "NATIVE DOCX BODY",
      ],
      [
        "sample.pptx",
        readFileSync(
          join(import.meta.dirname, "../fixtures/native-documents/sample.pptx"),
        ),
        "NATIVE PPTX BODY",
      ],
      [
        "sample.epub",
        readFileSync(
          join(import.meta.dirname, "../fixtures/native-documents/sample.epub"),
        ),
        "NATIVE EPUB BODY",
      ],
      [
        "sample.ipynb",
        Buffer.from(
          JSON.stringify({
            nbformat: 4,
            nbformat_minor: 5,
            metadata: {},
            cells: [
              {
                cell_type: "code",
                source: ["print('NATIVE NOTEBOOK BODY')"],
                metadata: {},
                execution_count: null,
                outputs: [],
              },
            ],
          }),
        ),
        "NATIVE NOTEBOOK BODY",
      ],
    ] as const) {
      const item = await service.store.importBytes(source.threadId, {
        name,
        bytes,
        source: "file",
        mimeType: "",
      });
      expect(item, name).toMatchObject({
        status: "ready",
        representation: "document-text",
      });
      expect(
        await service.store.preview(source.threadId, item.id),
      ).toMatchObject({
        kind: "text",
        text: expect.stringContaining(expected),
      });
      const prepared = await service.store.prepare(source.threadId, item.token);
      expect(prepared, name).toMatchObject({
        ok: true,
        content: { message: expect.stringContaining(expected) },
      });
      const owner = `source-${name}`;
      const reserve = service.store.reserveClipboard(owner, source.threadId);
      if (reserve.kind !== "clipboard-tickets" || !reserve.tickets[0])
        throw Error("reserve");
      expect(
        await service.store.exportClipboard(
          owner,
          source.threadId,
          reserve.tickets[0],
          item.token,
          [item.id],
        ),
      ).toMatchObject({ kind: "clipboard-exported" });
      const copied = await service.store.importClipboard(
        "target",
        target.threadId,
        reserve.tickets[0],
      );
      if (copied.kind !== "clipboard-imported") throw Error("copy");
      expect(
        await service.store.prepare(target.threadId, copied.text),
      ).toMatchObject({
        ok: true,
        content: { message: expect.stringContaining(expected) },
      });
      writeFileSync(join(root, name), bytes);
      const reference = await service.store.addReference(source.threadId, name);
      expect(
        await service.store.prepare(source.threadId, reference.token),
      ).toMatchObject({
        ok: true,
        content: { message: expect.stringContaining(expected) },
      });
    }
  } finally {
    await service.close();
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 60000);
