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
import { Button } from "@/components/ui/button";
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
  attachmentMention,
  createClipboardPaste,
  draftDocument,
  plainTextEditorOptions,
  replaceDraftText,
  textPasteTransaction,
} from "../../../modules/input/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
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
  const [expanded, setExpanded] = useState(false);
  const [unsupportedPaste, setUnsupportedPaste] = useState(false);
  const [attachmentBlocked, setAttachmentBlocked] = useState(false);
  const [mention, setMention] =
    useState<ReturnType<typeof attachmentMention>>(null);
  const attachmentActions = useRef<AttachmentActions | null>(null);
  const attachmentBlock = useRef(false);
  const updateBlocked = useCallback((value: boolean) => {
    attachmentBlock.current = value;
    setAttachmentBlocked(value);
  }, []);
  const dismissMention = useCallback(() => setMention(null), []);
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
        if (!editor.view.composing) setMention(attachmentMention(editor.state));
      },
      onUpdate: ({ editor }) => {
        if (!editor.view.composing) setMention(attachmentMention(editor.state));
      },
      editorProps: {
        handlePaste: (view, event) => {
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
          if (view.composing) return false;
          if (attachmentActions.current?.handleMentionKey(event)) {
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
        handleDOMEvents: {
          blur: () => {
            paste.reset();
            return false;
          },
          compositionend: () => {
            setTimeout(() => {
              if (model.isCurrentThread(thread)) submission?.consume();
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
      editor.view.dispatch(
        appendSelectionReference(editor.state, selectionAttachment.selection),
      );
      lastAttachment.current = selectionAttachment.id;
      editor.commands.focus("end");
      onAttachmentApplied?.(selectionAttachment.id);
    };
    if (editor.view.composing)
      editor.view.dom.addEventListener("compositionend", apply, { once: true });
    else apply();
    return () => editor.view.dom.removeEventListener("compositionend", apply);
  }, [editor, selectionAttachment, model, thread, onAttachmentApplied]);
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
      <div className="composer-heading">
        <h2>{t("composer.heading")}</h2>
        <span role="status" className="save-status">
          {status}
        </span>
      </div>
      {runtime && (
        <ComposerReadiness
          runtime={runtime}
          model={model}
          onChooseModel={onChooseModel}
        />
      )}
      <EditorContent className="composer-editor" editor={editor} />
      {model.attachments && (
        <AttachmentControls
          key={thread.key}
          owner={controller}
          preparationFailure={preparationFailure}
          ref={attachmentActions}
          bridge={model.attachments}
          threadId={thread.context.threadId}
          editor={editor}
          text={controller.getTextSnapshot()}
          isCurrent={() => model.isCurrentThread(thread)}
          onBlocked={updateBlocked}
          mention={mention}
          dismissMention={dismissMention}
        />
      )}
      {unsupportedPaste && (
        <p role="alert" className="failure">
          {t("composer.paste.unsupported")}
        </p>
      )}
      <div className="composer-footer">
        <span>
          {expanded || preference === "enter-newline"
            ? t("composer.shortcut.newline")
            : t("composer.shortcut.send")}{" "}
          {t("composer.shortcut.undo")} · {t("composer.paste.hint")}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t("composer.collapse") : t("composer.expand")}
          </Button>
          <Button
            variant="ghost"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void model.preference("sendKey")}
          >
            {t("composer.switchShortcut")}
          </Button>
          {submission && runtime && (
            <SendButton
              contentBlocked={attachmentBlocked}
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
          <details>
            <summary>{t("composer.conflict.compare")}</summary>
            <label>
              {t("composer.conflict.current")}
              <textarea
                className="draft-comparison"
                readOnly
                value={state.localText}
              />
            </label>
            <label>
              {t("composer.conflict.saved")}
              <textarea
                className="draft-comparison"
                readOnly
                value={state.stored.text}
              />
            </label>
          </details>
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
        disabled={contentBlocked || sending || capped || !canSubmit(state)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (canSend()) void submission.send();
        }}
      >
        {state?.busy ? t("composer.queueSend") : t("composer.send")}
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
  const { t } = useI18n();
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
    .with("allowed", () => "composer.blocked.start" as const)
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
      <p>{t(message)}</p>
      {reason === "no-model" && onChooseModel && (
        <Button onClick={onChooseModel}>{t("composer.chooseModel")}</Button>
      )}
      {phase === "interrupted" && (
        <Button disabled={busy} onClick={() => void model.newThread()}>
          {t("app.toolbar.newThread")}
        </Button>
      )}
      {phase === "browse" && (
        <Button disabled={busy} onClick={() => void runtime.act("allow")}>
          {t("ui.runtime.allow")}
        </Button>
      )}
      {phase === "allowed" && (
        <Button disabled={busy} onClick={() => void runtime.act("start")}>
          {t("ui.runtime.start")}
        </Button>
      )}
    </div>
  );
}
