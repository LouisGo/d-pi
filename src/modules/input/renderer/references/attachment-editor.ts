import type { Editor } from "@tiptap/core";
import type { Attachment } from "../../contracts/public";
import type { AttachmentEditorPort } from "../../core/attachments/attachment-model";
import { insertAttachmentReference } from "./attachment-reference";

import { referenceSourceMatches } from "./suggestion-controller";

/** Concrete editing mechanics stay in the Tiptap adapter, outside the coordinator. */
export function createAttachmentEditor(
  editor: Editor,
  isCurrent: () => boolean,
): AttachmentEditorPort {
  return {
    insert(item, range) {
      if (
        editor.isDestroyed ||
        !editor.isEditable ||
        !isCurrent() ||
        editor.view.composing
      )
        return false;
      if (range && !referenceSourceMatches(editor.state, range)) return false;
      const tr = insertAttachmentReference(editor.state, item, range);
      editor.view.dispatch(tr);
      if (!editor.state.doc.eq(tr.doc)) return false;
      editor.commands.focus();
      return true;
    },
  };
}
export function syncAttachmentLabels(
  editor: Editor,
  items: Attachment[],
): void {
  if (editor.isDestroyed || editor.view.composing || !items.length) return;
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "attachmentReference") return;
    const item = items.find((item) => item.id === node.attrs.id);
    if (
      item &&
      (node.attrs.name !== item.name ||
        node.attrs.referenceKind !== (item.referenceKind ?? null))
    )
      tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        name: item.name,
        referenceKind: item.referenceKind ?? null,
      });
  });
  if (tr.docChanged) editor.view.dispatch(tr.setMeta("addToHistory", false));
}
export function removeAttachmentReference(editor: Editor, id: string): void {
  const tr = editor.state.tr;
  const positions: number[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "attachmentReference" && node.attrs.id === id)
      positions.push(position);
  });
  for (const position of positions.reverse()) tr.delete(position, position + 1);
  editor.view.dispatch(tr.setMeta("dpiIndependentAction", true));
  editor.commands.focus();
}
export function moveAttachmentReference(
  editor: Editor,
  index: number,
  direction: -1 | 1,
): void {
  const nodes: { position: number; attrs: Record<string, unknown> }[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "attachmentReference")
      nodes.push({ position, attrs: node.attrs });
  });
  const a = nodes[index];
  const b = nodes[index + direction];
  if (a && b)
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(a.position, undefined, b.attrs)
        .setNodeMarkup(b.position, undefined, a.attrs)
        .setMeta("dpiIndependentAction", true),
    );
}
