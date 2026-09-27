import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useSyncExternalStore } from "react";
import { match } from "ts-pattern";
import { Button } from "@/components/ui/button";
import type { DraftController } from "../features/draft/controller";
import type { Draft } from "../shared/contracts";
import type { AppModel } from "./model";
import { plainTextEditorOptions } from "./plain-text-editor";
import { handlePlainTextPaste } from "./plain-text-paste";
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
  const editor = useEditor(
    {
      ...plainTextEditorOptions,
      content: {
        type: "doc",
        content: draft.text.split("\n").map((text) => ({
          type: "paragraph",
          content: text ? [{ type: "text", text }] : [],
        })),
      },
      editorProps: {
        handlePaste: handlePlainTextPaste,
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
    return () => {
      if (model.editorBoundary === boundary) model.editorBoundary = null;
    };
  }, [editor, model]);
  const status = match(state)
    .with({ kind: "saved" }, () => "已保存到此设备")
    .with({ kind: "dirty" }, () => "等待保存…")
    .with({ kind: "saving" }, () => "正在保存…")
    .with({ kind: "failed" }, () => "尚未保存")
    .exhaustive();
  return (
    <section className="composer" aria-label="持久文字草稿">
      <div className="composer-heading">
        <h2>草稿</h2>
        <span role="status" className="save-status">
          {status}
        </span>
      </div>
      <EditorContent editor={editor} />
      <div className="composer-footer">
        <span>Enter 换行 · ⌘Z 撤销</span>
        <span>仅本地起草</span>
      </div>
      {state.kind === "failed" && (
        <div className="failure" role="alert">
          <p>{state.error.safeMessage}</p>
          <p className="trace">追踪：{state.error.traceId}</p>
          <div className="flex gap-2">
            {state.error.recovery !== "reconcile_first" && (
              <Button onClick={() => void controller.retry()}>重试保存</Button>
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
