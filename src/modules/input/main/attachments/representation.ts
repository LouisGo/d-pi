import type { AttachmentFailureReason } from "../../contracts/public";
export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";
export type Representation =
  | { kind: "image"; mimeType: ImageMime }
  | { kind: "pdf" }
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
  if (mimeType.startsWith("image/"))
    return { kind: "failed", reason: "invalid-image" };
  if (mimeType === "application/pdf" || /\.pdf$/i.test(name))
    return { kind: "failed", reason: "pdf-conversion-failed" };
  if (
    !mimeType.startsWith("text/") &&
    !["application/json", "application/xml", "application/javascript"].includes(
      mimeType,
    ) &&
    !/\.(txt|md|mdx|rst|csv|tsv|json|jsonl|yaml|yml|toml|xml|html|css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|py|rs|go|c|h|cpp|hpp|cc|sh|bash|zsh|fish|sql|log|conf|config|ini|properties|gradle|java|kt|swift|rb|php|lua|vue|svelte)$/i.test(
      name,
    ) &&
    !/^(Dockerfile(?:\.[\w-]+)?|(?:GNU)?Makefile|README|LICENSE|COPYING|NOTICE|CHANGELOG|Procfile|Gemfile|Rakefile|\.gitignore|\.gitattributes|\.gitmodules|\.editorconfig|\.env(?:\.[\w-]+)?|\.npmrc|\.nvmrc|\.yarnrc|\.prettierrc|\.babelrc|\.eslintrc)$/i.test(
      name,
    )
  )
    return { kind: "failed", reason: "unsupported-format" };
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
