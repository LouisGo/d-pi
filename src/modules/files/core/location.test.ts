import { expect, it } from "vitest";
import { codeLocationRange } from "./location";

it("resolves actual line coordinates only on the requested file version or Diff side", () => {
  const view = {
    kind: "diff" as const,
    left: {
      text: "one\r\ntwo\rthree",
      source: { path: "a", source: "index", version: "left" },
    },
    right: {
      text: "new\nbody",
      source: { path: "a", source: "worktree", version: "right" },
    },
  };
  const location = {
    kind: "diff" as const,
    side: "left" as const,
    version: "left",
    startLine: 2,
    endLine: 3,
  };
  expect(codeLocationRange(view, location)).toEqual({
    startLineNumber: 2,
    endLineNumber: 3,
    startColumn: 1,
    endColumn: 6,
  });
  expect(codeLocationRange(view, { ...location, version: "right" })).toBeNull();
  expect(codeLocationRange(view, { ...location, startLine: 0 })).toBeNull();
  expect(codeLocationRange(view, { ...location, endLine: 4 })).toBeNull();
  expect(codeLocationRange(view, { ...location, side: "right" })).toBeNull();
});
