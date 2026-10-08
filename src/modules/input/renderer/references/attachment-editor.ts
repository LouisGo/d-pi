import type { Editor } from "@tiptap/core";
import { isHistoryTransaction } from "@tiptap/pm/history";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { Attachment } from "../../contracts/public";
import type { AttachmentEditorPort } from "../../core/attachments/attachment-model";
import type {
  AttachmentImportEditor,
  AttachmentImportTarget,
} from "../attachments/attachment-imports";
import { onDraftHistoryClear } from "../editor/plain-text-editor";
import { insertAttachmentReference } from "./attachment-reference";
import { referenceSourceMatches } from "./suggestion-controller";

/** Concrete editing mechanics stay in the Tiptap adapter, outside the coordinator. */
export function createAttachmentEditor(
  editor: Editor,
  isCurrent: () => boolean,
): AttachmentEditorPort & AttachmentImportEditor {
  return {
    applyBatch(items) {
      return applyAttachmentBatch(editor, isCurrent, items);
    },
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

/** A single admission-controlled PM transaction is the whole batch adoption. */
function applyAttachmentBatch(
  editor: Editor,
  isCurrent: () => boolean,
  items: Attachment[],
  position?: number,
): boolean {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    !isCurrent() ||
    editor.view.composing ||
    !items.length
  )
    return false;
  const type = editor.state.schema.nodes.attachmentReference;
  if (!type) return false;
  const fragment = Fragment.fromArray(items.map((item) => type.create(item)));
  const tr =
    position === undefined
      ? editor.state.tr.replaceSelection(new Slice(fragment, 0, 0))
      : editor.state.tr.insert(position, fragment);
  tr.setMeta("dpiIndependentAction", true).scrollIntoView();
  editor.view.dispatch(tr);
  // History admission may reject; no item is marked adopted until all applied.
  return editor.state.doc.eq(tr.doc);
}

/** Renderer-local left-affinity target; caret moves never redefine its intent. */
export function createAttachmentImportTarget(
  editor: Editor,
  isCurrent: () => boolean,
  options: { position?: number; sourceFrom?: number } = {},
): AttachmentImportTarget {
  let position = options.position ?? editor.state.selection.from;
  let sourceFrom =
    options.sourceFrom !== undefined && options.sourceFrom < position
      ? options.sourceFrom
      : undefined;
  let valid = true;
  let applying = false;
  const invalidate = () => {
    if (!valid) return;
    valid = false;
    editor.off("transaction", mapped);
    editor.off("destroy", invalidate);
    stopHistory();
  };
  const mapped = ({ transaction: tr }: { transaction: Transaction }) => {
    if (!valid || applying) return;
    if (
      !isCurrent() ||
      isHistoryTransaction(tr) ||
      tr.getMeta("dpiTrustedDraftReplacement")
    ) {
      invalidate();
      return;
    }
    // Attribute labels preserve node identity and size; their ReplaceStep maps
    // describe a structural replacement even though no source was consumed.
    if (tr.getMeta("dpiReferenceLabelRefresh")) return;
    for (const map of tr.mapping.maps) {
      let removedSource = false;
      map.forEach((from, to) => {
        if (
          to > from &&
          (sourceFrom !== undefined
            ? from < position && to > sourceFrom
            : from <= position && to >= position)
        )
          removedSource = true;
      });
      if (removedSource) {
        invalidate();
        return;
      }
      const result = map.mapResult(position, -1);
      if (result.deletedAcross) {
        invalidate();
        return;
      }
      position = result.pos;
      if (sourceFrom !== undefined) sourceFrom = map.map(sourceFrom, 1);
    }
  };
  const stopHistory = onDraftHistoryClear(editor, invalidate);
  editor.on("transaction", mapped);
  editor.on("destroy", invalidate);
  return {
    invalidate,
    apply(items) {
      if (!valid || !isCurrent()) {
        invalidate();
        return false;
      }
      applying = true;
      try {
        const applied = applyAttachmentBatch(
          editor,
          isCurrent,
          items,
          position,
        );
        if (applied) invalidate();
        return applied;
      } finally {
        applying = false;
      }
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
  if (tr.docChanged)
    editor.view.dispatch(
      tr
        .setMeta("addToHistory", false)
        .setMeta("dpiReferenceLabelRefresh", true),
    );
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
