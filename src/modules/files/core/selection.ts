import { utf8ByteLength } from "../../../shared/text/utf8";

export interface TextRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}
export interface SelectionSource {
  path: string;
  source: string;
  version: string;
}
export type FrozenSelection =
  | { kind: "invalid"; reason: "empty" | "range" | "too-large" }
  | {
      kind: "selection";
      path: string;
      source: string;
      version: string;
      text: string;
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
const MAX_SELECTION_BYTES = 64 * 1024;
/** Per-pane Monaco diff budget. Full file reads allow 5 MiB, but running the
 * diff algorithm on two multi-megabyte panes hangs the renderer. Sides above
 * this limit stay readable as versions/sources; only the visual compare waits. */
export const MAX_DIFF_PANE_CHARS = 512 * 1024;
export interface CodePane {
  text: string;
  source: SelectionSource;
}
export type CodeViewModel =
  | { kind: "file"; text: string; source: SelectionSource }
  | { kind: "diff"; left: CodePane; right: CodePane };
/** Stable editor identity: locale display strings must not recreate Monaco. */
export function codeViewIdentity(view: CodeViewModel): string {
  if (view.kind === "file")
    return `file|${view.source.path}|${view.source.version}|${view.text.length}`;
  return (
    `diff|${view.left.source.path}|${view.left.source.version}|${view.left.text.length}` +
    `|${view.right.source.path}|${view.right.source.version}|${view.right.text.length}`
  );
}
export function isDiffViewTooLarge(view: CodeViewModel): boolean {
  return (
    view.kind === "diff" &&
    (view.left.text.length > MAX_DIFF_PANE_CHARS ||
      view.right.text.length > MAX_DIFF_PANE_CHARS)
  );
}
export function captureSelection(
  text: string,
  range: TextRange,
  source: SelectionSource,
): FrozenSelection {
  // Monaco counts CRLF, lone CR and LF as one line ending and columns as
  // UTF-16 units excluding that ending. Map those positions into the raw
  // snapshot instead of slicing Monaco's normalized model value.
  const lines: { start: number; end: number }[] = [];
  let lineStart = 0;
  for (const ending of text.matchAll(/\r\n|\r|\n/g)) {
    lines.push({ start: lineStart, end: ending.index });
    lineStart = ending.index + ending[0].length;
  }
  lines.push({ start: lineStart, end: text.length });
  const {
    startLineNumber: startLine,
    startColumn,
    endLineNumber: endLine,
    endColumn,
  } = range;
  const first = lines[startLine - 1];
  const last = lines[endLine - 1];
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    !Number.isInteger(startColumn) ||
    !Number.isInteger(endColumn) ||
    startLine < 1 ||
    !first ||
    !last ||
    endLine < startLine ||
    startColumn < 1 ||
    endColumn < 1 ||
    startColumn > first.end - first.start + 1 ||
    endColumn > last.end - last.start + 1 ||
    (startLine === endLine && endColumn < startColumn)
  )
    return { kind: "invalid", reason: "range" };
  const selected = text.slice(
    first.start + startColumn - 1,
    last.start + endColumn - 1,
  );
  if (!selected) return { kind: "invalid", reason: "empty" };
  if (utf8ByteLength(selected) > MAX_SELECTION_BYTES)
    return { kind: "invalid", reason: "too-large" };
  return {
    kind: "selection",
    path: source.path,
    source: source.source,
    version: source.version,
    text: selected,
    startLine,
    startColumn,
    endLine,
    endColumn,
  };
}
