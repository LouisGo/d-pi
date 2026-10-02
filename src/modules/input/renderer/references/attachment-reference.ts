import { Node } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { z } from "zod";

const Id = z.uuid();
export const AttachmentReference = Node.create({
  name: "attachmentReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { id: { default: null }, name: { default: null } };
  },
  renderHTML({ node }) {
    const id = Id.parse(node.attrs.id);
    return [
      "span",
      {
        class: "rounded-sm bg-muted px-1 text-foreground",
        contenteditable: "false",
        "data-attachment-id": id,
      },
      `@${node.attrs.name ?? id.slice(0, 8)}`,
    ];
  },
  renderText({ node }) {
    return `[[dpi-attachment:${Id.parse(node.attrs.id)}]]`;
  },
});

export function attachmentParagraph(text: string) {
  const content: { type: string; text?: string; attrs?: { id: string } }[] = [];
  let start = 0;
  for (const found of text.matchAll(
    /\[\[dpi-attachment:([0-9a-f-]{36})\]\]/g,
  )) {
    const parsed = Id.safeParse(found[1]);
    if (!parsed.success) continue;
    if (found.index > start)
      content.push({ type: "text", text: text.slice(start, found.index) });
    content.push({ type: "attachmentReference", attrs: { id: parsed.data } });
    start = found.index + found[0].length;
  }
  if (start < text.length)
    content.push({ type: "text", text: text.slice(start) });
  return { type: "paragraph", content };
}

export function insertAttachmentReference(
  state: EditorState,
  item: { id: string; name: string },
  range?: { from: number; to: number },
): Transaction {
  const type = state.schema.nodes.attachmentReference;
  if (!type) throw Error("Attachment reference schema unavailable");
  const node = type.create(item);
  return range
    ? state.tr.replaceWith(range.from, range.to, node).scrollIntoView()
    : state.tr.replaceSelectionWith(node).scrollIntoView();
}

export function attachmentMention(
  state: EditorState,
): { from: number; to: number; query: string } | null {
  const { empty, $from, from } = state.selection;
  if (!empty || !$from.parent.isTextblock) return null;
  const prefix = $from.parent.textBetween(
    0,
    $from.parentOffset,
    "\n",
    "\ufffc",
  );
  const found = /(?:^|\s)@([^\s\ufffc]*)$/.exec(prefix);
  if (!found) return null;
  const query = found[1] ?? "";
  return { from: from - query.length - 1, to: from, query };
}

export function attachmentIds(text: string): string[] {
  return Array.from(
    text.matchAll(/\[\[dpi-attachment:([0-9a-f-]{36})\]\]/g),
    (match) => match[1] ?? "",
  );
}
