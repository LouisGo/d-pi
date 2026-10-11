import type { FileEditorComponent } from "../../../modules/files/renderer/public";
import type { AppModel } from "../wiring/model";

export type WorkbenchProps = {
  model: AppModel;
  /** Renderer bootstrap supplies the lazily loaded editor adapter. */
  editor?: FileEditorComponent | undefined;
};
