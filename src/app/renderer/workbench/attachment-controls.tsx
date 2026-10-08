import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";
import {
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
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
import type {
  AttachmentImports,
  ReferenceTrigger,
} from "../../../modules/input/renderer/public";
import {
  attachmentIds,
  captureReferenceFocus,
  createAttachmentEditor,
  createAttachmentImportTarget,
  isCompositionKey,
  moveAttachmentReference,
  navigateReference,
  referenceSourceMatches,
  removeAttachmentReference,
  selectedReference,
  syncAttachmentLabels,
  trackReferenceRange,
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
import { CloseIcon, FileIcon, FolderIcon } from "../components/icons/common";
import { AttachmentImportBatches } from "./attachment-import-batches";

export type AttachmentActions = {
  canLeaveView(): boolean;
  importFiles(
    files: File[],
    source: "paste" | "drop",
    target?: { position?: number; sourceFrom?: number } | false,
  ): void;
  handleMentionKey(event: KeyboardEvent): boolean;
  handleReferenceKey(event: KeyboardEvent): boolean;
  openReference(id: string, position?: number): boolean;
  chooseImport(): void;
  openSearch(): void;
};
type Mention = ReferenceTrigger | null;

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
  const importsReady = useStore(imports.stateStore, (state) => state.ready);
  const importCompletion = useStore(
    imports.stateStore,
    (state) => state.completion,
  );

  const [manualSearch, setManualSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const acceptingReference = useRef(false);
  const listboxId = useId();
  const restorePreviewFocus = useRef<((restore: boolean) => void) | null>(null);
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
  const selected = Math.max(
    0,
    entries.findIndex((entry) => entry.path === activeId),
  );
  const optionId = (index: number) =>
    `${listboxId}-${encodeURIComponent(entries[index]?.path ?? "")}`;
  const popupPosition = useSuggestionPosition(editor, mention);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.dom;
    if (mention && searchOpen) {
      dom.setAttribute("aria-controls", listboxId);
      if (entries.length)
        dom.setAttribute("aria-activedescendant", optionId(selected));
      else dom.removeAttribute("aria-activedescendant");
    } else {
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-activedescendant");
    }
    return () => {
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-activedescendant");
    };
  }, [editor, mention, searchOpen, entries, selected, listboxId]);
  useEffect(() => {
    if (searchOpen && entries.length)
      document
        .getElementById(optionId(selected))
        ?.scrollIntoView({ block: "nearest" });
  }, [selected, searchOpen, entries.length]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      restorePreviewFocus.current?.(false);
      restorePreviewFocus.current = null;
    };
  }, []);
  useEffect(() => {
    setActiveId(null);
  }, [searchQuery]);
  useEffect(() => {
    onBlocked(
      pending > 0 ||
        !!failed ||
        insertions.length > 0 ||
        !importsReady ||
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
    importsReady,
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
    const adapter = createAttachmentEditor(editor, isCurrent);
    const detach = model.attachEditor(adapter);
    const detachImports = imports.attachEditor(adapter);
    const flush = () =>
      setTimeout(() => {
        if (isCurrent()) {
          model.flushInsertions();
          imports.flushInsertions();
        }
      }, 0);
    editor.view.dom.addEventListener("compositionend", flush);
    return () => {
      detach();
      detachImports();
      editor.view.dom.removeEventListener("compositionend", flush);
    };
  }, [model, imports, editor, isCurrent]);
  function insert(item: Attachment) {
    if (isCurrent()) model.insert(item);
  }
  async function run(
    command: AttachmentIntent,
    add = false,
    range?: { from: number; to: number; expectedSource?: string },
  ) {
    if (!isCurrent()) return;
    const reply = await model.run(command, add, range);
    if (!alive.current || !isCurrent() || !reply) return;
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
    if (completion > 0 || importCompletion > 0 || preparationFailure)
      void client.invalidateQueries({ queryKey: listKey });
  }, [completion, importCompletion, preparationFailure, client, threadId]);
  function importFiles(
    files: File[],
    source: "paste" | "drop",
    options?: { position?: number; sourceFrom?: number } | false,
  ) {
    if (isCurrent())
      imports.importFiles(
        files,
        source,
        editor && options !== false
          ? createAttachmentImportTarget(editor, isCurrent, options)
          : undefined,
      );
  }
  function chooseReference(entry: ProjectReferenceEntry) {
    if (
      searchPending ||
      !isCurrent() ||
      sourceFrozen ||
      acceptingReference.current ||
      model.stateStore.getState().pending > 0 ||
      model.stateStore.getState().failed ||
      !editor ||
      editor.view.composing
    )
      return;
    if (
      mention &&
      (!editor.state.selection.empty ||
        editor.state.selection.from !== mention.to ||
        !referenceSourceMatches(editor.state, mention))
    )
      return;
    acceptingReference.current = true;
    const target = mention ? trackReferenceRange(editor, mention) : null;
    const range = target?.range;
    void run(
      { kind: "add-reference", path: entry.path, referenceKind: entry.kind },
      true,
      range,
    ).finally(() => {
      acceptingReference.current = false;
      target?.release();
    });
    setManualSearch(false);
    dismissMention();
  }
  function handleMentionKey(event: KeyboardEvent) {
    if (
      !searchOpen ||
      (editor && isCompositionKey(event, editor.view.composing))
    )
      return false;
    if (event.key === "Escape") {
      setManualSearch(false);
      dismissMention();
      return true;
    }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      if (entries.length)
        setActiveId(
          entries[
            (selected + (event.key === "ArrowDown" ? 1 : -1) + entries.length) %
              entries.length
          ]?.path ?? null,
        );
      return true;
    }
    if (event.key === "Enter") {
      if (!event.repeat && entries[selected])
        chooseReference(entries[selected]);
      return true;
    }
    return false;
  }
  function openReference(id: string) {
    if (!editor || editor.isDestroyed || !isCurrent() || editor.view.composing)
      return false;
    const item = items.find((item) => item.id === id);
    if (!item || model.stateStore.getState().pending > 0) return false;
    restorePreviewFocus.current?.(false);
    restorePreviewFocus.current = captureReferenceFocus(editor, isCurrent);
    void run({ kind: "preview", id });
    return true;
  }
  function closePreview() {
    setPreview(null);
    const restore = restorePreviewFocus.current;
    restorePreviewFocus.current = null;
    queueMicrotask(() => restore?.(true));
  }
  useImperativeHandle(ref, () => ({
    canLeaveView: () => {
      const sources = imports.stateStore.getState();
      return model.getReadiness().kind === "ready" && sources.ready;
    },
    importFiles: (files, source, target) =>
      void importFiles(files, source, target),
    handleMentionKey,
    handleReferenceKey: (event) => {
      if (
        !editor ||
        !isCurrent() ||
        isCompositionKey(event, editor.view.composing)
      )
        return false;
      if (navigateReference(editor, event)) return true;
      const id = selectedReference(editor);
      if (id && event.key === "Enter") {
        if (!event.repeat) openReference(id);
        return true;
      }
      return false;
    },
    openReference,
    chooseImport: () => {
      if (isCurrent() && !sourceFrozen)
        void run({ kind: "choose-import" }, true);
    },
    openSearch: () => {
      if (isCurrent() && !sourceFrozen) setManualSearch((value) => !value);
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
      {(pending > 0 || importing > 0) && (
        <p className="muted" role="status">
          {t("attachment.preparing")}
        </p>
      )}
      {active.length > 0 && (
        <ol className="attachment-rail" aria-label={t("attachment.add")}>
          {active.map((item, index) => (
            <li
              key={`${ids[index]}:${index}`}
              className={
                item?.representation === "image"
                  ? "attachment-tile"
                  : "attachment-file-chip"
              }
            >
              <Button
                variant="chip"
                size={item?.representation === "image" ? "thumbnail" : "source"}
                className="w-full"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (item) openReference(item.id);
                }}
                aria-label={t("attachment.preview", {
                  name: item?.name ?? ids[index] ?? "",
                })}
              >
                {item?.representation === "image" ? (
                  <AttachmentThumbnail
                    item={item}
                    bridge={bridge}
                    threadId={threadId}
                  />
                ) : (
                  <>
                    <FileIcon />
                    <span className="truncate">{item?.name ?? ids[index]}</span>
                    {item && item.source !== "reference" && (
                      <small>{Math.ceil(item.byteLength / 1024)} KiB</small>
                    )}
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0"
                aria-label={t("attachment.remove", {
                  name: item?.name ?? ids[index] ?? "",
                })}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => remove(item?.id ?? ids[index] ?? "")}
              >
                <CloseIcon />
              </Button>
            </li>
          ))}
        </ol>
      )}
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
          className={mention ? "reference-suggestions" : "reference-search"}
          style={
            mention && popupPosition
              ? ({
                  "--suggestion-top": `${popupPosition.top}px`,
                  "--suggestion-offset": popupPosition.offset,
                  "--suggestion-left": `${popupPosition.left}px`,
                  "--suggestion-width": `${popupPosition.width}px`,
                  "--suggestion-height": `${popupPosition.maxHeight}px`,
                } as React.CSSProperties)
              : undefined
          }
          role="region"
          aria-label={t("attachment.searchLabel")}
        >
          {manualSearch && (
            <TextInput
              aria-label={t("attachment.searchLabel")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (handleMentionKey(event.nativeEvent)) event.preventDefault();
              }}
              autoFocus
            />
          )}
          {searchPending ? (
            <div
              id={listboxId}
              role="listbox"
              aria-label={t("attachment.searchLabel")}
            >
              <p role="status">{t("attachment.searching")}</p>
            </div>
          ) : search.isError || search.data?.kind === "unavailable" ? (
            <div
              id={listboxId}
              role="listbox"
              aria-label={t("attachment.searchLabel")}
            >
              <p role="alert">{t("attachment.searchFailed")}</p>
            </div>
          ) : (
            <div
              id={listboxId}
              className="reference-options"
              role="listbox"
              aria-label={t("attachment.searchLabel")}
            >
              {entries.map((entry, index) => (
                <Button
                  key={entry.path}
                  id={optionId(index)}
                  tabIndex={-1}
                  data-reference-kind={entry.kind}
                  data-reference-path={entry.path}
                  className="w-full justify-start text-left"
                  variant={selected === index ? "navigation" : "ghost"}
                  data-active={selected === index}
                  role="option"
                  aria-label={entry.path}
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
                  <span className="reference-name">
                    {entry.path.split("/").at(-1)}
                    {entry.kind === "directory" ? "/" : ""}
                  </span>
                  <span className="reference-directory">
                    {entry.path.includes("/")
                      ? entry.path.slice(0, entry.path.lastIndexOf("/"))
                      : t(
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
          <div className="reference-search-actions">
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
      <AttachmentImportBatches
        imports={imports}
        editor={editor}
        isCurrent={isCurrent}
        frozen={sourceFrozen}
        onPreview={openReference}
      />
      {active.length > 0 && (
        <Disclosure>
          <DisclosureTrigger>{t("attachment.details")}</DisclosureTrigger>
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
                        {(item.source === "reference" ||
                          item.frozenReference) &&
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
                        onClick={() => openReference(item.id)}
                      >
                        {t("attachment.preview", { name: item.name })}
                      </Button>
                      {item.status === "failed" && (
                        <Button
                          variant="ghost"
                          disabled={sourceFrozen || pending > 0}
                          onClick={() =>
                            void run({ kind: "retry", id: item.id })
                          }
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
                        aria-label={t("attachment.previous", {
                          name: item.name,
                        })}
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
        </Disclosure>
      )}
      {preview && (
        <AttachmentPreviewDialog
          item={preview.item}
          content={preview.content}
          close={closePreview}
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
  function closeDialog() {
    // Release native modal focus before the parent restores the editor bookmark.
    dialog.current?.close();
    close();
  }
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      aria-labelledby={headingId}
      className="attachment-preview-dialog"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id={headingId} className="break-all">
          {item.name}
        </h2>
        <Button variant="ghost" autoFocus onClick={closeDialog}>
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

function useSuggestionPosition(editor: Editor | null, mention: Mention) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    offset: string;
  }>();
  useLayoutEffect(() => {
    if (!editor || !mention || editor.isDestroyed) return;
    let frame = 0;
    const measure = () => {
      if (editor.isDestroyed) return;
      const anchor = editor.view.coordsAtPos(mention.to);
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(640, viewportWidth - 24);
      const above = anchor.top - 12;
      const below = viewportHeight - anchor.bottom - 12;
      const placeAbove = above >= Math.min(160, below);
      const height = Math.max(0, Math.min(320, placeAbove ? above : below));
      const top = placeAbove ? anchor.top - 8 : anchor.bottom + 8;
      const next = {
        top,
        left: Math.max(12, Math.min(anchor.left, viewportWidth - width - 12)),
        width,
        maxHeight: height,
        offset: placeAbove ? "-100%" : "0%",
      };
      setPosition((old) =>
        old &&
        Object.keys(next).every(
          (key) =>
            old[key as keyof typeof next] === next[key as keyof typeof next],
        )
          ? old
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [editor, mention?.to]);
  return position;
}
function AttachmentThumbnail({
  item,
  bridge,
  threadId,
}: {
  item: Attachment;
  bridge: AttachmentBridge;
  threadId: AttachmentRequest["threadId"];
}) {
  const preview = useQuery({
    queryKey: [
      "attachment-thumbnail",
      threadId,
      item.id,
      item.inputDigest ?? item.capturedAt,
    ],
    queryFn: () =>
      bridge.request({
        kind: "preview",
        threadId,
        id: item.id,
        traceId: crypto.randomUUID(),
      }),
    enabled: item.status === "ready",
    networkMode: "always",
    retry: false,
    gcTime: 60000,
  });
  return preview.data?.kind === "image" ? (
    <img src={preview.data.dataUrl} alt={item.name} />
  ) : (
    <span className="truncate">{item.name}</span>
  );
}
