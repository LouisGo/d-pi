import { EditorContent, useEditor } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import type { RuntimeView } from "../../../modules/execution/contracts/public";
import {
  canSubmit,
  QUEUE_CAP,
  queueCapped,
  queueCount,
  submissionBlockReason,
} from "../../../modules/execution/core/public";
import { shouldSend } from "../../../modules/execution/renderer/public";
import type { FrozenSelection } from "../../../modules/files/core/public";
import {
  appendSelectionReference,
  createClipboardPaste,
  createTrustedClipboard,
  draftDocument,
  isCompositionKey,
  plainTextEditorOptions,
  replaceDraftText,
  SuggestionController,
  textPasteTransaction,
} from "../../../modules/input/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Button,
  Disclosure,
  DisclosureTrigger,
  TextArea,
} from "../../../modules/ui/renderer/public";
import { AttachmentIcon, SendIcon } from "../components/icons/common";
import type { AppModel } from "../wiring/model";
import type { ThreadModel } from "../wiring/thread-model";
import {
  type AttachmentActions,
  AttachmentControls,
} from "./attachment-controls";
import { UrlDecoration } from "./url-decoration";
export function Composer({
  thread,
  model,
  selectionAttachment,
  onAttachmentApplied,
  onChooseModel,
  hidden = false,
}: {
  thread: ThreadModel;
  model: AppModel;
  selectionAttachment?: {
    id: string;
    threadId: string;
    selection: Extract<FrozenSelection, { kind: "selection" }>;
  } | null;
  onAttachmentApplied?: (id: string) => void;
  onChooseModel?: (() => void) | undefined;
  hidden?: boolean;
}) {
  const { controller, submission, runtime } = thread;
  const { locale, t, formatMessage } = useI18n();
  const subscribePreparation = useCallback(
    (listener: () => void) =>
      submission?.stateStore.subscribe(listener) ?? (() => {}),
    [submission],
  );
  const getPreparation = useCallback(
    () => submission?.stateStore.getState().preparationFailure ?? null,
    [submission],
  );
  const preparationFailure = useSyncExternalStore(
    subscribePreparation,
    getPreparation,
    getPreparation,
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const history = useSyncExternalStore(
    model.draftEditors.subscribe,
    () => model.draftEditors.historyState(thread.key),
    () => model.draftEditors.historyState(thread.key),
  );
  const [expanded, setExpanded] = useState(false);
  const [unsupportedPaste, setUnsupportedPaste] = useState(false);
  const [clipboardFeedback, setClipboardFeedback] = useState<
    "fallback" | "failed" | null
  >(null);
  const [attachmentBlocked, setAttachmentBlocked] = useState(false);
  const suggestions = useMemo(() => new SuggestionController(), [controller]);
  const [mention, setMention] =
    useState<ReturnType<SuggestionController["observe"]>>(null);
  const attachmentActions = useRef<AttachmentActions | null>(null);
  const attachmentBlock = useRef(false);
  const isCurrentThread = useCallback(
    () => model.isCurrentThread(thread),
    [model, thread],
  );
  const updateBlocked = useCallback((value: boolean) => {
    attachmentBlock.current = value;
    setAttachmentBlocked(value);
  }, []);
  const dismissMention = useCallback(() => {
    suggestions.dismiss();
    setMention(null);
  }, [suggestions]);
  const preference = useStore(model.stateStore, (appState) =>
    appState.kind === "ready"
      ? (appState.preferences.sendKey ?? "enter-send")
      : "enter-send",
  );
  const inputOptions = useRef({ expanded, preference });
  inputOptions.current = { expanded, preference };
  const initialDocument = useMemo(
    () => draftDocument(controller.getTextSnapshot()),
    [controller],
  );
  const paste = useMemo(
    () => createClipboardPaste(() => setUnsupportedPaste(true)),
    [controller],
  );
  const trustedClipboard = useMemo(
    () =>
      model.attachments && thread.attachments
        ? createTrustedClipboard({
            bridge: model.attachments,
            model: thread.attachments,
            isCurrent: () => model.isCurrentThread(thread),
            sequence: () => controller.getEditorSnapshot().sequence,
            onFeedback: setClipboardFeedback,
          })
        : null,
    [controller, model, thread],
  );
  useEffect(() => {
    trustedClipboard?.start();
    return () => trustedClipboard?.dispose();
  }, [trustedClipboard]);
  const editor = useEditor(
    {
      ...plainTextEditorOptions,
      extensions: [...plainTextEditorOptions.extensions, UrlDecoration],
      content: initialDocument,
      onBeforeCreate: ({ editor }) => {
        plainTextEditorOptions.onBeforeCreate({ editor });
        model.draftEditors.bind(editor, thread.key, controller);
      },
      onSelectionUpdate: ({ editor }) => {
        if (!editor.view.composing)
          setMention(suggestions.observe(editor.state));
      },
      onUpdate: ({ editor }) => {
        if (!editor.view.composing)
          setMention(suggestions.observe(editor.state));
      },
      editorProps: {
        handlePaste: (view, event) => {
          if (!paste.isPlain() && trustedClipboard?.paste(view, event))
            return true;
          const files = Array.from(event.clipboardData?.files ?? []);
          if (
            !paste.isPlain() &&
            files.length &&
            model.attachments &&
            attachmentActions.current
          ) {
            event.preventDefault();
            attachmentActions.current.importFiles(files, "paste");
            const text = event.clipboardData?.getData("text/plain");
            if (text) view.dispatch(textPasteTransaction(view.state, text));
            return true;
          }
          return paste.handlePaste(view, event);
        },
        handleDrop: (_view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (!files.length || !attachmentActions.current) return false;
          event.preventDefault();
          attachmentActions.current.importFiles(files, "drop");
          return true;
        },
        handleKeyDown: (view, event) => {
          paste.keyDown(event);
          if (!model.isCurrentThread(thread)) return false;
          if (isCompositionKey(event, view.composing)) return false;
          if (event.repeat && event.key === "Enter") {
            event.preventDefault();
            return true;
          }
          if (attachmentActions.current?.handleMentionKey(event)) {
            event.preventDefault();
            return true;
          }
          if (attachmentActions.current?.handleReferenceKey(event)) {
            event.preventDefault();
            return true;
          }
          if (
            !shouldSend(
              event,
              inputOptions.current.preference,
              inputOptions.current.expanded,
            )
          )
            return false;
          event.preventDefault();
          const runtimeView = runtime?.stateStore.getState().view;
          const receipts = submission?.stateStore.getState().receipts ?? [];
          if (
            !attachmentBlock.current &&
            runtimeView &&
            !queueCapped(receipts, nativeQueueLength(runtimeView)) &&
            canSubmit(runtimeView)
          )
            void submission?.send();
          return true;
        },
        handleDoubleClickOn: (_view, _pos, node, nodePos) => {
          if (node.type.name !== "attachmentReference") return false;
          return (
            attachmentActions.current?.openReference(
              String(node.attrs.id),
              nodePos,
            ) ?? false
          );
        },
        handleDOMEvents: {
          copy: (view, event) =>
            trustedClipboard?.copy(view, event, false) ?? false,
          cut: (view, event) =>
            trustedClipboard?.copy(view, event, true) ?? false,
          focus: () => {
            void trustedClipboard?.warm();
            return false;
          },
          blur: () => {
            paste.reset();
            return false;
          },
          compositionstart: () => {
            setMention(null);
            return false;
          },
          compositionend: (view) => {
            setTimeout(() => {
              if (model.isCurrentThread(thread)) {
                setMention(suggestions.observe(view.state));
                submission?.consume();
              }
            }, 0);
            return false;
          },
        },
        attributes: {
          role: "textbox",
          "aria-label": t("composer.editorLabel"),
          "aria-multiline": "true",
          spellcheck: "false",
        },
      },
    },
    [controller],
  );
  useEffect(
    () => (editor ? trustedClipboard?.bindEditor(editor) : undefined),
    [editor, trustedClipboard],
  );
  const lastAttachment = useRef<string | null>(null);
  useEffect(() => {
    if (
      !editor ||
      !selectionAttachment ||
      selectionAttachment.threadId !== thread.context.threadId ||
      lastAttachment.current === selectionAttachment.id
    )
      return;
    const apply = () => {
      if (!model.isCurrentThread(thread) || editor.isDestroyed) return;
      if (editor.view.composing) return;
      const transaction = appendSelectionReference(
        editor.state,
        selectionAttachment.selection,
      );
      editor.view.dispatch(transaction);
      if (!editor.state.doc.eq(transaction.doc)) return;
      lastAttachment.current = selectionAttachment.id;
      editor.commands.focus("end");
      onAttachmentApplied?.(selectionAttachment.id);
    };
    if (editor.view.composing)
      editor.view.dom.addEventListener("compositionend", apply, { once: true });
    else apply();
    return () => editor.view.dom.removeEventListener("compositionend", apply);
  }, [
    editor,
    selectionAttachment,
    model,
    thread,
    onAttachmentApplied,
    history.pending,
    history.failed,
    history.limited,
  ]);
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...editor.options.editorProps?.attributes,
          "aria-label": t("composer.editorLabel"),
        },
      },
    });
  }, [editor, locale, t]);
  useLayoutEffect(() => {
    if (!editor) return;
    const boundary = {
      canLeaveView: () => attachmentActions.current?.canLeaveView() ?? true,
      freeze: () => {
        if (editor.view.composing) return false;
        editor.setEditable(false, false);
        return true;
      },
      release: () => editor.setEditable(true, false),
    };
    const detachBoundary = model.attachEditorBoundary(controller, boundary);
    const detachEditor = submission?.attachEditor(() =>
      replaceDraftText(editor, ""),
    );
    return () => {
      model.draftEditors.capture(editor);
      detachBoundary();
      detachEditor?.();
    };
  }, [editor, model, thread, controller, submission]);
  const status = match(state)
    .with({ kind: "saved" }, () => t("composer.status.saved"))
    .with({ kind: "dirty" }, () => t("composer.status.dirty"))
    .with({ kind: "saving" }, () => t("composer.status.saving"))
    .with({ kind: "checking" }, () => t("composer.status.checking"))
    .with({ kind: "conflict" }, () => t("composer.status.conflict"))
    .with({ kind: "failed" }, () => t("composer.status.failed"))
    .exhaustive();
  return (
    <section
      className="composer"
      hidden={hidden}
      data-expanded={expanded}
      aria-label={t("composer.sectionLabel")}
    >
      {state.kind !== "saved" && (
        <div className="composer-heading">
          <span role="status" className="save-status">
            {status}
          </span>
        </div>
      )}
      {runtime && (
        <ComposerReadiness
          runtime={runtime}
          model={model}
          onChooseModel={onChooseModel}
        />
      )}
      {thread.attachments && thread.attachmentImports && model.attachments && (
        <AttachmentControls
          key={thread.key}
          model={thread.attachments}
          imports={thread.attachmentImports}
          preparationFailure={preparationFailure}
          ref={attachmentActions}
          bridge={model.attachments}
          threadId={thread.context.threadId}
          editor={editor}
          text={controller.getTextSnapshot()}
          isCurrent={isCurrentThread}
          onBlocked={updateBlocked}
          mention={mention}
          dismissMention={dismissMention}
          onClearHistory={() => model.draftEditors.clearHistory(thread.key)}
        />
      )}
      <EditorContent className="composer-editor" editor={editor} />
      {clipboardFeedback && (
        <p role="status" className="muted">
          {t(
            clipboardFeedback === "fallback"
              ? "attachment.clipboardFallback"
              : "attachment.clipboardFailed",
          )}
        </p>
      )}
      {unsupportedPaste && (
        <p role="alert" className="failure">
          {t("composer.paste.unsupported")}
        </p>
      )}
      {history.failed && (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <p className="failure">{t("attachment.historyLeaseFailed")}</p>
          <Button
            variant="ghost"
            disabled={history.pending}
            onClick={() =>
              void model.draftEditors
                .retryHistory(thread.key)
                .then((protectedAssets) => {
                  if (protectedAssets) void controller.retry();
                })
            }
          >
            {t("attachment.historyRetry")}
          </Button>
        </div>
      )}
      {history.limited && (
        <p role="status" className="muted">
          {t("attachment.historyCleared")}
        </p>
      )}
      <div className="composer-footer">
        {runtime && (
          <ComposerModel runtime={runtime} onChooseModel={onChooseModel} />
        )}
        <div className="composer-help">
          <Disclosure>
            <DisclosureTrigger>{t("composer.inputOptions")}</DisclosureTrigger>
            <p>
              {expanded || preference === "enter-newline"
                ? t("composer.shortcut.newline")
                : t("composer.shortcut.send")}{" "}
              {t("composer.shortcut.undo")} · {t("composer.paste.hint")}
            </p>
            <Button
              variant="ghost"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void model.preference("sendKey")}
            >
              {t("composer.switchShortcut")}
            </Button>
          </Disclosure>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("attachment.add")}
            title={t("attachment.add")}
            disabled={attachmentBlocked}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => attachmentActions.current?.chooseImport()}
          >
            <AttachmentIcon />
            <span className="sr-only">{t("attachment.add")}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("attachment.reference")}
            title={t("attachment.reference")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => attachmentActions.current?.openSearch()}
          >
            @
          </Button>
          <Button
            variant="ghost"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t("composer.collapse") : t("composer.expand")}
          </Button>
          {submission && runtime && (
            <SendButton
              contentBlocked={
                attachmentBlocked || history.pending || history.failed
              }
              canSend={() =>
                !!editor &&
                !editor.view.composing &&
                model.isCurrentThread(thread) &&
                !attachmentBlock.current
              }
              submission={submission}
              runtime={runtime}
            />
          )}
        </div>
      </div>
      {state.kind === "conflict" && (
        <div className="failure" role="alert">
          <p>{t("composer.conflict.description")}</p>
          <Disclosure>
            <DisclosureTrigger>
              {t("composer.conflict.compare")}
            </DisclosureTrigger>
            <label>
              {t("composer.conflict.current")}
              <TextArea
                className="my-2.5 block"
                data-draft-comparison
                readOnly
                value={state.localText}
              />
            </label>
            <label>
              {t("composer.conflict.saved")}
              <TextArea
                className="my-2.5 block"
                data-draft-comparison
                readOnly
                value={state.stored.text}
              />
            </label>
          </Disclosure>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void controller.keepLocal()}>
              {t("composer.conflict.keepCurrent")}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                controller.useStored((text) => {
                  return editor ? replaceDraftText(editor, text) : false;
                })
              }
            >
              {t("composer.conflict.loadSaved")}
            </Button>
          </div>
          <p>{t("composer.conflict.loadWarning")}</p>
        </div>
      )}
      {state.kind === "failed" && (
        <div className="failure" role="alert">
          <p>{formatMessage(state.error.message)}</p>
          <p className="trace">
            {t("app.trace", { traceId: state.error.traceId })}
          </p>
          <div className="flex gap-2">
            {state.error.recovery !== "reconcile_first" && (
              <Button onClick={() => void controller.retry()}>
                {t("composer.retrySave")}
              </Button>
            )}
            {state.error.recovery === "reconcile_first" && (
              <Button onClick={() => void model.reconcileDraft()}>
                {t("composer.checkSave")}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                editor?.commands.selectAll();
                editor?.commands.focus();
              }}
            >
              {t("composer.selectAll")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function nativeQueueLength(view: RuntimeView | null | undefined): number {
  const snapshot = view?.control?.queueState;
  return snapshot
    ? snapshot.items.length + snapshot.hiddenCount
    : (view?.control?.queue.length ?? 0);
}

function SendButton({
  contentBlocked,
  canSend,
  submission,
  runtime,
}: {
  contentBlocked: boolean;
  canSend: () => boolean;
  submission: NonNullable<AppModel["submission"]>;
  runtime: NonNullable<AppModel["runtime"]>;
}) {
  const { t } = useI18n();
  const sending = useStore(submission.stateStore, (value) => value.sending);
  const receipts = useStore(submission.stateStore, (value) => value.receipts);
  const state = useStore(runtime.stateStore, (value) => value.view);
  const capped = queueCapped(receipts, nativeQueueLength(state));
  const queued = queueCount(receipts, nativeQueueLength(state));
  return (
    <div className="flex gap-2">
      <Button
        variant="accent"
        size="round"
        aria-label={state?.busy ? t("composer.queueSend") : t("composer.send")}
        title={state?.busy ? t("composer.queueSend") : t("composer.send")}
        disabled={contentBlocked || sending || capped || !canSubmit(state)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (canSend()) void submission.send();
        }}
      >
        <SendIcon />
        <span className="sr-only">
          {state?.busy ? t("composer.queueSend") : t("composer.send")}
        </span>
      </Button>
      {state?.busy && (
        <Button
          variant="ghost"
          disabled={contentBlocked || sending || capped || !canSubmit(state)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (canSend()) void submission.send("steer");
          }}
        >
          {t("composer.steer")}
        </Button>
      )}
      {capped && (
        <p role="status" className="muted">
          {t("composer.queueFull", { queued, cap: QUEUE_CAP })}
        </p>
      )}
    </div>
  );
}

function ComposerReadiness({
  runtime,
  model,
  onChooseModel,
}: {
  runtime: NonNullable<ThreadModel["runtime"]>;
  model: AppModel;
  onChooseModel: (() => void) | undefined;
}) {
  const { t, formatMessage } = useI18n();
  const view = useStore(runtime.stateStore, (state) => state.view);
  const busy = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition === "unknown",
  );
  const reason = submissionBlockReason(view);
  if (!reason) return null;
  const phase = view?.phase;
  const message = match(reason)
    .with("interrupted", () => "composer.blocked.readOnly" as const)
    .with("allowed", () => "composer.blocked.preparing" as const)
    .with("browse", "untrusted", () => "composer.blocked.allow" as const)
    .with(
      "loading",
      "starting",
      "failed",
      () => "composer.blocked.wait" as const,
    )
    .with("model-changing", () => "composer.blocked.modelChanging" as const)
    .with("no-model", () => "composer.blocked.noModel" as const)
    .with("paused", () => "composer.blocked.paused" as const)
    .with("stopping", () => "composer.blocked.stopping" as const)
    .with(
      "unsupported-interaction",
      "interaction",
      () => "composer.blocked.interaction" as const,
    )
    .exhaustive();
  return (
    <div className="composer-readiness" role="status">
      <p>
        {(phase === "failed" || phase === "interrupted") && view
          ? formatMessage(view.message)
          : t(message)}
      </p>
      {reason === "no-model" && onChooseModel && (
        <Button onClick={onChooseModel}>{t("composer.chooseModel")}</Button>
      )}
      {(phase === "browse" || (phase === "interrupted" && !view?.trusted)) && (
        <Button disabled={busy} onClick={() => void runtime.act("allow")}>
          {t("ui.runtime.allow")}
        </Button>
      )}
      {(phase === "failed" || phase === "interrupted") && view?.trusted && (
        <Button
          disabled={busy || view.busy}
          onClick={() => void runtime.act("start")}
        >
          {t("ui.runtime.retryStart")}
        </Button>
      )}
    </div>
  );
}

function ComposerModel({
  runtime,
  onChooseModel,
}: {
  runtime: NonNullable<ThreadModel["runtime"]>;
  onChooseModel?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const model = useStore(
    runtime.stateStore,
    (state) => state.view?.selectedModel,
  );
  return (
    <Button
      variant="ghost"
      disabled={!onChooseModel}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onChooseModel}
      title={t("composer.chooseModel")}
      className="max-w-64"
    >
      <span className="truncate">
        {model?.modelId ?? t("composer.chooseModel")}
      </span>
    </Button>
  );
}
