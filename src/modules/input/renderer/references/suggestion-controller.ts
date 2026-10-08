import type { Editor } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { onDraftHistoryClear } from "../editor/plain-text-editor";
import { attachmentMention } from "./attachment-reference";
export type ReferenceTrigger = {
  from: number;
  to: number;
  query: string;
  expectedSource: string;
};
/** Ephemeral popup policy, never an editable draft or a resource owner. */
export class SuggestionController {
  private dismissedFrom: number | null = null;
  private trigger: ReferenceTrigger | null = null;
  observe(state: EditorState): ReferenceTrigger | null {
    const mention = attachmentMention(state);
    if (!mention || mention.from !== this.dismissedFrom)
      this.dismissedFrom = null;
    this.trigger = mention
      ? { ...mention, expectedSource: `@${mention.query}` }
      : null;
    return this.trigger && this.dismissedFrom !== this.trigger.from
      ? this.trigger
      : null;
  }
  dismiss(): void {
    this.dismissedFrom = this.trigger?.from ?? null;
  }
}
export function isCompositionKey(
  event: Pick<KeyboardEvent, "isComposing" | "keyCode">,
  composing: boolean,
): boolean {
  return composing || event.isComposing || event.keyCode === 229;
}
export function referenceSourceMatches(
  state: EditorState,
  range: { from: number; to: number; expectedSource?: string; valid?: boolean },
): boolean {
  if (
    range.valid === false ||
    range.from < 0 ||
    range.to > state.doc.content.size ||
    range.from >= range.to
  )
    return false;
  if (range.expectedSource !== undefined)
    return (
      state.doc.textBetween(range.from, range.to, "\n", "\ufffc") ===
      range.expectedSource
    );
  const current = attachmentMention(state);
  return !!current && current.from === range.from && current.to === range.to;
}
/** Maps only the source span while Main verifies a chosen candidate. */
export function trackReferenceRange(editor: Editor, trigger: ReferenceTrigger) {
  const range = {
    from: trigger.from,
    to: trigger.to,
    expectedSource: trigger.expectedSource,
    valid: true,
  };
  const map = ({ transaction }: { transaction: Transaction }) => {
    if (transaction.getMeta("dpiTrustedDraftReplacement")) range.valid = false;
    if (!range.valid) return;
    range.from = transaction.mapping.map(range.from, 1);
    range.to = transaction.mapping.map(range.to, -1);
    if (!referenceSourceMatches(editor.state, range)) range.valid = false;
  };
  editor.on("transaction", map);
  const clear = onDraftHistoryClear(editor, () => {
    range.valid = false;
  });
  return {
    range,
    release() {
      editor.off("transaction", map);
      clear();
      range.valid = false;
    },
  };
}
