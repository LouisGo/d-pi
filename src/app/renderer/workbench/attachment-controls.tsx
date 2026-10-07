import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";
import {
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useStore } from "zustand";
import type { SubmissionFailure } from "../../../modules/execution/contracts/public";
import type { ProjectReferenceEntry } from "../../../modules/files/contracts/public";
import type {
  Attachment,
  AttachmentPreview,
  AttachmentStorageReport,
} from "../../../modules/input/contracts/public";
import type {
  AttachmentIntent,
  AttachmentModel,
} from "../../../modules/input/core/public";
import type { AttachmentImports } from "../../../modules/input/renderer/public";
import {
  attachmentIds,
  attachmentMention,
  createAttachmentEditor,
  moveAttachmentReference,
  removeAttachmentReference,
  syncAttachmentLabels,
} from "../../../modules/input/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Button,
  Disclosure,
  DisclosureTrigger,
  Slider,
  TextInput,
} from "../../../modules/ui/renderer/public";
import type {
  AttachmentBridge,
  AttachmentRequest,
} from "../../contracts/attachments";
import { FileIcon, FolderIcon } from "../components/icons/common";

export type AttachmentActions = {
  canLeaveView(): boolean;
  importFiles(files: File[], source: "paste" | "drop"): void;
  handleMentionKey(event: KeyboardEvent): boolean;
};
type Mention = ReturnType<typeof attachmentMention>;

