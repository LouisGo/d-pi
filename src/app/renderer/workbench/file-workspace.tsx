import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { match } from "ts-pattern";
import { Button } from "@/components/ui/button";
import type {
  ChangeScope,
  GitBridge,
  GitReply,
} from "../../../modules/changes/contracts/public";
import type {
  FileBridge,
  FileReply,
} from "../../../modules/files/contracts/public";
import {
  type FrozenSelection,
  isDiffViewTooLarge,
} from "../../../modules/files/core/public";
import type { CodeView } from "../../../modules/files/renderer/public";
import { useI18n } from "../../../renderer/i18n/i18n-provider";

const MonacoViewer = lazy(() =>
  import("../../../modules/files/renderer/public").then(({ MonacoViewer }) => ({
    default: MonacoViewer,
  })),
);

type UnavailableReason = Extract<
  FileReply | GitReply,
  { kind: "unavailable" }
>["reason"];
function reason(
  reply: UnavailableReason,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (reply === "not-git") return t("ui.files.notGit");
  if (reply === "git-unavailable") return t("ui.files.gitUnavailable");
  if (reply === "missing") return t("ui.files.reason.missing");
  if (reply === "denied") return t("ui.files.reason.denied");
  if (reply === "binary") return t("ui.files.reason.binary");
  if (reply === "invalid-encoding") return t("ui.files.reason.encoding");
  if (reply === "too-large") return t("ui.files.reason.large");
  if (reply === "changed") return t("ui.files.reason.changed");
  if (reply === "unmerged") return t("ui.files.reason.unmerged");
  if (reply === "unsupported") return t("ui.files.reason.unsupported");
  if (reply === "not-file") return t("ui.files.reason.notFile");
  return t("ui.files.reason.failed");
}
function statusLabel(
  status: Extract<GitReply, { kind: "changes" }>["entries"][number]["status"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  return match(status)
    .with("added", () => t("ui.files.status.added"))
    .with("modified", () => t("ui.files.status.modified"))
    .with("deleted", () => t("ui.files.status.deleted"))
    .with("renamed", () => t("ui.files.status.renamed"))
    .with("unmerged", () => t("ui.files.status.unmerged"))
    .with("other", () => t("ui.files.status.other"))
    .exhaustive();
}
export function FileWorkspace({
  threadId,
  files,
  git,
  onAttach,
}: {
  threadId: string;
  files: FileBridge;
  git: GitBridge;
  onAttach: (
    selection: Extract<FrozenSelection, { kind: "selection" }>,
  ) => void;
}) {
  const { t } = useI18n();
  const [directory, setDirectory] = useState("");
  const [listing, setListing] = useState<FileReply | null>(null);
  const [file, setFile] = useState<FileReply | null>(null);
  const [changes, setChanges] = useState<GitReply | null>(null);
  const [diff, setDiff] = useState<GitReply | null>(null);
  const [active, setActive] = useState<"file" | "diff">("file");
  const [selected, setSelected] = useState<FrozenSelection | null>(null);
  const [transportError, setTransportError] = useState(false);
  const fileSequence = useRef(0);
  const gitSequence = useRef(0);
  const listDirectory = async (path: string) => {
    const generation = ++fileSequence.current;
    setTransportError(false);
    setDirectory(path);
    setListing(null);
    setFile(null);
    setSelected(null);
    try {
      const result = await files.request({
        kind: "list",
        traceId: crypto.randomUUID(),
        threadId,
        path,
      });
      if (generation === fileSequence.current) setListing(result);
    } catch {
      if (generation === fileSequence.current) setTransportError(true);
    }
  };
  const openFile = async (path: string) => {
    const generation = ++fileSequence.current;
    setTransportError(false);
    setFile(null);
    setSelected(null);
    setActive("file");
    try {
      const result = await files.request({
        kind: "read",
        traceId: crypto.randomUUID(),
        threadId,
        path,
      });
      if (generation === fileSequence.current) setFile(result);
    } catch {
      if (generation === fileSequence.current) setTransportError(true);
    }
  };
  const refreshGit = async () => {
    const generation = ++gitSequence.current;
    setTransportError(false);
    setChanges(null);
    setDiff(null);
    setSelected(null);
    try {
      const result = await git.request({
        kind: "list",
        traceId: crypto.randomUUID(),
        threadId,
      });
      if (generation === gitSequence.current) setChanges(result);
    } catch {
      if (generation === gitSequence.current) setTransportError(true);
    }
  };
  const openDiff = async (scope: ChangeScope, path: string) => {
    const generation = ++gitSequence.current;
    setTransportError(false);
    setDiff(null);
    setSelected(null);
    setActive("diff");
    try {
      const result = await git.request({
        kind: "diff",
        traceId: crypto.randomUUID(),
        threadId,
        scope,
        path,
      });
      if (generation === gitSequence.current) setDiff(result);
    } catch {
      if (generation === gitSequence.current) setTransportError(true);
    }
  };
  useEffect(() => {
    void listDirectory("");
    void refreshGit();
    return () => {
      fileSequence.current++;
      gitSequence.current++;
    };
    // The Thread identity owns these requests; button actions drive later refreshes.
  }, [threadId]);
  const view = useMemo<CodeView | null>(() => {
    if (active === "file" && file?.kind === "text")
      return {
        kind: "file",
        text: file.text,
        source: {
          path: file.path,
          source: `${t("ui.files.workingTree")} · ${file.capturedAt}`,
          version: file.version,
        },
      };
    if (active === "diff" && diff?.kind === "diff")
      return {
        kind: "diff",
        left: {
          text: diff.left.kind === "text" ? diff.left.text : "",
          source: {
            path: diff.previousPath ?? diff.path,
            source: diff.left.source,
            version: diff.left.kind === "text" ? diff.left.version : "absent",
          },
        },
        right: {
          text: diff.right.kind === "text" ? diff.right.text : "",
          source: {
            path: diff.path,
            source: diff.right.source,
            version: diff.right.kind === "text" ? diff.right.version : "absent",
          },
        },
      };
    return null;
  }, [active, file, diff, t]);
  return (
    <section className="file-workspace" aria-label={t("ui.files.section")}>
      <h2>{t("ui.files.section")}</h2>
      <p className="file-meta">{t("ui.files.readOnly")}</p>
      <div className="file-browser">
        <div className="flex gap-2">
          <strong>{t("ui.files.tree")}</strong>
          <Button variant="ghost" onClick={() => void listDirectory(directory)}>
            {t("ui.files.refresh")}
          </Button>
          {directory && (
            <Button
              variant="ghost"
              onClick={() =>
                void listDirectory(directory.split("/").slice(0, -1).join("/"))
              }
            >
              {t("ui.files.up")}
            </Button>
          )}
        </div>
        <p className="file-meta">/{directory}</p>
        {listing?.kind === "unavailable" && (
          <p role="status">{reason(listing.reason, t)}</p>
        )}
        {listing?.kind === "entries" && (
          <div className="file-list">
            {listing.entries.map((entry) => (
              <Button
                key={entry.path}
                variant="ghost"
                onClick={() =>
                  entry.kind === "directory"
                    ? void listDirectory(entry.path)
                    : void openFile(entry.path)
                }
              >
                {entry.kind === "directory" ? "▸ " : ""}
                {entry.name}
              </Button>
            ))}
          </div>
        )}
        {listing?.kind === "entries" && listing.truncated && (
          <p role="status">{t("ui.files.truncatedTree")}</p>
        )}
      </div>
      <div className="git-panel">
        <div className="flex gap-2">
          <strong>{t("ui.files.gitHeading")}</strong>
          <Button variant="ghost" onClick={() => void refreshGit()}>
            {t("ui.files.refresh")}
          </Button>
        </div>
        <p className="file-meta">{t("ui.files.gitDisclaimer")}</p>
        {changes?.kind === "unavailable" && (
          <p role="status">{reason(changes.reason, t)}</p>
        )}
        {changes?.kind === "changes" && (
          <>
            <p className="file-meta">
              {changes.repository} · HEAD {changes.head ?? t("ui.files.unborn")}{" "}
              · {changes.capturedAt} · {t("ui.files.projectSample")}
            </p>
            <div className="change-list">
              {changes.entries.map((entry) => (
                <Button
                  key={`${entry.scope}:${entry.path}`}
                  variant="ghost"
                  onClick={() => void openDiff(entry.scope, entry.path)}
                >
                  {entry.scope === "head-index"
                    ? t("ui.files.headIndex")
                    : entry.scope === "index-worktree"
                      ? t("ui.files.indexWorktree")
                      : t("ui.files.untracked")}{" "}
                  · {statusLabel(entry.status, t)} · {entry.path}
                </Button>
              ))}
            </div>
            {changes.truncated && (
              <p role="status">{t("ui.files.truncatedChanges")}</p>
            )}
            {!changes.entries.length && (
              <p className="muted">{t("ui.files.noChanges")}</p>
            )}
          </>
        )}
      </div>
      {active === "file" && file?.kind === "unavailable" && (
        <p role="status">{reason(file.reason, t)}</p>
      )}
      {active === "diff" && diff?.kind === "unavailable" && (
        <p role="status">{reason(diff.reason, t)}</p>
      )}
      {active === "file" && file?.kind === "text" && (
        <p className="file-meta">
          {file.path} · {t("ui.files.workingTree")} · {file.version} ·{" "}
          {file.bytes} B · {file.capturedAt} · {t("ui.files.complete")}
        </p>
      )}
      {active === "diff" && diff?.kind === "diff" && (
        <>
          <p className="file-meta">
            {diff.path} · {diff.repository} · {diff.capturedAt} ·{" "}
            {t("ui.files.singleFileSample")}
          </p>
          <div className="diff-sources file-meta">
            <span>{diff.left.source}</span>
            <span>{diff.right.source}</span>
          </div>
          {diff.left.kind === "text" &&
            diff.right.kind === "text" &&
            diff.left.text === diff.right.text && (
              <p className="file-meta">{t("ui.files.sameText")}</p>
            )}
        </>
      )}
      {view?.kind === "diff" && isDiffViewTooLarge(view) ? (
        <p role="status">
          {t("ui.files.diffTooLarge", {
            left: view.left.text.length,
            right: view.right.text.length,
          })}
        </p>
      ) : null}
      {view && !(view.kind === "diff" && isDiffViewTooLarge(view)) && (
        <>
          <Suspense
            fallback={<p role="status">{t("ui.files.loadingEditor")}</p>}
          >
            <MonacoViewer view={view} onSelection={setSelected} />
          </Suspense>
          <div className="flex gap-2">
            <Button
              disabled={selected?.kind !== "selection"}
              onClick={() => {
                if (selected?.kind === "selection") onAttach(selected);
              }}
            >
              {t("ui.files.attachSelection")}
            </Button>
            <span className="file-meta">
              {selected?.kind === "invalid"
                ? selected.reason === "too-large"
                  ? t("ui.files.selectionTooLarge")
                  : selected.reason === "range"
                    ? t("ui.files.selectionRangeInvalid")
                    : t("ui.files.selectionEmpty")
                : t("ui.files.selectionFrozen")}
            </span>
            {selected?.kind === "selection" && (
              <span className="file-meta">{`${selected.path}:${selected.startLine}:${selected.startColumn}-${selected.endLine}:${selected.endColumn} · ${selected.source}`}</span>
            )}
          </div>
        </>
      )}
      {transportError && <p role="alert">{t("ui.files.transportFailed")}</p>}
    </section>
  );
}
