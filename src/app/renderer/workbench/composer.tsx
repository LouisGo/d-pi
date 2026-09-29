import { EditorContent, useEditor } from "@tiptap/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { match } from "ts-pattern";
import { Button } from "@/components/ui/button";
import {
  canSubmit,
  QUEUE_CAP,
  queueCapped,
  queueCount,
} from "../../../modules/execution/core/public";
import { shouldSend } from "../../../modules/execution/renderer/public";
import type { FrozenSelection } from "../../../modules/files/core/public";
import type { Draft } from "../../../modules/input/contracts/public";
import type { DraftController } from "../../../modules/input/core/public";
import {
  appendSelectionReference,
  draftDocument,
  handlePlainTextPaste,
  plainTextEditorOptions,
  replaceDraftText,
} from "../../../modules/input/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { AppModel } from "../model";
import { UrlDecoration } from "../url-decoration";
export function Composer({
  draft,
  controller,
  model,
  selectionAttachment,
  onAttachmentApplied,
}: {
  draft: Draft;
  controller: DraftController;
  model: AppModel;
  selectionAttachment?: {
    id: string;
    threadId: string;
    selection: Extract<FrozenSelection, { kind: "selection" }>;
  } | null;
  onAttachmentApplied?: (id: string) => void;
}) {
  const { locale, t, formatMessage } = useI18n();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [expanded, setExpanded] = useState(false);
  const appState = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const preference =
    appState.kind === "ready"
      ? (appState.preferences.sendKey ?? "enter-send")
      : "enter-send";
  const inputOptions = useRef({ expanded, preference });
  inputOptions.current = { expanded, preference };
  const editor = useEditor(
    {
      ...plainTextEditorOptions,
      extensions: [...plainTextEditorOptions.extensions, UrlDecoration],
      content: draftDocument(draft.text),
      editorProps: {
        handlePaste: handlePlainTextPaste,
        handleKeyDown: (view, event) => {
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
          const runtime = model.runtime?.getSnapshot();
          const receipts = model.submission?.getSnapshot().receipts ?? [];
          if (
            runtime &&
            !queueCapped(receipts, runtime.control?.queue.length ?? 0) &&
            canSubmit(runtime)
          )
            void model.submission?.send();
          return true;
        },
        handleDOMEvents: {
          compositionend: () => {
            setTimeout(() => model.submission?.consume(), 0);
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
      onUpdate: ({ editor }) =>
        controller.edit(editor.getText({ blockSeparator: "\n" })),
    },
    [controller],
  );
  const lastAttachment = useRef<string | null>(null);
  useEffect(() => {
    if (
      !editor ||
      !selectionAttachment ||
      selectionAttachment.threadId !== draft.threadId ||
      lastAttachment.current === selectionAttachment.id
    )
      return;
    const apply = () => {
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
  }, [editor, selectionAttachment, draft.threadId, onAttachmentApplied]);
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
    model.editorBoundary = boundary;
    const submission = model.submission;
    const detachEditor = submission?.attachEditor(() =>
      replaceDraftText(editor, ""),
    );
    return () => {
      if (model.editorBoundary === boundary) model.editorBoundary = null;
      detachEditor?.();
    };
  }, [editor, model]);
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
      <EditorContent editor={editor} />
      <div className="composer-footer">
        <span>
          {expanded || preference === "enter-newline"
            ? t("composer.shortcut.newline")
            : t("composer.shortcut.send")}{" "}
          {t("composer.shortcut.undo")}
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
          {model.submission && model.runtime && (
            <SendButton
              canSend={() => !!editor && !editor.view.composing}
              submission={model.submission}
              runtime={model.runtime}
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
  const send = useSyncExternalStore(
    submission.subscribe,
    submission.getSnapshot,
  );
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const capped = queueCapped(send.receipts, state?.control?.queue.length ?? 0);
  const queued = queueCount(send.receipts, state?.control?.queue.length ?? 0);
  return (
    <div className="flex gap-2">
      <Button
        disabled={send.sending || capped || !canSubmit(state)}
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
          disabled={send.sending || capped || !canSubmit(state)}
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
