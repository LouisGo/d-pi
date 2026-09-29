import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/typescript/register";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/definitions/css/register";
import "monaco-editor/languages/definitions/html/register";
import "monaco-editor/languages/definitions/markdown/register";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import { useEffect, useRef, useState } from "react";
import type {
  FrozenSelection,
  SelectionSource,
} from "../features/files/selection";
import { captureSelection } from "../features/files/selection";
import { useI18n } from "./i18n/i18n-provider";

Object.assign(globalThis, {
  MonacoEnvironment: {
    getWorker(_id: string, _label: string) {
      return new editorWorker();
    },
  },
});

export type CodeView =
  | { kind: "file"; text: string; source: SelectionSource }
  | {
      kind: "diff";
      left: { text: string; source: SelectionSource };
      right: { text: string; source: SelectionSource };
    };

function language(path: string): string {
  if (/\.(ts|tsx|mts|cts)$/.test(path)) return "typescript";
  if (/\.(js|jsx|mjs|cjs)$/.test(path)) return "javascript";
  if (/\.jsonc?$/.test(path)) return "plaintext";
  if (/\.css$/.test(path)) return "css";
  if (/\.html?$/.test(path)) return "html";
  if (/\.md$/.test(path)) return "markdown";
  return "plaintext";
}
function applyTheme() {
  const styles = getComputedStyle(document.documentElement);
  const color = (name: string) => styles.getPropertyValue(name).trim();
  const dark = document.documentElement.dataset.theme === "dark";
  monaco.editor.defineTheme("d-pi", {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": color("--background"),
      "editor.foreground": color("--foreground"),
      "editorLineNumber.foreground": color("--muted-foreground"),
      "editorCursor.foreground": color("--primary"),
      "editor.selectionBackground": color("--code-selection"),
      "editorWidget.background": color("--background"),
      "editorWidget.border": color("--border"),
      "diffEditor.insertedTextBackground": color("--diff-added-background"),
      "diffEditor.removedTextBackground": color("--diff-removed-background"),
    },
  });
  monaco.editor.setTheme("d-pi");
}
export function MonacoViewer({
  view,
  onSelection,
}: {
  view: CodeView;
  onSelection: (value: FrozenSelection) => void;
}) {
  const { t } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const selectionHandler = useRef(onSelection);
  selectionHandler.current = onSelection;
  const [workerFailed, setWorkerFailed] = useState(false);
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (event.message.includes("worker") || event.filename.includes("worker"))
        setWorkerFailed(true);
    };
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, []);
  useEffect(() => {
    if (!container.current) return;
    applyTheme();
    const observer = new MutationObserver(() => {
      applyTheme();
      editor.layout();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-density"],
    });
    const resize = new ResizeObserver(() => editor.layout());
    resize.observe(container.current);
    const disposables: monaco.IDisposable[] = [];
    const models: monaco.editor.ITextModel[] = [];
    let editor:
      | monaco.editor.IStandaloneCodeEditor
      | monaco.editor.IStandaloneDiffEditor;
    const model = (text: string, source: SelectionSource) => {
      const created = monaco.editor.createModel(
        text,
        language(source.path),
        monaco.Uri.parse(
          `inmemory://d-pi/${crypto.randomUUID()}/${encodeURIComponent(source.path)}`,
        ),
      );
      models.push(created);
      return created;
    };
    const watch = (
      code: monaco.editor.IStandaloneCodeEditor,
      source: SelectionSource,
    ) => {
      disposables.push(
        code.onDidChangeCursorSelection(({ selection }) => {
          const current = code.getModel();
          if (current)
            selectionHandler.current(
              captureSelection(current.getValue(), selection, source),
            );
        }),
      );
    };
    if (view.kind === "file") {
      const code = monaco.editor.create(container.current, {
        model: model(view.text, view.source),
        readOnly: true,
        domReadOnly: true,
        automaticLayout: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        theme: "d-pi",
      });
      editor = code;
      watch(code, view.source);
    } else {
      const diff = monaco.editor.createDiffEditor(container.current, {
        readOnly: true,
        originalEditable: false,
        automaticLayout: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderSideBySide: true,
        useInlineViewWhenSpaceIsLimited: false,
        theme: "d-pi",
      });
      diff.setModel({
        original: model(view.left.text, view.left.source),
        modified: model(view.right.text, view.right.source),
      });
      editor = diff;
      watch(diff.getOriginalEditor(), view.left.source);
      watch(diff.getModifiedEditor(), view.right.source);
    }
    return () => {
      observer.disconnect();
      resize.disconnect();
      for (const disposable of disposables) disposable.dispose();
      editor.dispose();
      for (const item of models) item.dispose();
    };
  }, [view]);
  return (
    <>
      <div className="monaco-readonly" ref={container} />
      {workerFailed && <p role="alert">{t("ui.files.workerFailed")}</p>}
    </>
  );
}
