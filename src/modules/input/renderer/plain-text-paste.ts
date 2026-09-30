import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorProps } from "@tiptap/pm/view";
import { htmlToEditableMarkdown } from "./structured-paste";

// S1 edits source text. Do not let an alternative HTML representation consume
// Markdown syntax or let the default text parser collapse blank paragraphs.
export function textPasteTransaction(
  state: EditorState,
  text: string,
): Transaction {
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) throw new Error("Plain-text editor requires paragraphs");
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      paragraph.create(null, line ? state.schema.text(line) : null),
    );
  return state.tr
    .replaceSelection(new Slice(Fragment.fromArray(paragraphs), 1, 1))
    .setMeta("paste", true)
    .setMeta("uiEvent", "paste")
    .scrollIntoView();
}

export const handlePlainTextPaste: NonNullable<EditorProps["handlePaste"]> = (
  view,
  event,
) => {
  const clipboard = event.clipboardData;
  if (!clipboard?.types.includes("text/plain")) return false;
  const text = clipboard.getData("text/plain");
  // An explicitly empty text representation must not fall through to HTML.
  if (text) view.dispatch(textPasteTransaction(view.state, text));
  return true;
};

export function createClipboardPaste(onUnsupported?: () => void) {
  let plain = false;
  return {
    keyDown(event: KeyboardEvent): void {
      plain =
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "v";
    },
    reset(): void {
      plain = false;
    },
    handlePaste: ((view, event) => {
      const forcePlain = plain;
      plain = false;
      const clipboard = event.clipboardData;
      if (!clipboard) return false;
      // Until the content importer accepts these forms, reject the whole paste
      // explicitly rather than consuming just its textual representation.
      if (
        clipboard.files.length ||
        /<img(?:\s|>)/i.test(clipboard.getData("text/html"))
      ) {
        onUnsupported?.();
        return true;
      }
      if (forcePlain)
        return handlePlainTextPaste(
          view,
          event,
          new Slice(Fragment.empty, 0, 0),
        );
      const html = clipboard.getData("text/html");
      const hasText = clipboard.types.includes("text/plain");
      // Our own source editor also supplies paragraph HTML: prefer its exact
      // plain source unless the clipboard actually offers structural markup.
      const structured =
        /<(?:h[1-6]|ul|ol|table|pre|blockquote|a|strong|em|b|i)(?:\s|>)/i.test(
          html,
        );
      if (html && (structured || !hasText)) {
        const text = htmlToEditableMarkdown(html);
        if (text) view.dispatch(textPasteTransaction(view.state, text));
        return true;
      }
      return handlePlainTextPaste(view, event, new Slice(Fragment.empty, 0, 0));
    }) satisfies NonNullable<EditorProps["handlePaste"]>,
  };
}
