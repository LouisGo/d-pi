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
  const lines = text.split("\n");
  const {
    startLineNumber: startLine,
    startColumn,
    endLineNumber: endLine,
    endColumn,
  } = range;
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    !Number.isInteger(startColumn) ||
    !Number.isInteger(endColumn) ||
    startLine < 1 ||
    endLine > lines.length ||
    endLine < startLine ||
    startColumn < 1 ||
    endColumn < 1 ||
    startColumn > (lines[startLine - 1]?.length ?? -1) + 1 ||
    endColumn > (lines[endLine - 1]?.length ?? -1) + 1 ||
    (startLine === endLine && endColumn < startColumn)
  )
    return { kind: "invalid", reason: "range" };
  const offset = (line: number, column: number) =>
    lines.slice(0, line - 1).reduce((sum, part) => sum + part.length + 1, 0) +
    column -
    1;
  const selected = text.slice(
    offset(startLine, startColumn),
    offset(endLine, endColumn),
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
