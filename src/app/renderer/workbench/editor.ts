import {
  type FileEditorComponent,
  loadFileEditor,
} from "../../../modules/files/renderer/public";

export type { FileEditorComponent };

let cached: FileEditorComponent | null = null;

/**
 * Resolves the module-provided editor loader once per renderer process. The
 * application shell keeps only this memoized reference, so no import statement
 * for the editor bundle exists outside the files module's own loader.
 */
export function fileEditor(): FileEditorComponent {
  cached ??= loadFileEditor();
  return cached;
}
