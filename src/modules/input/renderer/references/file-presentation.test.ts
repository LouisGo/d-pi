import { expect, it } from "vitest";
import {
  filePresentation,
  fileTypeIconPaths,
  formatFileSize,
} from "./file-presentation";

it.each([
  ["application/msword", "document", "DOC"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "document",
    "DOCX",
  ],
  ["APPLICATION/PDF; charset=binary", "pdf", "PDF"],
  ["text/plain; charset=utf-8", "text", "TXT"],
  ["application/typescript", "code", "TS"],
  ["text/x-python", "code", "PY"],
  ["text/markdown", "markdown", "MD"],
  ["text/html", "html", "HTML"],
  ["audio/mpeg", "audio", "AUDIO"],
  ["video/mp4", "video", "VIDEO"],
  ["application/zip", "archive", "ZIP"],
  ["image/heic", "image", "IMAGE"],
])("prioritizes MIME %s over a misleading extension", (mime, kind, label) => {
  expect(filePresentation("misleading.png", mime)).toEqual({ kind, label });
});
it.each([
  ["src/runtime.TSX", "code", "TS"],
  ["archive.tar.gz", "archive", "GZ"],
  ["文档.文档说明.DOCX", "document", "DOCX"],
  ["note.md", "markdown", "MD"],
  ["page.html", "html", "HTML"],
  ["clip.mp4", "video", "MP4"],
  ["audio.flac", "audio", "FLAC"],
  ["README", "generic", "FILE"],
  ["input.unrecognised", "generic", "FILE"],
])(
  "fills unknown MIME from %s without using filename text as markup",
  (name, kind, label) => {
    for (const mime of [
      undefined,
      "",
      "application/octet-stream",
      "application/x-custom",
    ])
      expect(filePresentation(name, mime)).toEqual({ kind, label });
  },
);
it("keeps directory context independent of the supplied MIME", () => {
  expect(filePresentation("assets", "image/png", "directory")).toEqual({
    kind: "directory",
    label: "DIR",
  });
});
it("provides distinct authored icons for each visible non-image MIME category", () => {
  const kinds = [
    "document",
    "pdf",
    "text",
    "code",
    "markdown",
    "html",
    "audio",
    "video",
    "archive",
    "generic",
  ] as const;
  expect(
    new Set(kinds.map((kind) => fileTypeIconPaths(kind).join("|"))).size,
  ).toBe(kinds.length);
});
it.each([
  [0, "0 B"],
  [1, "1 B"],
  [1023, "1023 B"],
  [1024, "1 KB"],
  [225280, "220 KB"],
  [1024 * 1024, "1.0 MB"],
  [1024 ** 3, "1.0 GB"],
  [undefined, null],
  [-1, null],
  [NaN, null],
  [Infinity, null],
  [1.5, null],
])(
  "formats attachment size %s without rendering missing metadata as zero bytes",
  (bytes, label) => {
    expect(formatFileSize(bytes)).toBe(label);
  },
);

it("treats prototype-shaped MIME and extensions as generic metadata", () => {
  expect(filePresentation("input.constructor", "constructor")).toEqual({
    kind: "generic",
    label: "FILE",
  });
});
