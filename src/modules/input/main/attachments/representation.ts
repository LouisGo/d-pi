import type { AttachmentFailureReason } from "../../contracts/public";
export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";
const documentExtensions = [
  ".docx",
  ".pptx",
  ".xlsx",
  ".epub",
  ".ipynb",
] as const;
export type DocumentExtension = (typeof documentExtensions)[number];
export type Representation =
  | { kind: "image"; mimeType: ImageMime }
  | { kind: "pdf" }
  | { kind: "document"; extension: DocumentExtension }
  | { kind: "text"; text: string; encoding: string }
  | { kind: "failed"; reason: AttachmentFailureReason };
function begins(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}
export function identifyContent(
  bytes: Uint8Array,
  mimeType: string,
  name: string,
): Representation {
  if (begins(bytes, [137, 80, 78, 71, 13, 10, 26, 10]))
    return { kind: "image", mimeType: "image/png" };
  if (begins(bytes, [255, 216, 255]))
    return { kind: "image", mimeType: "image/jpeg" };
  if (
    begins(bytes, [71, 73, 70, 56]) &&
    (bytes[4] === 55 || bytes[4] === 57) &&
    bytes[5] === 97
  )
    return { kind: "image", mimeType: "image/gif" };
  if (
    begins(bytes, [82, 73, 70, 70]) &&
    begins(bytes.slice(8), [87, 69, 66, 80])
  )
    return { kind: "image", mimeType: "image/webp" };
  if (begins(bytes, [37, 80, 68, 70, 45])) return { kind: "pdf" };
  const documentTypes: Record<string, DocumentExtension> = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      ".pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      ".xlsx",
    "application/epub": ".epub",
    "application/epub+zip": ".epub",
    "application/x-epub+zip": ".epub",
    "application/x-ipynb+json": ".ipynb",
  };
  const extension =
    documentExtensions.find((extension) =>
      name.toLowerCase().endsWith(extension),
    ) ?? documentTypes[mimeType.toLowerCase().split(";")[0]?.trim() ?? ""];
  if (extension)
    return extension === ".ipynb" || begins(bytes, [80, 75, 3, 4])
      ? { kind: "document", extension }
      : { kind: "failed", reason: "document-conversion-failed" };
  // OMP's ordinary file path accepts readable text independent of extension.
  // SVG follows its default source-text path; raster :img is a separate selector.
  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml")
    return { kind: "failed", reason: "invalid-image" };
  if (mimeType === "application/pdf" || /\.pdf$/i.test(name))
    return { kind: "failed", reason: "pdf-conversion-failed" };
  const encoding = begins(bytes, [255, 254])
    ? "utf-16le"
    : begins(bytes, [254, 255])
      ? "utf-16be"
      : "utf-8";
  try {
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (/[\u0000-\u0008\u000B\u000E-\u001F\u007F]/u.test(text))
      return { kind: "failed", reason: "unsupported-format" };
    return { kind: "text", text, encoding };
  } catch {
    return { kind: "failed", reason: "invalid-encoding" };
  }
}
