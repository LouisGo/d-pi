import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/typescript/register";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/definitions/css/register";
import "monaco-editor/languages/definitions/html/register";
import "monaco-editor/languages/definitions/markdown/register";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../preferences/renderer/public";
import type {
  CodeViewModel,
  FrozenSelection,
  SelectionSource,
} from "../../core/public";
import { captureSelection, codeViewIdentity } from "../../core/public";
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
  const currentView = useRef(view);
  currentView.current = view;
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
    const element = container.current;
    if (!element) return;
    applyTheme();
    let active = true;
    let darkTheme = document.documentElement.dataset.theme === "dark";
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
      mounted: monaco.editor.ITextModel,
      text: string,
      source: SelectionSource,
      side?: "left" | "right",
    ) => {
      const snapshot = { ...source };
      disposables.push(
        code.onDidChangeCursorSelection(({ selection }) => {
          if (!active || code.getModel() !== mounted) return;
          // Same bytes may now be shown from index/worktree or a newer capture.
          // A callback from a replaced model remains bound to its mounted version.
          const latest = currentView.current;
          const currentSource =
            codeViewIdentity(latest) !== identity
              ? snapshot
              : latest.kind === "file"
                ? latest.source
                : side === "left"
                  ? latest.left.source
                  : latest.right.source;
          selectionHandler.current(
            captureSelection(text, selection, currentSource),
          );
        }),
      );
    };
    if (view.kind === "file") {
      const mounted = model(view.text, view.source);
      const code = monaco.editor.create(element, {
        model: mounted,
        readOnly: true,
        domReadOnly: true,
        automaticLayout: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        theme: "d-pi",
      });
      editor = code;
      watch(code, mounted, view.text, view.source);
    } else {
      const diff = monaco.editor.createDiffEditor(element, {
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
      const original = model(view.left.text, view.left.source);
      const modified = model(view.right.text, view.right.source);
      diff.setModel({ original, modified });
      editor = diff;
      watch(
        diff.getOriginalEditor(),
        original,
        view.left.text,
        view.left.source,
        "left",
      );
      watch(
        diff.getModifiedEditor(),
        modified,
        view.right.text,
        view.right.source,
        "right",
      );
    }
    const observer = new MutationObserver(() => {
      const nextDarkTheme = document.documentElement.dataset.theme === "dark";
      if (!active || nextDarkTheme === darkTheme) return;
      darkTheme = nextDarkTheme;
      applyTheme();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    // Density changes geometry through CSS; only observed size changes need layout.
    let layoutFrame: number | undefined;
    let lastSize: monaco.editor.IDimension | undefined;
    let pendingSize: monaco.editor.IDimension | undefined;
    const sameSize = (
      previous: monaco.editor.IDimension | undefined,
      next: monaco.editor.IDimension,
    ) => previous?.width === next.width && previous?.height === next.height;
    const resize = new ResizeObserver((entries) => {
      if (!active) return;
      const entry = entries.find((item) => item.target === element);
      if (!entry) return;
      const next = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      if (sameSize(pendingSize ?? lastSize, next)) return;
      pendingSize = next;
      if (layoutFrame !== undefined) return;
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = undefined;
        if (!active) return;
        const size = pendingSize;
        pendingSize = undefined;
        if (!size || sameSize(lastSize, size)) return;
        lastSize = size;
        editor.layout();
      });
    });
    resize.observe(element);
    return () => {
      if (!active) return;
      active = false;
      observer.disconnect();
      resize.disconnect();
      if (layoutFrame !== undefined) cancelAnimationFrame(layoutFrame);
      layoutFrame = undefined;
      pendingSize = undefined;
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
