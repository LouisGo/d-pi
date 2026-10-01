import { Node } from "@tiptap/core";
import { z } from "zod";
import { serializeReference } from "../../core/references/serialize";

const Attributes = z.object({
  kind: z.literal("selection"),
  path: z.string(),
  source: z.string(),
  version: z.string(),
  text: z.string(),
  startLine: z.number().int(),
  startColumn: z.number().int(),
  endLine: z.number().int(),
  endColumn: z.number().int(),
});

export const FileReference = Node.create({
  name: "fileReference",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return Object.fromEntries(
      Object.keys(Attributes.shape).map((key) => [key, { default: null }]),
    );
  },
  renderHTML({ node }) {
    const value = Attributes.parse(node.attrs);
    return [
      "aside",
      { class: "file-reference", contenteditable: "false" },
      [
        "strong",
        {},
        `${value.path}:${value.startLine}:${value.startColumn}-${value.endLine}:${value.endColumn}`,
      ],
      ["small", {}, `${value.source} · ${value.version}`],
      // The DOM preview needs line feeds; serialized attributes retain source bytes.
      ["pre", {}, value.text.replace(/\r\n?/g, "\n")],
    ];
  },
  renderText({ node }) {
    return serializeReference(Attributes.parse(node.attrs));
  },
});
