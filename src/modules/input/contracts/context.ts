import type { FrozenContext } from "../../resources/contracts/public";

/** The app has one draft per Thread; draftId is that existing durable identity. */
export interface ContextInsertIntent {
  operationId: string;
  draftId: string;
  revision: number;
  sequence: number;
  context: FrozenContext;
}
export type ContextInsertResult =
  | { kind: "inserted" }
  | {
      kind: "rejected";
      reason: "stale" | "unavailable" | "too-large" | "composing";
    };
