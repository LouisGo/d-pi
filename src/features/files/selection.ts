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
  if (new TextEncoder().encode(selected).length > MAX_SELECTION_BYTES)
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
