import type { ComponentType } from "react";
import type { FrozenSelection } from "../../../modules/files/core/public";
import type { CodeView } from "../../../modules/files/renderer/public";
import type { AppModel } from "../wiring/model";

export type WorkbenchProps = {
  model: AppModel;
  /** Renderer bootstrap supplies the lazily loaded editor adapter. */
  editor?:
    | ComponentType<{
        view: CodeView;
        onSelection: (value: FrozenSelection) => void;
      }>
    | undefined;
};
