import { expect, it } from "vitest";
import { identifyContent } from "./representation";

it.each([
  "example.fs",
  "script.pl",
  "query.graphql",
  "source.svg",
  "opaque.bin",
  "NO_EXTENSION",
])("accepts readable OMP text regardless of filename: %s", (name) => {
  const bytes = new TextEncoder().encode("readable source text");
  expect(
    identifyContent(bytes, name.endsWith("svg") ? "image/svg+xml" : "", name),
  ).toMatchObject({ kind: "text", text: "readable source text" });
});
it.each([
  [
    ".docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [
    ".pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  [
    ".xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  [".epub", "application/epub+zip"],
])(
  "routes %s via name or MIME and rejects corrupted originals",
  (extension, mimeType) => {
    const zip = new Uint8Array([80, 75, 3, 4]);
    expect(identifyContent(zip, "", `UPPER${extension.toUpperCase()}`)).toEqual(
      { kind: "document", extension },
    );
    expect(identifyContent(zip, mimeType, "no-extension")).toEqual({
      kind: "document",
      extension,
    });
    expect(
      identifyContent(
        new TextEncoder().encode("not a document archive"),
        "",
        `broken${extension}`,
      ),
    ).toMatchObject({ kind: "failed", reason: "document-conversion-failed" });
  },
);
it("does not admit binary controls as readable text", () => {
  expect(identifyContent(new Uint8Array([0, 1, 2]), "", "opaque.bin")).toEqual({
    kind: "failed",
    reason: "unsupported-format",
  });
});
