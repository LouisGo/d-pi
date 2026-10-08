import { Node } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { z } from "zod";
import { createI18n } from "../../../../shared/i18n/create-i18n";
import type { SupportedLocale } from "../../../../shared/i18n/locale";
import {
  type Attachment,
  AttachmentFailureReasonSchema,
} from "../../contracts/public";
import {
  filePresentation,
  fileTypeIconPaths,
  formatFileSize,
} from "./file-presentation";

const Id = z.uuid();
export const AttachmentReference = Node.create({
  name: "attachmentReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: { default: null },
      name: { default: null },
      referenceKind: { default: null },
      contextKind: { default: "unresolved" },
      mimeType: { default: null },
      byteLength: { default: null },
      representation: { default: null },
      status: { default: null },
      reason: { default: null },
      coverageGaps: { default: [] },
      textOnly: { default: false },
      presentationLocale: { default: "en-US" },
    };
  },
  renderHTML({ node }) {
    const id = Id.parse(node.attrs.id);
    const external = node.attrs.contextKind === "external";
    const hidden = isAttachmentNodeHidden(node.attrs);
    const file = filePresentation(
      node.attrs.name,
      external ? node.attrs.mimeType : undefined,
      node.attrs.referenceKind,
    );
    const name = `${node.attrs.name ?? id.slice(0, 8)}${node.attrs.referenceKind === "directory" ? "/" : ""}`;
    const size = external ? formatFileSize(node.attrs.byteLength) : null;
    const locale =
      node.attrs.presentationLocale === "zh-CN" ? "zh-CN" : "en-US";
    const { t } = createI18n(locale);
    const reason = AttachmentFailureReasonSchema.safeParse(node.attrs.reason);
    const status =
      node.attrs.status === "failed"
        ? "failed"
        : node.attrs.status === "preparing"
          ? "preparing"
          : Array.isArray(node.attrs.coverageGaps) &&
              node.attrs.coverageGaps.length
            ? "partial"
            : null;
    const notice =
      status === "failed"
        ? reason.success
          ? t(`attachment.reason.${reason.data}`)
          : t("attachment.failed")
        : status === "preparing"
          ? t("attachment.preparing")
          : status === "partial"
            ? t(
                node.attrs.textOnly
                  ? "attachment.textOnlyNotice"
                  : "attachment.coverageGap",
              )
            : null;
    const children: DOMOutputSpec[] = [
      [
        "span",
        { class: "composer-context-type", "aria-hidden": "true" },
        badgeIcon(fileTypeIconPaths(file.kind)),
        ["span", { class: "composer-context-type-label" }, file.label],
      ],
      ["span", { class: "composer-context-name" }, name],
    ];
    if (size)
      children.push([
        "span",
        { class: "composer-context-size", "aria-hidden": "true" },
        size,
      ]);
    if (status && notice)
      children.push([
        "span",
        {
          class: "composer-context-status",
          "data-status": status,
          "aria-hidden": "true",
        },
        badgeIcon([
          status === "preparing"
            ? "M12 3a9 9 0 1 1-9 9M12 6v6l4 2"
            : status === "failed"
              ? "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v6m0 4h.01"
              : "M12 3 2 21h20ZM12 9v5m0 4h.01",
        ]),
      ]);
    const consent =
      node.attrs.textOnly &&
      Array.isArray(node.attrs.coverageGaps) &&
      node.attrs.coverageGaps.length
        ? t("attachment.textOnlyNotice")
        : null;
    const label = [
      t("attachment.preview", { name }),
      file.label,
      size,
      notice,
      consent !== notice ? consent : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return [
      "span",
      {
        class: "composer-context-token",
        contenteditable: "false",
        role: "button",
        "data-attachment-id": id,
        "data-reference-kind": node.attrs.referenceKind,
        "data-context-kind": node.attrs.contextKind,
        "data-file-kind": file.kind,
        "data-status": status,
        "data-reason": node.attrs.reason,
        "aria-label": label,
        title: [name, size, notice, consent !== notice ? consent : null]
          .filter(Boolean)
          .join(" · "),
        hidden: hidden ? true : undefined,
      },
      ...children,
    ];
  },
  renderText({ node }) {
    return `[[dpi-attachment:${Id.parse(node.attrs.id)}]]`;
  },
});

export function isAttachmentNodeHidden(
  attrs: Record<string, unknown>,
): boolean {
  return (
    attrs.contextKind === "unresolved" ||
    (attrs.contextKind === "external" &&
      (attrs.representation === "image" ||
        (typeof attrs.mimeType === "string" &&
          attrs.mimeType.toLowerCase().startsWith("image/"))))
  );
}

function badgeIcon(paths: readonly string[]): DOMOutputSpec {
  return [
    "http://www.w3.org/2000/svg svg",
    {
      viewBox: "0 0 24 24",
      width: 16,
      height: 16,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.5,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      focusable: "false",
      "aria-hidden": "true",
    },
    ...paths.map(
      (d): DOMOutputSpec => ["http://www.w3.org/2000/svg path", { d }],
    ),
  ];
}

export function contextTypeLabel(name: unknown, kind?: unknown): string {
  return filePresentation(name, undefined, kind).label;
}
type AttachmentNodeItem = Pick<Attachment, "id" | "name" | "referenceKind"> &
  Partial<
    Pick<
      Attachment,
      | "source"
      | "frozenReference"
      | "mimeType"
      | "byteLength"
      | "representation"
      | "status"
      | "reason"
      | "coverageGaps"
      | "textOnly"
    >
  >;

export function attachmentNodeAttrs(
  item: AttachmentNodeItem,
  presentationLocale: SupportedLocale = "en-US",
) {
  return {
    id: item.id,
    name: item.name,
    referenceKind: item.referenceKind ?? null,
    contextKind:
      !item.source || item.source === "reference" || item.frozenReference
        ? "project"
        : "external",
    mimeType: item.mimeType ?? null,
    byteLength: item.byteLength ?? null,
    representation: item.representation ?? null,
    status: item.status ?? null,
    reason: item.reason ?? null,
    coverageGaps: item.coverageGaps ?? [],
    textOnly: item.textOnly ?? false,
    presentationLocale,
  };
}

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
  item: AttachmentNodeItem,
  range?: { from: number; to: number },
): Transaction {
  const type = state.schema.nodes.attachmentReference;
  if (!type) throw Error("Attachment reference schema unavailable");
  const node = type.create(attachmentNodeAttrs(item));
  return range
    ? state.tr
        .replaceWith(range.from, range.to, node)
        .setMeta("dpiIndependentAction", true)
        .scrollIntoView()
    : state.tr
        .replaceSelectionWith(node)
        .setMeta("dpiIndependentAction", true)
        .scrollIntoView();
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
