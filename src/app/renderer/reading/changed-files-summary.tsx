import { useContext, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import type {
  ChangeScope,
  GitBridge,
} from "../../../modules/changes/contracts/public";
import { useChanges, useDiff } from "../../../modules/changes/renderer/public";
import type { ConversationModel } from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { ThreadContext } from "../../../modules/threads/contracts/public";
import {
  Button,
  Disclosure,
  DisclosureTrigger,
} from "../../../modules/ui/renderer/public";
import { PathLabel } from "../components/ui/path-label";
import { fileReadReason } from "../workbench/file-read-reason";
import { projectRelativePath } from "../workbench/source-target";
import { ToolWorkbenchContext } from "../workbench/tool-inspector";
import type { SourceCapture } from "../workbench/window-workbench";
import {
  summarizeReportedChanges,
  type ToolChangeEvidence,
} from "./reported-changes";

export function ChangedFilesSummary({
  model,
  evidence,
  resource,
  git,
  active = true,
}: {
  model: ConversationModel;
  evidence: () => readonly ToolChangeEvidence[];
  resource?: ThreadContext | undefined;
  git?: GitBridge | undefined;
  active?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Disclosure
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <DisclosureTrigger>{t("activity.changedFiles")}</DisclosureTrigger>
      {open && active && (
        <ChangeEvidence
          model={model}
          evidence={evidence}
          resource={resource}
          git={git}
        />
      )}
    </Disclosure>
  );
}
function ChangeEvidence({
  model,
  evidence,
  resource,
  git,
}: Omit<Parameters<typeof ChangedFilesSummary>[0], "active">) {
  useStore(model.stateStore, (state) => state.changeRevision);
  const { t } = useI18n();
  const workbench = useContext(ToolWorkbenchContext);
  const summary = summarizeReportedChanges(evidence());
  const [sample, setSample] = useState(false);
  return (
    <div data-changed-files-summary>
      <p>{t("activity.changesCoverage")}</p>
      <strong>{t("activity.toolChanges")}</strong>
      {!summary.files.length && <p>{t("activity.noReportedChanges")}</p>}
      {summary.partial && <p role="status">{t("activity.changesPartial")}</p>}
      <ul>
        {summary.files.map((file) => (
          <li key={file.path}>
            <PathLabel path={file.path} />
            {file.reports.map((report) => {
              const path =
                resource?.threadId === report.target.source.threadId
                  ? projectRelativePath(resource.directory, file.path)
                  : null;
              return (
                <span key={JSON.stringify(report.target.source)}>
                  <Button
                    variant="ghost"
                    disabled={!workbench}
                    onClick={() =>
                      void workbench?.reveal({
                        kind: "activity",
                        activity: report.target,
                      })
                    }
                  >
                    {report.target.title}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!resource || !workbench || path === null}
                    onClick={() => {
                      if (!resource || !workbench || path === null) return;
                      void workbench.reveal({
                        kind: "file",
                        file: {
                          kind: "current-workspace",
                          threadId: resource.threadId,
                          directory: resource.directory,
                          path,
                          ...(report.line
                            ? {
                                reportedRange: {
                                  startLine: report.line,
                                  endLine: report.line,
                                },
                              }
                            : {}),
                        },
                      });
                    }}
                  >
                    {t("tool.semantic.openCurrentFile")}
                  </Button>
                </span>
              );
            })}
          </li>
        ))}
      </ul>
      <strong>{t("activity.gitChanges")}</strong>
      <p>{t("ui.files.gitDisclaimer")}</p>
      {git &&
        resource &&
        (!sample ? (
          <Button variant="ghost" onClick={() => setSample(true)}>
            {t("activity.sampleGit")}
          </Button>
        ) : (
          <CurrentGitSample git={git} resource={resource} />
        ))}
    </div>
  );
}
function CurrentGitSample({
  git,
  resource,
}: {
  git: GitBridge;
  resource: ThreadContext;
}) {
  const { t } = useI18n();
  const workbench = useContext(ToolWorkbenchContext);
  const sample = useChanges({ git, resource });
  const [target, setTarget] = useState<{
    path: string;
    scope: ChangeScope;
    intent: number;
    capture: SourceCapture;
  } | null>(null);
  const data = sample.data;
  return (
    <div data-current-git-sample>
      {sample.isFetching && <p role="status">{t("ui.files.refreshing")}</p>}
      {sample.isError && <p role="alert">{t("ui.files.transportFailed")}</p>}
      {data?.kind === "unavailable" && (
        <p role="status">{fileReadReason(data.reason, t)}</p>
      )}
      {data?.kind === "changes" && (
        <>
          <p>
            {data.repository} · HEAD {data.head ?? t("ui.files.unborn")} ·{" "}
            {data.capturedAt}
          </p>
          {data.truncated && (
            <p role="status">{t("ui.files.truncatedChanges")}</p>
          )}
          {!data.entries.length && <p>{t("ui.files.noChanges")}</p>}
          <ul>
            {data.entries.map((entry) => (
              <li key={JSON.stringify([entry.scope, entry.path])}>
                <Button
                  variant="ghost"
                  disabled={!workbench}
                  onClick={() =>
                    setTarget({
                      path: entry.path,
                      scope: entry.scope,
                      intent: (target?.intent ?? 0) + 1,
                      capture: workbench?.beginSourceCapture() ?? {
                        current: () => false,
                        release: () => {},
                      },
                    })
                  }
                >
                  {t(
                    entry.scope === "head-index"
                      ? "ui.files.headIndex"
                      : entry.scope === "index-worktree"
                        ? "ui.files.indexWorktree"
                        : "ui.files.untracked",
                  )}{" "}
                  · <PathLabel path={entry.path} />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {target && (
        <CaptureDiff
          key={target.intent}
          git={git}
          resource={resource}
          target={target}
        />
      )}
    </div>
  );
}
function CaptureDiff({
  git,
  resource,
  target,
}: {
  git: GitBridge;
  resource: ThreadContext;
  target: { path: string; scope: ChangeScope; capture: SourceCapture };
}) {
  const { t } = useI18n();
  const workbench = useContext(ToolWorkbenchContext);
  const sample = useDiff({ git, resource, ...target });
  useEffect(() => () => target.capture.release(), [target.capture]);
  useEffect(() => {
    if (sample.isError || sample.data?.kind === "unavailable")
      target.capture.release();
  }, [sample.isError, sample.data, target.capture]);
  const sent = useRef(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const data = sample.data;
    if (
      sent.current ||
      !workbench ||
      sample.isFetching ||
      sample.isError ||
      data?.kind !== "diff"
    )
      return;
    sent.current = true;
    if (!target.capture.current()) {
      setBlocked(true);
      return;
    }
    let current = true;
    void workbench
      .reveal({
        kind: "diff",
        diff: {
          threadId: resource.threadId,
          directory: resource.directory,
          path: data.path,
          scope: data.scope,
          leftVersion: data.left.kind === "text" ? data.left.version : null,
          rightVersion: data.right.kind === "text" ? data.right.version : null,
          side: data.right.kind === "text" ? "right" : "left",
        },
      })
      .then((applied) => {
        if (current) setBlocked(!applied);
      });
    return () => {
      current = false;
    };
  }, [
    sample.data,
    sample.isFetching,
    sample.isError,
    workbench,
    resource,
    target,
  ]);
  return sample.isFetching ? (
    <p role="status">{t("ui.files.readingDiff")}</p>
  ) : sample.data?.kind === "unavailable" ? (
    <p role="status">{fileReadReason(sample.data.reason, t)}</p>
  ) : blocked ? (
    <p role="status">{t("activity.captureUnavailable")}</p>
  ) : sample.isError ? (
    <p role="alert">{t("ui.files.transportFailed")}</p>
  ) : null;
}
