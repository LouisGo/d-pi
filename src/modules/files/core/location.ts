import type { CodeViewModel, TextRange } from "./selection";

export type CodeLocation = {
  version: string;
  startLine: number;
  endLine: number;
} & ({ kind: "file" } | { kind: "diff"; side: "left" | "right" });

export function codeLocationRange(
  view: CodeViewModel,
  location: CodeLocation,
): TextRange | null {
  if (view.kind !== location.kind) return null;
  const pane =
    view.kind === "file"
      ? view
      : location.kind === "diff"
        ? view[location.side]
        : null;
  if (
    !pane ||
    pane.source.version !== location.version ||
    !Number.isInteger(location.startLine) ||
    !Number.isInteger(location.endLine) ||
    location.startLine < 1 ||
    location.endLine < location.startLine
  )
    return null;
  const lines = pane.text.split(/\r\n|\r|\n/);
  if (location.endLine > lines.length) return null;
  return {
    startLineNumber: location.startLine,
    endLineNumber: location.endLine,
    startColumn: 1,
    endColumn: (lines[location.endLine - 1]?.length ?? 0) + 1,
  };
}
