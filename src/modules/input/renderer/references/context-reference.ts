import { Node } from "@tiptap/core";
import { FrozenContextSchema } from "../../../resources/contracts/public";
import { serializeFrozenContext } from "../../core/references/serialize";

export const ContextReference = Node.create({
  name: "contextReference",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { value: { default: null } };
  },
  renderHTML({ node }) {
    const value = FrozenContextSchema.parse(node.attrs.value);
    return [
      "aside",
      {
        class: "file-reference",
        contenteditable: "false",
        "data-context-reference": "true",
      },
      ["strong", {}, value.title],
      [
        "small",
        {},
        `${value.source.threadId} · ${value.source.nativeSessionKey} · ${value.contentRevision}`,
      ],
      ["pre", {}, value.text.replace(/\r\n?/g, "\n")],
    ];
  },
  renderText({ node }) {
    return serializeFrozenContext(FrozenContextSchema.parse(node.attrs.value));
  },
});
