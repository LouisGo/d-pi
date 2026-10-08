import type { Editor } from "@tiptap/core";
import {
  NodeSelection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import { onDraftHistoryClear } from "../editor/plain-text-editor";
export function selectedReference(editor: Editor): string | null {
  const selection = editor.state.selection;
  return selection instanceof NodeSelection &&
    selection.node.type.name === "attachmentReference"
    ? String(selection.node.attrs.id)
    : null;
}
export function navigateReference(
  editor: Editor,
  event: KeyboardEvent,
): boolean {
  if (
    event.altKey ||
    event.metaKey ||
    event.ctrlKey ||
    !["ArrowLeft", "ArrowRight"].includes(event.key)
  )
    return false;
  const { selection, doc } = editor.state;
  const direction = event.key === "ArrowRight" ? 1 : -1;
  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === "attachmentReference"
  ) {
    const head = direction > 0 ? selection.to : selection.from;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(
          doc,
          event.shiftKey ? selection.anchor : head,
          head,
        ),
      ),
    );
    return true;
  }
  if (!selection.empty) return false;
  const node =
    direction > 0 ? selection.$head.nodeAfter : selection.$head.nodeBefore;
  if (node?.type.name !== "attachmentReference") return false;
  const pos = direction > 0 ? selection.head : selection.head - node.nodeSize;
  editor.view.dispatch(
    editor.state.tr.setSelection(
      event.shiftKey
        ? TextSelection.create(
            doc,
            selection.anchor,
            selection.head + direction * node.nodeSize,
          )
        : NodeSelection.create(doc, pos),
    ),
  );
  return true;
}
/** Selection is mapped while details are open; replacement/owner changes revoke restoration. */
export function captureReferenceFocus(
  editor: Editor,
  isCurrent: () => boolean,
) {
  let bookmark = editor.state.selection.getBookmark(),
    valid = true,
    finished = false;
  const map = ({ transaction }: { transaction: Transaction }) => {
    if (transaction.getMeta("dpiTrustedDraftReplacement")) valid = false;
    else bookmark = bookmark.map(transaction.mapping);
  };
  editor.on("transaction", map);
  const clear = onDraftHistoryClear(editor, () => {
    valid = false;
  });
  return (restore: boolean) => {
    if (finished) return;
    finished = true;
    editor.off("transaction", map);
    clear();
    if (
      !restore ||
      !valid ||
      editor.isDestroyed ||
      !editor.isEditable ||
      !isCurrent() ||
      editor.view.composing
    )
      return;
    editor.view.dispatch(
      editor.state.tr.setSelection(bookmark.resolve(editor.state.doc)),
    );
    editor.commands.focus(undefined, { scrollIntoView: false });
  };
}
