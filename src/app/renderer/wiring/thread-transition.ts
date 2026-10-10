import type { Failure } from "../../../modules/input/contracts/public";
import type { ThreadModel } from "./thread-model";
export type ThreadSelectionState =
  | { kind: "empty" }
  | { kind: "thread"; thread: ThreadModel; directoryAvailable: boolean };
export type ThreadTransitionResult =
  | { kind: "applied"; selection: ThreadSelectionState }
  | {
      kind: "blocked";
      reason:
        | "not-ready"
        | "busy"
        | "closing"
        | "composing"
        | "save-failed"
        | "superseded"
        | "selection-unknown";
    }
  | { kind: "cancelled" }
  | { kind: "failed"; error: Failure }
  | { kind: "unknown"; error: Failure };
