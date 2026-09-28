import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { match } from "ts-pattern";
import { Button } from "@/components/ui/button";
import type { Draft } from "../features/draft/contracts";
import type { DraftController } from "../features/draft/controller";
import {
  canSubmit,
  QUEUE_CAP,
  queueCapped,
  queueCount,
} from "../features/runtime/submission-admission";
import { shouldSend } from "../features/submission/shortcut";
import type { AppModel } from "./model";
import { plainTextEditorOptions, replaceDraftText } from "./plain-text-editor";
import { handlePlainTextPaste } from "./plain-text-paste";
import { UrlDecoration } from "./url-decoration";
export function Composer({
  draft,
  controller,
  model,
}: {
  draft: Draft;
  controller: DraftController;
  model: AppModel;
}) {
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
      content: {
        type: "doc",
        content: draft.text.split("\n").map((text) => ({
          type: "paragraph",
          content: text ? [{ type: "text", text }] : [],
        })),
      },
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
          "aria-label": "草稿正文",
          "aria-multiline": "true",
          spellcheck: "false",
        },
      },
      onUpdate: ({ editor }) =>
        controller.edit(editor.getText({ blockSeparator: "\n" })),
    },
    [controller],
  );
  useEffect(() => {
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
    if (submission) {
      submission.replace = () => replaceDraftText(editor, "");
      submission.consume();
    }
    return () => {
      if (model.editorBoundary === boundary) model.editorBoundary = null;
      if (submission) submission.replace = null;
    };
  }, [editor, model]);
  const status = match(state)
    .with({ kind: "saved" }, () => "已保存到此设备")
    .with({ kind: "dirty" }, () => "等待保存…")
    .with({ kind: "saving" }, () => "正在保存…")
    .with({ kind: "checking" }, () => "正在核对已保存版本…")
    .with({ kind: "conflict" }, () => "版本不同，请选择保留内容")
    .with({ kind: "failed" }, () => "尚未保存")
    .exhaustive();
  return (
    <section
      className="composer"
      data-expanded={expanded}
      aria-label="持久文字草稿"
    >
      <div className="composer-heading">
        <h2>草稿</h2>
        <span role="status" className="save-status">
          {status}
        </span>
      </div>
      <EditorContent editor={editor} />
      <div className="composer-footer">
        <span>
          {expanded || preference === "enter-newline"
            ? "Enter 换行 · ⌘Enter 发送"
            : "Enter 发送 · Shift+Enter 换行"}{" "}
          · ⌘Z 撤销
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "收起编辑区" : "展开编辑区"}
          </Button>
          <Button
            variant="ghost"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void model.preference("sendKey")}
          >
            切换发送快捷键
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
          <p>
            已保存版本与当前输入不同。选择前不会覆盖任何一份；可先复制备份。
          </p>
          <details>
            <summary>对照两份正文</summary>
            <label>
              当前输入
              <textarea
                className="draft-comparison"
                readOnly
                value={state.localText}
              />
            </label>
            <label>
              已保存正文
              <textarea
                className="draft-comparison"
                readOnly
                value={state.stored.text}
              />
            </label>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void controller.keepLocal()}>
              保留当前输入并保存
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                controller.useStored((text) => {
                  return editor ? replaceDraftText(editor, text) : false;
                })
              }
            >
              载入已保存版本
            </Button>
          </div>
          <p>
            载入会替换编辑区正文，可用 ⌘Z 撤销。输入法候选期间请先完成选字。
          </p>
        </div>
      )}
      {state.kind === "failed" && (
        <div className="failure" role="alert">
          <p>{state.error.safeMessage}</p>
          <p className="trace">追踪：{state.error.traceId}</p>
          <div className="flex gap-2">
            {state.error.recovery !== "reconcile_first" && (
              <Button onClick={() => void controller.retry()}>重试保存</Button>
            )}
            {state.error.recovery === "reconcile_first" && (
              <Button onClick={() => void model.reconcileDraft()}>
                核对保存状态
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                editor?.commands.selectAll();
                editor?.commands.focus();
              }}
            >
              全选以复制
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
        {state?.busy ? "排队发送" : "发送"}
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
          干预当前执行
        </Button>
      )}
      {capped && (
        <p role="status" className="muted">
          排队已满（{queued}/{QUEUE_CAP}），请等待消费后再发送；草稿已保留。
        </p>
      )}
    </div>
  );
}
