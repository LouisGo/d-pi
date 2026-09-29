import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./probe.css";
import { handlePlainTextPaste } from "../../../src/modules/input/renderer/public";
import {
  DarkThemeIcon,
  FolderIcon,
  LightThemeIcon,
} from "../../../src/app/renderer/components/icons/common";
import pasteSample from "../paste/sample.md?raw";
import styles from "./sample.module.css";

declare global {
  interface Window {
    pasteFixture?: { copy: () => Promise<{ chars: number; types: string[] }> };
  }
}

function Probe() {
  const [events, setEvents] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState("");
  const record = (name: string) =>
    setEvents((old) => [...old.slice(-19), name]);
  const editor = useEditor({
    extensions: [Document, Paragraph, Text, UndoRedo],
    content: "<p></p>",
    onUpdate: ({ editor }) =>
      setSnapshot(editor.getText({ blockSeparator: "\n" })),
    editorProps: {
      handlePaste: handlePlainTextPaste,
      attributes: {
        role: "textbox",
        "aria-label": "输入验证",
        "aria-multiline": "true",
      },
      handleDOMEvents: {
        paste: (_view, event) => {
          record(
            `paste text/plain matches fixture: ${event.clipboardData?.getData("text/plain") === pasteSample}`,
          );
          return false;
        },
        compositionstart: () => {
          record("compositionstart");
          return false;
        },
        compositionend: () => {
          record("compositionend");
          return false;
        },
      },
    },
  });
  return (
    <main>
      <h1>S1 · 输入接入验证</h1>
      <div className="flex gap-4">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const root = document.documentElement;
            root.dataset.theme =
              root.dataset.theme === "dark" ? "light" : "dark";
          }}
        >
          切换主题
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const root = document.documentElement;
            root.dataset.density =
              root.dataset.density === "compact" ? "normal" : "compact";
          }}
        >
          切换密度
        </button>
      </div>
      <div className="flex gap-4">
        <span className="text-primary">Tailwind primary</span>
        <span className={styles.sample}>Module primary</span>
        <span className="sample-global">CSS primary</span>
      </div>
      <p>
        这是隔离的编辑器验证窗口，文字不保存、不发送。使用系统中文输入法输入，确认候选后换行，粘贴可编辑文字并测试选择、撤销和重做。
      </p>
      {window.pasteFixture && (
        <>
          <button
            type="button"
            onClick={async () => {
              await window.pasteFixture?.copy();
              editor?.commands.clearContent();
              editor?.commands.focus();
            }}
          >
            复制双 MIME 测试原文并清空
          </button>
          <p>
            原文一致：{snapshot === pasteSample ? "是" : "否"} · 实际{" "}
            {snapshot.length} / 预期 {pasteSample.length} 字符
          </p>
        </>
      )}
      <EditorContent editor={editor} />
      <p>⌘Z 撤销 · ⇧⌘Z 重做 · Enter 换行</p>
      <div className="flex gap-4" aria-label="已用图标样例">
        {([16, 18, 20, 24] as const).map((size) => (
          <div key={size}>
            <span>{size}</span>
            <FolderIcon size={size} />
            <LightThemeIcon size={size} />
            <DarkThemeIcon size={size} />
          </div>
        ))}
      </div>
      <h2>实际正文</h2>
      <pre>{snapshot}</pre>
      <h2>输入法事件（不记录正文）</h2>
      <pre>{events.join("\n")}</pre>
    </main>
  );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<Probe />);
