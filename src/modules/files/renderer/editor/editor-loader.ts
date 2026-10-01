import { type ComponentType, lazy } from "react";
import type { FrozenSelection } from "../../core/public";
import type { CodeView } from "./monaco-viewer";

export type FileEditorComponent = ComponentType<{
  view: CodeView;
  onSelection: (value: FrozenSelection) => void;
}>;

/**
 * The Monaco adapter touches `window` at module scope, so it must not be part
 * of any statically imported surface. This loader keeps the import expression
 * inside a function and memoizes the resulting component, letting the renderer
 * entry resolve the editor on demand while headless tests never load it.
 */
export function loadFileEditor(): FileEditorComponent {
  return lazy(() =>
    import("./monaco-viewer").then(({ MonacoViewer }) => ({
      default: MonacoViewer,
    })),
  );
}
