import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorProps } from "@tiptap/pm/view";

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
