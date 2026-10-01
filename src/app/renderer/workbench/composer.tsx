import { EditorContent, useEditor } from "@tiptap/react";
import {
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
import {
  canSubmit,
  QUEUE_CAP,
  queueCapped,
  queueCount,
} from "../../../modules/execution/core/public";
import { shouldSend } from "../../../modules/execution/renderer/public";
import type { FrozenSelection } from "../../../modules/files/core/public";
import {
  appendSelectionReference,
  createClipboardPaste,
  draftDocument,
  plainTextEditorOptions,
  replaceDraftText,
} from "../../../modules/input/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { AppModel } from "../wiring/model";
import type { ThreadModel } from "../wiring/thread-model";
import { UrlDecoration } from "./url-decoration";
export function Composer({
  thread,
  model,
  selectionAttachment,
  onAttachmentApplied,
}: {
  thread: ThreadModel;
  model: AppModel;
  selectionAttachment?: {
    id: string;
    threadId: string;
    selection: Extract<FrozenSelection, { kind: "selection" }>;
  } | null;
  onAttachmentApplied?: (id: string) => void;
}) {
  const { controller, submission, runtime } = thread;
  const { locale, t, formatMessage } = useI18n();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [expanded, setExpanded] = useState(false);
  const [unsupportedPaste, setUnsupportedPaste] = useState(false);
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
      editorProps: {
        handlePaste: paste.handlePaste,
        handleKeyDown: (view, event) => {
          paste.keyDown(event);
          if (!model.isCurrentThread(thread)) return false;
          if (view.composing) return false;
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
            runtimeView &&
            !queueCapped(receipts, runtimeView.control?.queue.length ?? 0) &&
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
      data-expanded={expanded}
      aria-label={t("composer.sectionLabel")}
    >
      <div className="composer-heading">
        <h2>{t("composer.heading")}</h2>
        <span role="status" className="save-status">
          {status}
        </span>
      </div>
      {runtime && <ComposerReadiness runtime={runtime} model={model} />}
      <EditorContent className="composer-editor" editor={editor} />
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
              canSend={() => !!editor && !editor.view.composing}
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

function SendButton({
  canSend,
  submission,
  runtime,
}: {
  canSend: () => boolean;
  submission: NonNullable<AppModel["submission"]>;
  runtime: NonNullable<AppModel["runtime"]>;
}) {
  const { t } = useI18n();
  const sending = useStore(submission.stateStore, (value) => value.sending);
  const receipts = useStore(submission.stateStore, (value) => value.receipts);
  const state = useStore(runtime.stateStore, (value) => value.view);
  const capped = queueCapped(receipts, state?.control?.queue.length ?? 0);
  const queued = queueCount(receipts, state?.control?.queue.length ?? 0);
  return (
    <div className="flex gap-2">
      <Button
        disabled={sending || capped || !canSubmit(state)}
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
          disabled={sending || capped || !canSubmit(state)}
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
}: {
  runtime: NonNullable<ThreadModel["runtime"]>;
  model: AppModel;
}) {
  const { t } = useI18n();
  const view = useStore(runtime.stateStore, (state) => state.view);
  const busy = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition === "unknown",
  );
  if (canSubmit(view)) return null;
  const phase = view?.phase;
  return (
    <div className="composer-readiness" role="status">
      <p>
        {t(
          phase === "interrupted"
            ? "composer.blocked.readOnly"
            : phase === "allowed"
              ? "composer.blocked.start"
              : phase === "browse"
                ? "composer.blocked.allow"
                : "composer.blocked.wait",
        )}
      </p>
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
