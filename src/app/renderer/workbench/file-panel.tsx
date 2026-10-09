import { useQueryClient } from "@tanstack/react-query";
import {
  type ComponentType,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { match } from "ts-pattern";
import type {
  ChangeScope,
  GitBridge,
  GitReply,
} from "../../../modules/changes/contracts/public";
import {
  GitReadError,
  refreshGit,
  useChanges,
  useDiff,
} from "../../../modules/changes/renderer/public";
import type {
  FileBridge,
  FileReply,
} from "../../../modules/files/contracts/public";
import {
  type FrozenSelection,
  isDiffViewTooLarge,
} from "../../../modules/files/core/public";
import type { CodeView } from "../../../modules/files/renderer/public";
import {
  FileReadError,
  refreshFiles,
  useDirectoryListing,
  useFileContent,
} from "../../../modules/files/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { ThreadContext } from "../../../modules/threads/contracts/public";
import {
  ActionGroup,
  Button,
  Disclosure,
  DisclosureTrigger,
} from "../../../modules/ui/renderer/public";
import { FileIcon, FolderIcon } from "../components/icons/common";
import { PathLabel } from "../components/ui/path-label";
import { readInFlight } from "./refresh-state";

type EditorComponent = ComponentType<{
  view: CodeView;
  onSelection: (value: FrozenSelection) => void;
}>;

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
export function FilePanel({
  resource,
  files,
  git,
  editor: Editor,
  onAttach,
}: {
  resource: ThreadContext;
  files: FileBridge;
  git: GitBridge;
  editor?: EditorComponent | undefined;
  onAttach: (
    selection: Extract<FrozenSelection, { kind: "selection" }>,
  ) => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [directory, setDirectory] = useState("");
  const [browserOpen, setBrowserOpen] = useState(true);
  const resultRef = useRef<HTMLElement>(null);
  const [filePath, setFilePath] = useState<string | undefined>(undefined);
  const [diffTarget, setDiffTarget] = useState<
    { scope: ChangeScope; path: string } | undefined
  >(undefined);
  const [active, setActive] = useState<"file" | "diff">("file");
  const [selected, setSelected] = useState<FrozenSelection | null>(null);
  const listing = useDirectoryListing({ files, resource, path: directory });
  const content = useFileContent({ files, resource, path: filePath });
  const changes = useChanges({ git, resource });
  const diff = useDiff({
    git,
    resource,
    scope: diffTarget?.scope ?? "index-worktree",
    path: diffTarget?.path,
  });
  const file = content.data;
  const changeList = changes.data;
  const diffReply = diff.data;
  const transportError =
    listing.isError || content.isError || changes.isError || diff.isError;
  const failedSamples = [
    listing.error,
    content.error,
    changes.error,
    diff.error,
  ].filter(
    (error) => error instanceof FileReadError || error instanceof GitReadError,
  );
  // A re-sample stays pending through Query's retry window, so `isError` alone
  // would leave the previous capture on screen with no sign that a read is in
  // flight. See `readInFlight` for why a disabled query must not count.
  const refreshing =
    readInFlight(listing) ||
    readInFlight(content) ||
    readInFlight(changes) ||
    readInFlight(diff);
  const refresh = () => {
    refreshFiles(client, resource);
    refreshGit(client, resource);
  };
  const listDirectory = (path: string) => {
    setDirectory(path);
    setFilePath(undefined);
    setSelected(null);
  };
  const openFile = (path: string) => {
    setBrowserOpen(false);
    setFilePath(path);
    setActive("file");
    setSelected(null);
  };
  const openDiff = (scope: ChangeScope, path: string) => {
    setBrowserOpen(false);
    setDiffTarget({ scope, path });
    setActive("diff");
    setSelected(null);
  };
  const resultTarget = active === "file" ? filePath : diffTarget?.path;
  useLayoutEffect(() => {
    if (!resultTarget || browserOpen) return;
    resultRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({ block: "start" });
  }, [resultTarget, browserOpen, active]);
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
    if (active === "diff" && diffReply?.kind === "diff")
      return {
        kind: "diff",
        left: {
          text: diffReply.left.kind === "text" ? diffReply.left.text : "",
          source: {
            path: diffReply.previousPath ?? diffReply.path,
            source: diffReply.left.source,
            version:
              diffReply.left.kind === "text"
                ? diffReply.left.version
                : "absent",
          },
        },
        right: {
          text: diffReply.right.kind === "text" ? diffReply.right.text : "",
          source: {
            path: diffReply.path,
            source: diffReply.right.source,
            version:
              diffReply.right.kind === "text"
                ? diffReply.right.version
                : "absent",
          },
        },
      };
    return null;
  }, [active, file, diffReply, t]);
  return (
    <section className="file-panel" aria-label={t("ui.files.section")}>
      <h2>{t("ui.files.section")}</h2>
      <p className="file-meta">{t("ui.files.readOnly")}</p>
      <div className="file-navigation">
        <Disclosure
          open={browserOpen}
          onToggle={(event) => setBrowserOpen(event.currentTarget.open)}
        >
          <DisclosureTrigger>{t("ui.files.choose")}</DisclosureTrigger>
          <div className="file-browser">
            <ActionGroup>
              <strong>{t("ui.files.tree")}</strong>
              <Button variant="ghost" disabled={refreshing} onClick={refresh}>
                {t("ui.files.refresh")}
              </Button>
              {directory && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    listDirectory(directory.split("/").slice(0, -1).join("/"))
                  }
                >
                  {t("ui.files.up")}
                </Button>
              )}
            </ActionGroup>
            <p className="file-meta">/{directory}</p>
            {listing.data?.kind === "unavailable" && (
              <p role="status">{reason(listing.data.reason, t)}</p>
            )}
            {listing.data?.kind === "entries" && (
              <div className="file-list">
                {listing.data.entries.map((entry) => (
                  <Button
                    key={entry.path}
                    variant="navigation"
                    className="w-full justify-start text-left"
                    title={entry.path}
                    aria-label={entry.path}
                    onClick={() =>
                      entry.kind === "directory"
                        ? listDirectory(entry.path)
                        : openFile(entry.path)
                    }
                  >
                    {entry.kind === "directory" ? <FolderIcon /> : <FileIcon />}
                    <PathLabel path={entry.name} />
                  </Button>
                ))}
              </div>
            )}
            {listing.data?.kind === "entries" && listing.data.truncated && (
              <p role="status">{t("ui.files.truncatedTree")}</p>
            )}
          </div>
          <div className="git-panel">
            <ActionGroup>
              <strong>{t("ui.files.gitHeading")}</strong>
              <Button variant="ghost" disabled={refreshing} onClick={refresh}>
                {t("ui.files.refresh")}
              </Button>
            </ActionGroup>
            <p className="file-meta">{t("ui.files.gitDisclaimer")}</p>
            {changeList?.kind === "unavailable" && (
              <p role="status">{reason(changeList.reason, t)}</p>
            )}
            {changeList?.kind === "changes" && (
              <>
                <p className="file-meta">
                  {changeList.repository} · HEAD{" "}
                  {changeList.head ?? t("ui.files.unborn")} ·{" "}
                  {changeList.capturedAt} · {t("ui.files.projectSample")}
                </p>
                <div className="change-list">
                  {changeList.entries.map((entry) => (
                    <Button
                      key={`${entry.scope}:${entry.path}`}
                      variant="navigation"
                      className="w-full justify-start text-left"
                      title={entry.path}
                      onClick={() => openDiff(entry.scope, entry.path)}
                    >
                      {entry.scope === "head-index"
                        ? t("ui.files.headIndex")
                        : entry.scope === "index-worktree"
                          ? t("ui.files.indexWorktree")
                          : t("ui.files.untracked")}{" "}
                      · {statusLabel(entry.status, t)} ·{" "}
                      <PathLabel path={entry.path} />
                    </Button>
                  ))}
                </div>
                {changeList.truncated && (
                  <p role="status">{t("ui.files.truncatedChanges")}</p>
                )}
                {!changeList.entries.length && (
                  <p className="muted">{t("ui.files.noChanges")}</p>
                )}
              </>
            )}
          </div>
        </Disclosure>
      </div>
      <section
        className="file-result"
        ref={resultRef}
        tabIndex={-1}
        aria-label={resultTarget ?? t("ui.files.section")}
      >
        {resultTarget && (
          <strong>
            {resultTarget} ·{" "}
            {t(
              active === "file"
                ? "ui.files.workingTree"
                : "ui.files.gitHeading",
            )}
          </strong>
        )}
        {resultTarget &&
          (active === "file" ? content.isFetching : diff.isFetching) && (
            <p role="status">
              {t(
                active === "file"
                  ? "ui.files.readingFile"
                  : "ui.files.readingDiff",
              )}
            </p>
          )}
        {active === "file" && file?.kind === "unavailable" && (
          <p role="status">{reason(file.reason, t)}</p>
        )}
        {active === "diff" && diffReply?.kind === "unavailable" && (
          <p role="status">{reason(diffReply.reason, t)}</p>
        )}
        {active === "file" && file?.kind === "text" && (
          <div className="file-meta">
            <Disclosure>
              <DisclosureTrigger>
                {t("ui.files.sampleDetails")}
              </DisclosureTrigger>
              <p>
                {file.path} · {t("ui.files.workingTree")} · {file.version} ·{" "}
                {file.bytes} B · {file.capturedAt} · {t("ui.files.complete")}
              </p>
            </Disclosure>
          </div>
        )}
        {active === "diff" && diffReply?.kind === "diff" && (
          <>
            <p className="file-meta">
              {diffReply.path} · {diffReply.repository} · {diffReply.capturedAt}{" "}
              · {t("ui.files.singleFileSample")}
            </p>
            <div className="diff-sources file-meta">
              <span>{diffReply.left.source}</span>
              <span>{diffReply.right.source}</span>
            </div>
            {diffReply.left.kind === "text" &&
              diffReply.right.kind === "text" &&
              diffReply.left.text === diffReply.right.text && (
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
            {Editor ? (
              <Suspense
                fallback={<p role="status">{t("ui.files.loadingEditor")}</p>}
              >
                <Editor view={view} onSelection={setSelected} />
              </Suspense>
            ) : (
              <p role="status">{t("ui.files.loadingEditor")}</p>
            )}
            <ActionGroup>
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
            </ActionGroup>
          </>
        )}
      </section>
      {refreshing && <p role="status">{t("ui.files.refreshing")}</p>}
      {transportError && (
        <div role="alert">
          <p>{t("ui.files.transportFailed")}</p>
          {failedSamples.map((error) => (
            <p key={error.traceId} className="trace">
              {t("app.trace", { traceId: error.traceId })}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
