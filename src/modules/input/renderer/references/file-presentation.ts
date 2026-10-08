import { match } from "ts-pattern";

export type FileKind =
  | "document"
  | "pdf"
  | "text"
  | "code"
  | "markdown"
  | "html"
  | "audio"
  | "video"
  | "archive"
  | "image"
  | "directory"
  | "generic";
export interface FilePresentation {
  kind: FileKind;
  label: string;
}

const mimeTypes: Record<string, FilePresentation> = {
  "application/pdf": { kind: "pdf", label: "PDF" },
  "application/msword": { kind: "document", label: "DOC" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    kind: "document",
    label: "DOCX",
  },
  "application/vnd.oasis.opendocument.text": { kind: "document", label: "ODT" },
  "application/rtf": { kind: "document", label: "RTF" },
  "text/rtf": { kind: "document", label: "RTF" },
  "application/vnd.ms-excel": { kind: "document", label: "XLS" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    kind: "document",
    label: "XLSX",
  },
  "application/vnd.ms-powerpoint": { kind: "document", label: "PPT" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    kind: "document",
    label: "PPTX",
  },
  "text/plain": { kind: "text", label: "TXT" },
  "text/csv": { kind: "text", label: "CSV" },
  "text/markdown": { kind: "markdown", label: "MD" },
  "text/x-markdown": { kind: "markdown", label: "MD" },
  "text/html": { kind: "html", label: "HTML" },
  "application/xhtml+xml": { kind: "html", label: "HTML" },
  "text/javascript": { kind: "code", label: "JS" },
  "application/javascript": { kind: "code", label: "JS" },
  "text/typescript": { kind: "code", label: "TS" },
  "application/typescript": { kind: "code", label: "TS" },
  "text/x-python": { kind: "code", label: "PY" },
  "application/x-python-code": { kind: "code", label: "PY" },
  "text/x-java-source": { kind: "code", label: "JAVA" },
  "text/x-c": { kind: "code", label: "C" },
  "text/x-c++": { kind: "code", label: "CPP" },
  "text/css": { kind: "code", label: "CSS" },
  "text/x-shellscript": { kind: "code", label: "SH" },
  "application/yaml": { kind: "code", label: "YAML" },
  "application/x-yaml": { kind: "code", label: "YAML" },
  "text/yaml": { kind: "code", label: "YAML" },
  "application/json": { kind: "code", label: "JSON" },
  "application/xml": { kind: "code", label: "XML" },
  "text/xml": { kind: "code", label: "XML" },
  "application/zip": { kind: "archive", label: "ZIP" },
  "application/x-zip-compressed": { kind: "archive", label: "ZIP" },
  "application/gzip": { kind: "archive", label: "GZ" },
  "application/x-tar": { kind: "archive", label: "TAR" },
  "application/x-7z-compressed": { kind: "archive", label: "7Z" },
  "application/vnd.rar": { kind: "archive", label: "RAR" },
};
const extensions: Record<string, FileKind> = {
  doc: "document",
  docx: "document",
  odt: "document",
  rtf: "document",
  xls: "document",
  xlsx: "document",
  ods: "document",
  ppt: "document",
  pptx: "document",
  pdf: "pdf",
  txt: "text",
  csv: "text",
  log: "text",
  ts: "code",
  tsx: "code",
  js: "code",
  jsx: "code",
  mjs: "code",
  cjs: "code",
  json: "code",
  xml: "code",
  yaml: "code",
  yml: "code",
  toml: "code",
  py: "code",
  rb: "code",
  rs: "code",
  go: "code",
  c: "code",
  h: "code",
  cpp: "code",
  java: "code",
  swift: "code",
  sh: "code",
  css: "code",
  scss: "code",
  md: "markdown",
  mdx: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  ogg: "audio",
  flac: "audio",
  mp4: "video",
  mov: "video",
  webm: "video",
  mkv: "video",
  avi: "video",
  zip: "archive",
  gz: "archive",
  tar: "archive",
  tgz: "archive",
  rar: "archive",
  "7z": "archive",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  svg: "image",
  heic: "image",
};

/** Recognized MIME is authoritative; names fill missing or unrecognized MIME. */
export function filePresentation(
  name: unknown,
  mimeType?: unknown,
  referenceKind?: unknown,
): FilePresentation {
  if (referenceKind === "directory") return { kind: "directory", label: "DIR" };
  const mime =
    typeof mimeType === "string"
      ? (mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "")
      : "";
  const known = Object.hasOwn(mimeTypes, mime) ? mimeTypes[mime] : undefined;
  if (known) return known;
  if (mime.startsWith("image/")) return { kind: "image", label: "IMAGE" };
  if (mime.startsWith("audio/")) return { kind: "audio", label: "AUDIO" };
  if (mime.startsWith("video/")) return { kind: "video", label: "VIDEO" };
  if (mime.startsWith("text/")) return { kind: "text", label: "TXT" };
  const extension =
    typeof name === "string"
      ? /\.([a-z0-9]{1,12})$/i.exec(name)?.[1]?.toLowerCase()
      : undefined;
  const kind =
    (Object.hasOwn(extensions, extension ?? "")
      ? extensions[extension ?? ""]
      : undefined) ?? "generic";
  const label =
    kind === "generic"
      ? "FILE"
      : extension === "tsx"
        ? "TS"
        : extension === "jsx"
          ? "JS"
          : (extension?.toUpperCase() ?? "FILE");
  return { kind, label };
}

export function formatFileSize(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Renderer-owned authored geometry, shared by the PM badge and App Icon Layer. */
export function fileTypeIconPaths(kind: FileKind): readonly string[] {
  const page =
    "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z M14 3v6h6";
  return match(kind)
    .with("document", () => [page, "M8 13h8M8 17h6"])
    .with("pdf", () => [page, "M8 17l2-5 2 5m-3-2h2M14 12v5h3"])
    .with("text", () => [page, "M8 12h8M8 15h8M8 18h5"])
    .with("code", () => ["M7 7l-5 5 5 5M17 7l5 5-5 5M14 4l-4 16"])
    .with("markdown", () => ["M3 17V7l5 6 5-6v10M18 7v10m-3-3 3 3 3-3"])
    .with("html", () => ["M9 3 7 21M17 3l-2 18M4 9h17M3 15h17"])
    .with("audio", () => [
      "M10 17V5l10-2v12M10 7l10-2M10 17c0 1.7-1.8 3-4 3s-4-1.3-4-3 1.8-3 4-3 4 1.3 4 3Zm10-2c0 1.7-1.8 3-4 3s-4-1.3-4-3 1.8-3 4-3 4 1.3 4 3Z",
    ])
    .with("video", () => [
      "M3 4h18v16H3ZM7 4v16M17 4v16M3 8h4m-4 4h4m-4 4h4M17 8h4m-4 4h4m-4 4h4",
    ])
    .with("archive", () => [
      "M3 7h18v14H3ZM2 3h20v4H2ZM12 7v2m0 2v2m0 2v2m-1 0h2v2h-2Z",
    ])
    .with("image", () => ["M3 3h18v18H3ZM3 17l6-7 5 5 3-3 4 5M15 7h.01"])
    .with("directory", () => ["M3 6h7l2 3h9v11H3Z"])
    .with("generic", () => [page])
    .exhaustive();
}
