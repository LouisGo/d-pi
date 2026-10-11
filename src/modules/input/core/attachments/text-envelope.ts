import { match } from "ts-pattern";

/** Shared sending/history grammar. Legacy PDF labels remain readable. */
export function attachmentTextHeader(
  name: string,
  kind: "text" | "directory" | "pdf" | "document",
  textOnly = false,
): string {
  const label = match(kind)
    .with("text", () => "")
    .with("directory", () => "; directory listing")
    .with(
      "pdf",
      () =>
        `; PDF converted to Markdown${textOnly ? "; explicit text-only" : ""}`,
    )
    .with("document", () => "; document converted to Markdown")
    .exhaustive();
  return `\n[${name}${label}]\n`;
}
export function attachmentTextHeaders(name: string): string[] {
  return [
    attachmentTextHeader(name, "text"),
    attachmentTextHeader(name, "directory"),
    attachmentTextHeader(name, "pdf"),
    attachmentTextHeader(name, "pdf", true),
    attachmentTextHeader(name, "document"),
    `\n[${name}; PDF text]\n`,
    `\n[${name}; PDF text; explicit text-only]\n`,
  ];
}
