import { expect, test } from "vitest";
import { MONACO_DIFF_OPTIONS } from "./monaco-diff-options";

test("diff comparison keeps leading and trailing whitespace visible", () => {
  // Monaco defaults ignoreTrimWhitespace to true, which hides
  // indentation-only changes (significant in Python). d-pi owns this rule.
  expect(MONACO_DIFF_OPTIONS.ignoreTrimWhitespace).toBe(false);
});