export function AttachmentControls({
  bridge,
  threadId,
  editor,
  text,
  isCurrent,
  onBlocked,
  mention,
  dismissMention,
  model,
  imports,
  preparationFailure,
  onClearHistory,
  ref,
}: {
  bridge: AttachmentBridge;
  threadId: AttachmentRequest["threadId"];
  editor: Editor | null;
  text: string;
  isCurrent: () => boolean;
  onBlocked: (blocked: boolean) => void;
  mention: Mention;
  dismissMention: () => void;
  model: AttachmentModel;
  imports: AttachmentImports;
  preparationFailure?: SubmissionFailure["preparation"] | null;
  onClearHistory?: () => Promise<boolean>;
  ref?: Ref<AttachmentActions>;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const listKey = ["input-attachments", threadId] as const;
  const list = useQuery({
    queryKey: listKey,
    queryFn: () =>
      bridge.request({ kind: "list", threadId, traceId: crypto.randomUUID() }),
    networkMode: "always",
    retry: false,
  });
  const items = list.data?.kind === "attachments" ? list.data.items : [];
  const ids = attachmentIds(text);
  const active = ids.map((id) => items.find((item) => item.id === id));
  const unused = items.filter((item) => !ids.includes(item.id));
  const [storageReport, setStorageReport] =
    useState<AttachmentStorageReport | null>(null);
  const accepting = useStore(
    model.stateStore,
    (state) => state.acceptingSources,
  );
  const acceptingFiles = useStore(
    imports.stateStore,
    (state) => state.acceptingSources,
  );
  const sourceFrozen = !accepting || !acceptingFiles;
  const pending = useStore(model.stateStore, (state) => state.pending);
  const failed = useStore(model.stateStore, (state) => state.failed);
  const feedback = useStore(model.stateStore, (state) => state.feedback);
  const insertions = useStore(model.stateStore, (state) => state.insertions);
  const completion = useStore(model.stateStore, (state) => state.completion);
  const importing = useStore(imports.stateStore, (state) => state.pending);
  const fileFailures = useStore(imports.stateStore, (state) => state.failures);

  const [manualSearch, setManualSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState<{
    item: Attachment;
    content: AttachmentPreview;
  } | null>(null);
  const searchOpen = manualSearch || !!mention;
  const searchQuery = mention?.query ?? query;
  const [settledQuery, setSettledQuery] = useState(searchQuery);
  useEffect(() => {
    if (!searchOpen) return;
    const timer = setTimeout(() => setSettledQuery(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchOpen, searchQuery]);
  const refreshSearch = useRef(false);
  const search = useQuery({
    queryKey: ["input-reference-search", threadId, settledQuery],
    queryFn: () => {
      const refresh = refreshSearch.current;
      refreshSearch.current = false;
      return bridge.request({
        kind: "search-reference",
        threadId,
        traceId: crypto.randomUUID(),
        query: settledQuery,
        refresh,
      });
    },
    enabled: searchOpen && settledQuery === searchQuery,
    staleTime: 0,
    gcTime: 60000,
    networkMode: "always",
    retry: false,
  });
  const searchPending = settledQuery !== searchQuery || search.isFetching;
  const entries =
    !searchPending && !search.isError && search.data?.kind === "search"
      ? search.data.entries
      : [];
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setSelected(0);
  }, [searchQuery]);
  useEffect(() => {
    onBlocked(
      pending > 0 ||
        !!failed ||
        insertions.length > 0 ||
        importing > 0 ||
        fileFailures.length > 0 ||
        (ids.length > 0 &&
          (list.isFetching ||
            list.isError ||
            active.some(
              (item) =>
                !item ||
                (item.source !== "reference" && item.status !== "ready"),
            ))),
    );
  }, [
    pending,
    failed,
    insertions,
    importing,
    fileFailures,
    text,
    list.data,
    list.isFetching,
    list.isError,
    onBlocked,
  ]);
  useEffect(() => {
    if (editor) syncAttachmentLabels(editor, items);
  }, [editor, list.data, text]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const detach = model.attachEditor(
      createAttachmentEditor(editor, isCurrent),
    );
    const flush = () => model.flushInsertions();
    editor.view.dom.addEventListener("compositionend", flush);
    return () => {
      detach();
      editor.view.dom.removeEventListener("compositionend", flush);
    };
  }, [model, editor, isCurrent]);
  function insert(item: Attachment) {
    if (isCurrent()) model.insert(item);
  }
  async function run(
    command: AttachmentIntent,
    add = false,
    range?: { from: number; to: number },
  ) {
    if (!isCurrent()) return;
    const reply = await model.run(command, add, range);
    if (!alive.current || !reply) return;
    if (reply.kind === "storage-report") setStorageReport(reply);
    else if (
      command.kind === "preview" &&
      "id" in command &&
      (reply.kind === "image" ||
        reply.kind === "text" ||
        reply.kind === "unavailable")
    ) {
      const item = items.find((item) => item.id === command.id);
      if (item) setPreview({ item, content: reply });
    }
  }
  useEffect(() => {
    if (completion > 0 || preparationFailure)
      void client.invalidateQueries({ queryKey: listKey });
  }, [completion, preparationFailure, client, threadId]);
  function importFiles(files: File[], source: "paste" | "drop") {
    if (isCurrent()) imports.importFiles(files, source);
  }
  function chooseReference(entry: ProjectReferenceEntry) {
    if (searchPending || !isCurrent() || pending > 0 || failed) return;
    const range = mention ? { from: mention.from, to: mention.to } : undefined;
    void run(
      { kind: "add-reference", path: entry.path, referenceKind: entry.kind },
      true,
      range,
    );
    setManualSearch(false);
    dismissMention();
  }
  useImperativeHandle(ref, () => ({
    canLeaveView: () => {
      const sources = imports.stateStore.getState();
      return (
        model.getReadiness().kind === "ready" &&
        sources.pending === 0 &&
        sources.failures.length === 0
      );
    },
    importFiles: (files, source) => void importFiles(files, source),
    handleMentionKey: (event) => {
      if (!searchOpen || event.isComposing) return false;
      if (event.key === "Escape") {
        setManualSearch(false);
        dismissMention();
        return true;
      }
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        setSelected((value) =>
          entries.length
            ? (value + (event.key === "ArrowDown" ? 1 : -1) + entries.length) %
              entries.length
            : 0,
        );
        return true;
      }
      if (event.key === "Enter") {
        const entry = entries[selected];
        if (entry) chooseReference(entry);
        return true;
      }
      return false;
    },
  }));
  function remove(id: string) {
    if (
      !editor ||
      editor.isDestroyed ||
      !editor.isEditable ||
      editor.view.composing ||
      !isCurrent()
    )
      return;
    removeAttachmentReference(editor, id);
  }
  function move(index: number, direction: -1 | 1) {
    if (
      !editor ||
      editor.isDestroyed ||
      !editor.isEditable ||
      editor.view.composing ||
      !isCurrent()
    )
      return;
    moveAttachmentReference(editor, index, direction);
  }
  return (
    <div className="grid gap-2 px-3 pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          disabled={
            sourceFrozen || pending > 0 || importing > 0 || !editor || !!failed
          }
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void run({ kind: "choose-import" }, true)}
        >
          {t("attachment.add")}
        </Button>
        <Button
          variant="ghost"
          disabled={sourceFrozen || !editor || !!failed}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setManualSearch((value) => !value)}
        >
          {t("attachment.reference")}
        </Button>
        <span className="muted">
          {pending || importing
            ? t("attachment.preparing")
            : t("attachment.hint")}
        </span>
      </div>
      <Disclosure>
        <DisclosureTrigger>{t("attachment.storage")}</DisclosureTrigger>
        <div className="grid gap-2 py-2">
          <p className="muted">{t("attachment.storagePolicy")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              data-attachment-storage-action="check"
              disabled={sourceFrozen || pending > 0 || importing > 0}
              onClick={() => void run({ kind: "check-storage" })}
            >
              {t("attachment.checkStorage")}
            </Button>
            <Button
              variant="ghost"
              data-attachment-storage-action="clean"
              disabled={sourceFrozen || pending > 0 || importing > 0}
              onClick={() => void run({ kind: "clean-storage" })}
            >
              {t("attachment.cleanStorage")}
            </Button>
          </div>
          {storageReport && (
            <div
              data-attachment-storage-report=""
              className="grid gap-2"
              role="status"
              aria-live="polite"
            >
              <p>
                {t("attachment.storageSummary", {
                  checked: storageReport.checkedObjects,
                  retained: storageReport.retainedObjects,
                  unused: storageReport.unreferencedObjects,
                  remaining: storageReport.remainingObjects,
                })}
              </p>
              <p>
                {t("attachment.storageDeleted", {
                  count: storageReport.deletedObjects,
                  bytes: storageReport.deletedBytes,
                })}
              </p>
              {storageReport.issues.length > 0 && (
                <>
                  <ul className="grid max-h-40 gap-1 overflow-auto">
                    {storageReport.issues.map((issue) => (
                      <li
                        key={`${issue.attachmentId}:${issue.object}:${issue.digest ?? ""}`}
                        className="break-all"
                      >
                        <strong>{issue.name}</strong> ·{" "}
                        {t(
                          issue.object === "original"
                            ? "attachment.storageOriginal"
                            : "attachment.storageDerived",
                        )}
                        : {t(`attachment.reason.${issue.reason}`)}
                      </li>
                    ))}
                  </ul>
                  <p>{t("attachment.storageReattach")}</p>
                  <Button
                    variant="ghost"
                    disabled={
                      sourceFrozen ||
                      pending > 0 ||
                      importing > 0 ||
                      !editor ||
                      !!failed
                    }
                    onClick={() => void run({ kind: "choose-import" }, true)}
                  >
                    {t("attachment.add")}
                  </Button>
                </>
              )}
              {(storageReport.manifestScanIncomplete ||
                storageReport.referenceScanIncomplete) && (
                <p>{t("attachment.storageReferencePending")}</p>
              )}
              {storageReport.discoveryPending && (
                <p>{t("attachment.storageDiscoveryPending")}</p>
              )}
              {storageReport.issuesTruncated && (
                <p>{t("attachment.storageIssuesTruncated")}</p>
              )}
            </div>
          )}
          {!!unused.length && (
            <Disclosure>
              <DisclosureTrigger>{t("attachment.library")}</DisclosureTrigger>
              <div className="grid max-h-40 gap-2 overflow-auto">
                {unused.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="break-all">{item.name}</span>
                    <Button
                      variant="ghost"
                      disabled={sourceFrozen}
                      onClick={() => insert(item)}
                    >
                      {t("attachment.insert")}
                    </Button>
                  </div>
                ))}
              </div>
            </Disclosure>
          )}
        </div>
      </Disclosure>
      {insertions.map(({ item }) => (
        <div
          key={item.id}
          role="status"
          className="flex flex-wrap items-center gap-2"
        >
          <span>{t("attachment.awaitingInsertion", { name: item.name })}</span>
          <Button
            variant="ghost"
            disabled={sourceFrozen || !editor}
            onClick={() => insert(item)}
          >
            {t("attachment.insert")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => model.removeInsertion(item.id)}
          >
            {t("attachment.discardPrepared")}
          </Button>
        </div>
      ))}
      {(failed || list.isError) && (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <p className="failure">
            {failed?.reason
              ? t(`attachment.reason.${failed.reason}`)
              : t("attachment.transportFailed")}
          </p>
          {failed && (
            <>
              <Button
                variant="ghost"
                disabled={sourceFrozen || pending > 0}
                onClick={() => void model.retryFailure()}
              >
                {t("attachment.retry")}
              </Button>
              {failed.command.kind !== "clipboard-discard" && (
                <Button variant="ghost" onClick={() => model.removeFailure()}>
                  {t("attachment.dismissFailedRequest")}
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {feedback && (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <p className="failure">
            {feedback.reason
              ? t(`attachment.reason.${feedback.reason}`)
              : t("attachment.transportFailed")}
          </p>
          <Button
            variant="ghost"
            disabled={sourceFrozen || pending > 0}
            onClick={() => void run(feedback.command)}
          >
            {t("attachment.retry")}
          </Button>
          {feedback.reason === "editor-history-limit" && onClearHistory && (
            <Button
              variant="ghost"
              disabled={
                sourceFrozen || pending > 0 || !editor || editor.view.composing
              }
              onClick={() => {
                if (!isCurrent()) return;
                void onClearHistory().then((cleared) => {
                  if (cleared && isCurrent()) void run(feedback.command);
                });
              }}
            >
              {t("attachment.clearHistoryRetry")}
            </Button>
          )}
          <Button variant="ghost" onClick={() => model.dismissFeedback()}>
            {t("attachment.dismissFailedRequest")}
          </Button>
        </div>
      )}
      {searchOpen && (
        <div
          className="grid gap-2 rounded-md border border-border bg-muted p-2"
          role="region"
          aria-label={t("attachment.searchLabel")}
        >
          {manualSearch && (
            <TextInput
              aria-label={t("attachment.searchLabel")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          )}
          {searchPending ? (
            <p role="status">{t("attachment.searching")}</p>
          ) : search.isError || search.data?.kind === "unavailable" ? (
            <p role="alert">{t("attachment.searchFailed")}</p>
          ) : (
            <div
              className="grid max-h-40 gap-1 overflow-auto"
              role="listbox"
              aria-label={t("attachment.searchLabel")}
            >
              {entries.map((entry, index) => (
                <Button
                  key={entry.path}
                  data-reference-kind={entry.kind}
                  data-reference-path={entry.path}
                  className="justify-start text-left"
                  variant={selected === index ? "navigation" : "ghost"}
                  role="option"
                  disabled={sourceFrozen || pending > 0 || !!failed}
                  aria-selected={selected === index}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseReference(entry)}
                >
                  {entry.kind === "directory" ? (
                    <FolderIcon className="shrink-0" />
                  ) : (
                    <FileIcon className="shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 whitespace-normal break-all">
                    {entry.path}
                    {entry.kind === "directory" ? "/" : ""}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {t(
                      entry.kind === "directory"
                        ? "attachment.directoryKind"
                        : "attachment.fileKind",
                    )}
                  </span>
                </Button>
              ))}
              {!entries.length && <p>{t("attachment.noMatches")}</p>}
            </div>
          )}
          {!searchPending &&
            search.data?.kind === "search" &&
            search.data.truncated && <p>{t("attachment.searchLimited")}</p>}
          <Button
            variant="ghost"
            disabled={searchPending}
            onClick={() => {
              refreshSearch.current = true;
              void search.refetch();
            }}
          >
            {t("attachment.refreshSearch")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setManualSearch(false);
              dismissMention();
            }}
          >
            {t("attachment.cancelSearch")}
          </Button>
        </div>
      )}
      {preparationFailure && (
        <div role="alert" className="failure">
          <strong>
            {items.find((item) => item.id === preparationFailure.attachmentId)
              ?.name ??
              preparationFailure.attachmentId ??
              t("attachment.add")}
          </strong>
          <p>{t(`attachment.reason.${preparationFailure.reason}`)}</p>
          {preparationFailure.reason === "editor-history-limit" &&
            onClearHistory && (
              <Button
                variant="ghost"
                disabled={
                  sourceFrozen ||
                  pending > 0 ||
                  !editor ||
                  editor.view.composing
                }
                onClick={() => {
                  if (isCurrent()) void onClearHistory();
                }}
              >
                {t("attachment.clearHistory")}
              </Button>
            )}
          {preparationFailure.reason === "reference-unavailable" ||
          preparationFailure.reason === "reference-denied" ? (
            <p>{t("attachment.referenceRetrySending")}</p>
          ) : null}
        </div>
      )}
      {fileFailures.map((failure) => (
        <div
          key={failure.id}
          className="flex flex-wrap items-center gap-2"
          role="alert"
        >
          <strong>{failure.file.name}</strong>
          <p className="failure">
            {failure.reason === "source-too-large"
              ? t("attachment.reason.source-too-large")
              : t("attachment.transportFailed")}
          </p>
          {failure.reason !== "source-too-large" && (
            <Button
              variant="ghost"
              onClick={() => {
                imports.removeFailure(failure.id);
                void importFiles([failure.file], failure.source);
              }}
            >
              {t("attachment.retry")}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => imports.removeFailure(failure.id)}
          >
            {t("attachment.remove", { name: failure.file.name })}
          </Button>
        </div>
      ))}
      {active.length > 0 && (
        <ol
          className="grid max-h-40 gap-2 overflow-auto"
          aria-label={t("attachment.add")}
        >
          {active.map((item, index) => (
            <li
              key={`${ids[index]}:${index}`}
              className="grid gap-1 rounded-md border border-border p-2"
            >
              {item ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="flex items-center gap-2 break-all">
                      {(item.source === "reference" || item.frozenReference) &&
                        (item.referenceKind === "directory" ? (
                          <FolderIcon />
                        ) : (
                          <FileIcon />
                        ))}
                      {item.name}
                      {item.referenceKind === "directory" ? "/" : ""}
                    </strong>
                    <span className="muted">
                      {item.frozenReference
                        ? t("attachment.frozenOnCopy")
                        : item.source === "reference"
                          ? t(
                              item.referenceKind === "directory"
                                ? "attachment.directoryAtSend"
                                : "attachment.readAtSend",
                            )
                          : t(`attachment.${item.status}`)}
                      {item.source !== "reference" && (
                        <> · {Math.ceil(item.byteLength / 1024)} KiB</>
                      )}
                    </span>
                  </div>
                  {item.frozenReference && (
                    <div className="muted">
                      <Disclosure data-selectable>
                        <DisclosureTrigger>
                          {t("attachment.frozenSource")}
                        </DisclosureTrigger>
                        <dl className="grid gap-1 break-all">
                          <dt>{t("attachment.frozenProject")}</dt>
                          <dd>{item.frozenReference.projectPath}</dd>
                          <dt>{t("attachment.frozenPath")}</dt>
                          <dd>{item.frozenReference.path}</dd>
                          <dt>{t("attachment.frozenVersion")}</dt>
                          <dd>{item.frozenReference.version}</dd>
                          <dt>{t("attachment.frozenTime")}</dt>
                          <dd>
                            <time dateTime={item.frozenReference.capturedAt}>
                              {item.frozenReference.capturedAt}
                            </time>
                          </dd>
                        </dl>
                      </Disclosure>
                    </div>
                  )}
                  {item.reason && (
                    <p className="failure" role="status">
                      {t(`attachment.reason.${item.reason}`)}
                    </p>
                  )}
                  {!!item.coverageGaps.length && (
                    <p>
                      {item.textOnly
                        ? t("attachment.textOnlyNotice")
                        : t("attachment.coverageGap")}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      disabled={sourceFrozen || pending > 0}
                      onClick={() => void run({ kind: "preview", id: item.id })}
                    >
                      {t("attachment.preview", { name: item.name })}
                    </Button>
                    {item.status === "failed" && (
                      <Button
                        variant="ghost"
                        disabled={sourceFrozen || pending > 0}
                        onClick={() => void run({ kind: "retry", id: item.id })}
                      >
                        {t("attachment.retry")}
                      </Button>
                    )}
                    {(item.representation === "pdf-text" ||
                      item.source === "reference") &&
                      !!item.coverageGaps.length &&
                      !item.textOnly && (
                        <Button
                          variant="ghost"
                          disabled={sourceFrozen || pending > 0}
                          onClick={() =>
                            void run({
                              kind: "set-text-only",
                              id: item.id,
                              value: true,
                            })
                          }
                        >
                          {t("attachment.textOnly")}
                        </Button>
                      )}
                    <Button
                      variant="ghost"
                      aria-label={t("attachment.previous", { name: item.name })}
                      disabled={sourceFrozen || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      {t("attachment.previous", { name: item.name })}
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={t("attachment.next", { name: item.name })}
                      disabled={sourceFrozen || index === active.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      {t("attachment.next", { name: item.name })}
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={t("attachment.remove", { name: item.name })}
                      onClick={() => remove(item.id)}
                    >
                      {t("attachment.remove", { name: item.name })}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="failure">
                    {t("attachment.missing", { id: ids[index] ?? "" })}
                  </p>
                  <Button
                    variant="ghost"
                    onClick={() => remove(ids[index] ?? "")}
                  >
                    {t("attachment.remove", { name: ids[index] ?? "" })}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      {preview && (
        <AttachmentPreviewDialog
          item={preview.item}
          content={preview.content}
          close={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function AttachmentPreviewDialog({
  item,
  content,
  close,
}: {
  item: Attachment;
  content: AttachmentPreview;
  close: () => void;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [zoom, setZoom] = useState(100);
  const [width, setWidth] = useState<number>();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={close}
      aria-labelledby={headingId}
      className="attachment-preview-dialog"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id={headingId} className="break-all">
          {item.name}
        </h2>
        <Button variant="ghost" autoFocus onClick={close}>
          {t("attachment.closePreview")}
        </Button>
      </div>
      {content.kind === "image" && (
        <>
          <label className="flex items-center gap-2">
            {t("attachment.zoom")}
            <Slider
              min="25"
              max="300"
              step="25"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            {zoom}%
          </label>
          <div className="attachment-preview-content">
            <img
              className="max-w-none"
              src={content.dataUrl}
              alt={item.name}
              width={width ? (width * zoom) / 100 : undefined}
              onLoad={(event) => setWidth(event.currentTarget.naturalWidth)}
            />
          </div>
        </>
      )}
      {content.kind === "text" && (
        <>
          <pre className="attachment-preview-content whitespace-pre-wrap">
            {content.text}
          </pre>
          {content.truncated && (
            <p role="status">{t("attachment.previewTruncated")}</p>
          )}
        </>
      )}
      {content.kind === "unavailable" && (
        <p role="alert">{t(`attachment.reason.${content.reason}`)}</p>
      )}
    </dialog>
  );
}
