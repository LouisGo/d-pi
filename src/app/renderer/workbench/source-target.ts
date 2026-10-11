import type { ChangeScope } from "../../../modules/changes/contracts/public";
import type { HistoryCursor } from "../../../modules/conversation/contracts/public";
import type { SourceRef } from "../../../modules/resources/contracts/public";

export interface ToolTarget {
  source: SourceRef;
  title: string;
  threadTitle: string;
  rowId: string;
  cursor?: HistoryCursor;
  artifactKey?: string;
  nativeRecordId?: string;
}
export interface ReportedRange {
  startLine: number;
  endLine: number;
}
type WorkspaceIdentity = {
  threadId: string;
  directory: string;
  path: string;
};
export type WorkspaceFileRef = WorkspaceIdentity &
  (
    | { kind: "current-workspace"; reportedRange?: ReportedRange }
    | { kind: "captured-workspace"; version: string; range?: ReportedRange }
  );
export type VersionedDiffRef = WorkspaceIdentity & {
  scope: ChangeScope;
  leftVersion: string | null;
  rightVersion: string | null;
  side: "left" | "right";
  range?: ReportedRange;
};
export type WorkspaceSourceTarget =
  | { kind: "file"; file: WorkspaceFileRef }
  | { kind: "diff"; diff: VersionedDiffRef };
export type SourceTarget =
  | { kind: "activity"; activity: ToolTarget }
  | { kind: "artifact"; artifact: ToolTarget }
  | WorkspaceSourceTarget;

/** UI routing only. Main still owns canonical containment and read authority. */
export function projectRelativePath(
  directory: string,
  reported: string,
): string | null {
  const base = directory.replace(/\/+$/, "");
  const path = reported.startsWith("/")
    ? reported.startsWith(`${base}/`)
      ? reported.slice(base.length + 1)
      : null
    : reported;
  if (
    !path ||
    path.length > 4096 ||
    path.includes("\0") ||
    path.includes("\\") ||
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(path)
  )
    return null;
  const parts = path.split("/");
  if (parts.some((part) => part === "..")) return null;
  const normalized = parts.filter((part) => part && part !== ".").join("/");
  return normalized || null;
}
