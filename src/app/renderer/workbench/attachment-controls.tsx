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
import { Button } from "../../../modules/ui/renderer/public";
import type {
  AttachmentBridge,
  AttachmentRequest,
} from "../../contracts/attachments";
import { AttachmentImportBatches } from "./attachment-import-batches";
import { AttachmentManager } from "./attachment-manager";
import { AttachmentPreviewDialog } from "./attachment-preview";
import { AttachmentAttention, AttachmentStrip } from "./composer-attachments";
import { ReferenceSuggestions } from "./reference-suggestions";

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
  openManager(): void;
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

  const [managerOpen, setManagerOpen] = useState(false);
  const managerReturnFocus = useRef<HTMLElement | null>(null);
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
    openManager: () => {
      if (!isCurrent() || !editor || editor.isDestroyed) return;
      managerReturnFocus.current = editor.view.dom;
      setManagerOpen(true);
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
    <div className="composer-context">
      {(pending > 0 || importing > 0) && (
        <p className="muted" role="status">
          {t("attachment.preparing")}
        </p>
      )}
      <AttachmentStrip
        items={active.filter(
          (item): item is Attachment =>
            !!item && item.source !== "reference" && !item.frozenReference,
        )}
        bridge={bridge}
        threadId={threadId}
        onPreview={openReference}
        onRemove={remove}
      />
      <AttachmentAttention
        loading={list.isFetching}
        items={active}
        ids={ids}
        disabled={sourceFrozen || pending > 0}
        onAction={(command) => void run(command)}
        onPreview={openReference}
        onRemove={remove}
      />
      {managerOpen && (
        <AttachmentManager
          open={managerOpen}
          close={() => setManagerOpen(false)}
          returnFocus={managerReturnFocus}
          storageReport={storageReport}
          sourceFrozen={sourceFrozen}
          pending={pending}
          importing={importing}
          editorAvailable={!!editor}
          failed={!!failed}
          unused={unused}
          active={active}
          ids={ids}
          run={(command, add) => void run(command, add)}
          insert={insert}
          openReference={(id) => {
            setManagerOpen(false);
            openReference(id);
          }}
          move={move}
          remove={remove}
        />
      )}
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
        <ReferenceSuggestions
          inline={!!mention}
          manual={manualSearch}
          query={query}
          onQuery={setQuery}
          onKey={handleMentionKey}
          listboxId={listboxId}
          optionId={optionId}
          position={popupPosition}
          entries={entries}
          selected={selected}
          disabled={sourceFrozen || pending > 0 || !!failed}
          searchPending={searchPending}
          searchFailed={search.isError || search.data?.kind === "unavailable"}
          truncated={
            !searchPending &&
            search.data?.kind === "search" &&
            search.data.truncated
          }
          onChoose={chooseReference}
          onRefresh={() => {
            refreshSearch.current = true;
            void search.refetch();
          }}
          onClose={() => {
            setManualSearch(false);
            dismissMention();
          }}
        />
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
