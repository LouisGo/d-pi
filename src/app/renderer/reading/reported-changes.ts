import type { ToolSemantic } from "../../../modules/conversation/contracts/public";
import { reportedChanges } from "../../../modules/conversation/core/public";
import { sourceKey } from "../../../modules/resources/contracts/public";
import type { ToolTarget } from "../workbench/window-workbench";

export interface ToolChangeEvidence {
  semantic: ToolSemantic;
  target: ToolTarget;
}
export function summarizeReportedChanges(
  evidence: readonly ToolChangeEvidence[],
  limit = 128,
) {
  const files = new Map<
    string,
    { path: string; reports: { target: ToolTarget; line?: number }[] }
  >();
  let partial = false;
  for (const entry of evidence) {
    const changes = reportedChanges(entry.semantic);
    if (!changes.length) continue;
    partial ||= entry.semantic.partial || entry.semantic.truncated;
    for (const change of changes) {
      let file = files.get(change.path);
      if (!file) {
        if (files.size >= limit) {
          partial = true;
          continue;
        }
        file = { path: change.path, reports: [] };
        files.set(change.path, file);
      }
      if (
        file.reports.some(
          (report) =>
            sourceKey(report.target.source) === sourceKey(entry.target.source),
        )
      )
        continue;
      if (file.reports.length >= 8) {
        partial = true;
        continue;
      }
      file.reports.push({
        target: entry.target,
        ...(change.firstChangedLine ? { line: change.firstChangedLine } : {}),
      });
    }
  }
  return { files: [...files.values()], partial };
}
