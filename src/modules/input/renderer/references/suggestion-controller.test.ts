import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { expect, it } from "vitest";
import {
  draftDocument,
  plainTextEditorOptions,
} from "../editor/plain-text-editor";
import {
  isCompositionKey,
  referenceSourceMatches,
  SuggestionController,
} from "./suggestion-controller";

const schema = getSchema(plainTextEditorOptions.extensions);
function at(text: string) {
  const doc = schema.nodeFromJSON(draftDocument(text));
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, text.length + 1),
  });
}
it("keeps Escape dismissal for the same token across edits, resetting only after leaving it", () => {
  const c = new SuggestionController();
  expect(c.observe(at("@foo"))?.query).toBe("foo");
  c.dismiss();
  expect(c.observe(at("@foox"))).toBeNull();
  c.observe(at("@foox "));
  expect(c.observe(at("@bar"))?.query).toBe("bar");
});
it("checks the exact expected source against equal-length replacement and moved caret", () => {
  const c = new SuggestionController();
  const a = c.observe(at("@foo"));
  if (!a) throw Error("missing trigger");
  expect(referenceSourceMatches(at("@foo"), a)).toBe(true);
  expect(referenceSourceMatches(at("@bar"), a)).toBe(false);
  const state = at("@foo tail");
  expect(referenceSourceMatches(state, a)).toBe(true);
});
it("fences IME by view state, event state and Safari/macOS 229", () => {
  expect(isCompositionKey({ isComposing: false, keyCode: 229 }, false)).toBe(
    true,
  );
  expect(isCompositionKey({ isComposing: true, keyCode: 13 }, false)).toBe(
    true,
  );
  expect(isCompositionKey({ isComposing: false, keyCode: 13 }, true)).toBe(
    true,
  );
  expect(isCompositionKey({ isComposing: false, keyCode: 13 }, false)).toBe(
    false,
  );
});
