import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/typescript/register";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/definitions/css/register";
import "monaco-editor/languages/definitions/html/register";
import "monaco-editor/languages/definitions/markdown/register";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../preferences/renderer/public";
import type {
  CodeViewModel,
  FrozenSelection,
  SelectionSource,
} from "../core/public";
import { captureSelection, codeViewIdentity } from "../core/public";
import { MONACO_DIFF_OPTIONS } from "./monaco-diff-options";

Object.assign(globalThis, {
  MonacoEnvironment: {
    getWorker(_id: string, _label: string) {
      return new editorWorker();
    },
  },
});

export type CodeView = CodeViewModel;

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
  const viewRef = useRef(view);
  viewRef.current = view;
  // Locale display strings must not destroy the editor and its selection.
  const identity = codeViewIdentity(view);
  const [workerFailed, setWorkerFailed] = useState(false);
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.message ?? "";
      const filename = event.filename ?? "";
      if (message.includes("worker") || filename.includes("worker"))
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
    const sourceOf = (side: "file" | "left" | "right"): SelectionSource => {
      const current = viewRef.current;
      if (current.kind === "file") return current.source;
      if (side === "left") return current.left.source;
      return current.right.source;
    };
    const watch = (
      code: monaco.editor.IStandaloneCodeEditor,
      side: "file" | "left" | "right",
    ) => {
      disposables.push(
        code.onDidChangeCursorSelection(({ selection }) => {
          const current = code.getModel();
          if (current)
            selectionHandler.current(
              captureSelection(current.getValue(), selection, sourceOf(side)),
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
      watch(code, "file");
    } else {
      const diff = monaco.editor.createDiffEditor(container.current, {
        readOnly: true,
        originalEditable: false,
        automaticLayout: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderSideBySide: true,
        useInlineViewWhenSpaceIsLimited: false,
        ...MONACO_DIFF_OPTIONS,
        theme: "d-pi",
      });
      diff.setModel({
        original: model(view.left.text, view.left.source),
        modified: model(view.right.text, view.right.source),
      });
      editor = diff;
      watch(diff.getOriginalEditor(), "left");
      watch(diff.getModifiedEditor(), "right");
    }
    return () => {
      observer.disconnect();
      resize.disconnect();
      for (const disposable of disposables) disposable.dispose();
      editor.dispose();
      for (const item of models) item.dispose();
    };
  }, [identity]);
  return (
    <>
      <div className="monaco-readonly" ref={container} />
      {workerFailed && <p role="alert">{t("ui.files.workerFailed")}</p>}
    </>
  );
}
