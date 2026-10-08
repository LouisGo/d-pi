import type { Editor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { SupportedLocale } from "../../../../shared/i18n/locale";
import type { Attachment } from "../../contracts/public";
import type { AttachmentEditorPort } from "../../core/attachments/attachment-model";
import type { DraftController } from "../../core/draft-controller";
import type {
  AttachmentImportEditor,
  AttachmentImportTarget,
} from "../attachments/attachment-imports";
import { onDraftHistoryClear } from "../editor/plain-text-editor";
import { AttachmentAdoption, isDetachedImage } from "./attachment-adoption";
import {
  attachmentNodeAttrs,
  insertAttachmentReference,
} from "./attachment-reference";
import { referenceSourceMatches } from "./suggestion-controller";

/** Concrete editing mechanics stay in the Tiptap adapter, outside the coordinator. */
export function createAttachmentEditor(
  editor: Editor,
  isCurrent: () => boolean,
  options?: { controller: DraftController; adoption?: AttachmentAdoption },
): AttachmentEditorPort & AttachmentImportEditor {
  const adoption = options
    ? (options.adoption ?? new AttachmentAdoption(options.controller))
    : undefined;
  let adopted: readonly string[] = [];
  return {
    adoptedIds: () => adopted,
    applyBatch(items) {
      const applied = applyAttachmentBatch(
        editor,
        isCurrent,
        items,
        undefined,
        adoption,
        (ids) => {
          adopted = ids;
        },
      );
      if (applied) editor.commands.focus();
      return applied;
    },
    insert(item, range, focus = true) {
      if (
        editor.isDestroyed ||
        !editor.isEditable ||
        !editor.view.editable ||
        !isCurrent() ||
        editor.view.composing
      )
        return false;
      if (range && !referenceSourceMatches(editor.state, range)) return false;
      if (options && item.threadId !== options.controller.threadId)
        return false;
      const accepted = adoption ? adoption.admit([item]) : [item];
      if (!accepted.length) {
        if (range?.consumeOnDuplicate && item.source === "reference") {
          const tr = editor.state.tr
            .delete(range.from, range.to)
            .setMeta("dpiIndependentAction", true)
            .scrollIntoView();
          editor.view.dispatch(tr);
          if (!editor.state.doc.eq(tr.doc)) return false;
        }
        if (focus) editor.commands.focus();
        return true;
      }
      if (isDetachedImage(item)) {
        if (!options) return false;
        options.controller.addDetachedAttachments([item.id]);
        if (focus) editor.commands.focus();
        return true;
      }
      const tr = insertAttachmentReference(editor.state, item, range);
      editor.view.dispatch(tr);
      if (!editor.state.doc.eq(tr.doc)) return false;
      if (focus) editor.commands.focus();
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
  adoption?: AttachmentAdoption,
  onAdopt?: (ids: readonly string[]) => void,
): boolean {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    !editor.view.editable ||
    !isCurrent() ||
    editor.view.composing ||
    !items.length
  )
    return false;
  if (
    adoption &&
    items.some((item) => item.threadId !== adoption.controller.threadId)
  )
    return false;
  const activeIds = adoption ? adoption.controller.getAttachmentIds() : [];
  const accepted = adoption ? adoption.admit(items) : items;
  const report = () =>
    onAdopt?.([...new Set([...activeIds, ...accepted.map((item) => item.id)])]);
  if (!accepted.length) {
    report();
    return true;
  }
  const images = accepted.filter(isDetachedImage);
  if (images.length && !adoption) return false;
  const files = accepted.filter((item) => !isDetachedImage(item));
  if (!files.length) {
    adoption?.controller.addDetachedAttachments(images.map((item) => item.id));
    report();
    return true;
  }
  const type = editor.state.schema.nodes.attachmentReference;
  if (!type) return false;
  const fragment = Fragment.fromArray(
    files.map((item) => type.create(attachmentNodeAttrs(item))),
  );
  const tr =
    position === undefined
      ? editor.state.tr.replaceSelection(new Slice(fragment, 0, 0))
      : editor.state.tr.insert(position, fragment);
  tr.setMeta("dpiIndependentAction", true).scrollIntoView();
  editor.view.dispatch(tr);
  // History admission may reject; no item is marked adopted until all applied.
  const applied = editor.state.doc.eq(tr.doc);
  if (applied) {
    adoption?.controller.addDetachedAttachments(images.map((item) => item.id));
    report();
  }
  return applied;
}

/** Renderer-local left-affinity target; caret moves never redefine its intent. */
export function createAttachmentImportTarget(
  editor: Editor,
  isCurrent: () => boolean,
  options: {
    position?: number;
    sourceFrom?: number;
    controller?: DraftController;
    adoption?: AttachmentAdoption;
  } = {},
): AttachmentImportTarget {
  const adoption =
    options.adoption ??
    (options.controller
      ? new AttachmentAdoption(options.controller)
      : undefined);
  let adopted: readonly string[] = [];
  let position = options.position ?? editor.state.selection.from;
  const sourceFrom =
    options.sourceFrom !== undefined && options.sourceFrom < position
      ? options.sourceFrom
      : undefined;
  let source =
    sourceFrom === undefined ? null : [{ from: sourceFrom, to: position }];
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
    if (!isCurrent() || tr.getMeta("dpiTrustedDraftReplacement")) {
      invalidate();
      return;
    }
    // Attribute labels preserve node identity and size; their ReplaceStep maps
    // describe a structural replacement even though no source was consumed.
    if (tr.getMeta("dpiReferenceLabelRefresh")) return;
    const projectingImages = tr.getMeta("dpiDetachedImageProjection") === true;
    // Undo follows the same source-consumption fence as other transactions;
    // removing a later independent action does not invalidate surviving origin.
    for (const map of tr.mapping.maps) {
      let removedSource = false;
      const insertedAt: number[] = [];
      map.forEach((from, to, newFrom, newTo) => {
        if (from === to && newTo > newFrom) insertedAt.push(from);
        if (
          to > from &&
          (source !== null
            ? source.some((part) => from < part.to && to > part.from)
            : from <= position && to >= position)
        )
          removedSource = true;
      });
      if (removedSource && !projectingImages) {
        invalidate();
        return;
      }
      const result = map.mapResult(position, -1);
      if (result.deletedAcross && !projectingImages) {
        invalidate();
        return;
      }
      position = result.pos;
      if (source !== null) {
        // Later text inserted inside the source is not an original character.
        // Exclude those holes so deleting/Undoing them cannot consume the paste.
        const next: { from: number; to: number }[] = [];
        for (const part of source) {
          const edges = [
            part.from,
            ...insertedAt.filter((at) => at > part.from && at < part.to),
            part.to,
          ];
          for (let index = 1; index < edges.length; index++) {
            const from = map.map(edges[index - 1] ?? part.from, 1);
            const to = map.map(edges[index] ?? part.to, -1);
            const previous = next.at(-1);
            if (from < to) {
              if (previous?.to === from) previous.to = to;
              else next.push({ from, to });
            }
          }
        }
        source = next;
      }
    }
  };
  const stopHistory = onDraftHistoryClear(editor, invalidate);
  editor.on("transaction", mapped);
  editor.on("destroy", invalidate);
  return {
    invalidate,
    adoptedIds: () => adopted,
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
          adoption,
          (ids) => {
            adopted = ids;
          },
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
  locale: SupportedLocale = "en-US",
): void {
  if (editor.isDestroyed || editor.view.composing || !items.length) return;
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "attachmentReference") return;
    const item = items.find((item) => item.id === node.attrs.id);
    const attributes = item ? attachmentNodeAttrs(item, locale) : null;
    if (
      item &&
      attributes &&
      Object.entries(attributes).some(
        ([key, value]) =>
          JSON.stringify(node.attrs[key]) !== JSON.stringify(value),
      )
    )
      tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        ...attributes,
      });
  });
  if (tr.docChanged)
    editor.view.dispatch(
      tr
        .setMeta("addToHistory", false)
        .setMeta("dpiReferenceLabelRefresh", true),
    );
}
/** Recover legacy image tokens without introducing a PM action/history entry. */
export function projectDetachedImages(
  editor: Editor,
  controller: DraftController,
): void {
  if (editor.isDestroyed || editor.view.composing) return;
  const tr = editor.state.tr;
  const detached = new Set(controller.getDetachedAttachmentIds());
  const positions: { from: number; to: number }[] = [];
  const hasSelection = editor.state.doc.content.content.some(
    (node) => node.type.name === "fileReference",
  );
  editor.state.doc.descendants((node, pos) => {
    if (
      hasSelection &&
      node.type.name === "paragraph" &&
      node.childCount > 0 &&
      node.content.content.every(
        (child) =>
          child.type.name === "attachmentReference" &&
          detached.has(child.attrs.id),
      )
    ) {
      positions.push({ from: pos, to: pos + node.nodeSize });
      return false;
    }
    if (node.type.name === "attachmentReference" && detached.has(node.attrs.id))
      positions.push({ from: pos, to: pos + 1 });
    return true;
  });
  for (const pos of positions.reverse()) tr.delete(pos.from, pos.to);
  if (tr.docChanged)
    editor.view.dispatch(
      tr
        .setMeta("addToHistory", false)
        .setMeta("dpiDetachedImageProjection", true),
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
