import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { FrozenSelection } from "../../../files/core/public";

export function appendSelectionReference(
  state: EditorState,
  value: Extract<FrozenSelection, { kind: "selection" }>,
): Transaction {
  const reference = state.schema.nodes.fileReference;
  if (!reference) throw new Error("Composer file reference schema unavailable");
  return state.tr.insert(state.doc.content.size, reference.create(value));
}
