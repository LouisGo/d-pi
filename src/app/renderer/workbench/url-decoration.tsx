import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { createRoot, type Root } from "react-dom/client";
import { WebsiteIcon } from "@/components/icons/common";
import { urlBrand } from "../components/url-display";
export const UrlDecoration = Extension.create({
  name: "localUrlDisplay",
  addProseMirrorPlugins() {
    const roots = new WeakMap<HTMLElement, Root>();
    const decorate = (doc: import("@tiptap/pm/model").Node) => {
      const marks: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (!node.isText || !node.text || marks.length >= 400) return;
        for (const match of node.text.matchAll(/https?:\/\/[^\s<>]+/g)) {
          if (marks.length >= 400) break;
          const target = match[0];
          const from = pos + match.index;
          marks.push(
            Decoration.inline(from, from + target.length, {
              class: "source-url",
              title: target,
            }),
          );
          marks.push(
            Decoration.widget(
              from,
              () => {
                const span = document.createElement("span");
                span.className = "url-icon";
                span.contentEditable = "false";
                span.setAttribute("aria-hidden", "true");
                const root = createRoot(span);
                roots.set(span, root);
                root.render(<WebsiteIcon brand={urlBrand(target)} />);
                return span;
              },
              {
                side: -1,
                key: `url:${from}:${target}`,
                destroy: (node) => {
                  if (node instanceof HTMLElement) {
                    const root = roots.get(node);
                    queueMicrotask(() => root?.unmount());
                  }
                },
              },
            ),
          );
        }
      });
      return DecorationSet.create(doc, marks);
    };
    return [
      new Plugin<DecorationSet>({
        state: {
          init: (_, state) => decorate(state.doc),
          apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
