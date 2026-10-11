import { expect, it } from "vitest";
import type { ToolChangeEvidence } from "./reported-changes";
import { summarizeReportedChanges } from "./reported-changes";

export function report(
  path: string,
  id = "call",
  threadId = "A",
): ToolChangeEvidence {
  return {
    semantic: {
      kind: "file-change",
      transportTool: "edit",
      effectiveTool: "edit",
      phase: "result",
      partial: false,
      truncated: false,
      changes: [
        { path, failed: false, snapshotsPruned: false, firstChangedLine: 3 },
      ],
    },
    target: {
      source: {
        kind: "live-tool",
        threadId,
        nativeSessionKey: "native",
        connectionGeneration: "generation",
        toolCallId: id,
      },
      title: "edit",
      threadTitle: threadId,
      rowId: id,
    },
  };
}
it("keeps each proven source of a successful path without counting intent, failed paths or duplicate sources", () => {
  const first = report("a.ts");
  const intent = {
    ...first,
    semantic: { ...first.semantic, phase: "intent" as const },
  };
  const failed = report("failed.ts");
  if (failed.semantic.kind !== "file-change") throw Error("missing changes");
  const path = failed.semantic.changes[0];
  if (!path) throw Error("missing path");
  path.failed = true;
  expect(
    summarizeReportedChanges([
      first,
      intent,
      failed,
      first,
      report("a.ts", "second"),
    ]),
  ).toMatchObject({
    files: [
      {
        path: "a.ts",
        reports: [
          { target: first.target, line: 3 },
          { target: { rowId: "second" }, line: 3 },
        ],
      },
    ],
    partial: false,
  });
});
it("bounds displayed paths and sources and declares omitted coverage", () => {
  const summary = summarizeReportedChanges(
    [
      ...Array.from({ length: 10 }, (_, index) =>
        report("a.ts", String(index)),
      ),
      report("b.ts"),
      report("c.ts"),
    ],
    2,
  );
  expect(summary.files.map((file) => [file.path, file.reports.length])).toEqual(
    [
      ["a.ts", 8],
      ["b.ts", 1],
    ],
  );
  expect(summary.partial).toBe(true);
});
