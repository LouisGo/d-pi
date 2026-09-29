import { expect, test } from "vitest";
import { captureSelection } from "./selection";

test("captures exact UTF-16 Monaco range and keeps source version", () => {
  const text = "first😀\nsecond line\n";
  const value = captureSelection(
    text,
    { startLineNumber: 1, startColumn: 6, endLineNumber: 2, endColumn: 7 },
    { path: "src/example.ts", source: "working tree", version: "sha256:abc" },
  );
  expect(value).toMatchObject({
    text: "😀\nsecond",
    startLine: 1,
    startColumn: 6,
    endLine: 2,
    endColumn: 7,
    version: "sha256:abc",
  });
});

test("empty or out-of-range selections do not become references", () => {
  const source = { path: "a", source: "index", version: "v" };
  expect(
    captureSelection(
      "hi",
      { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
      source,
    ),
  ).toMatchObject({ kind: "invalid" });
  expect(
    captureSelection(
      "hi",
      { startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 1 },
      source,
    ),
  ).toMatchObject({ kind: "invalid" });
});

test("oversized selections are rejected instead of truncated", () => {
  const text = "a".repeat(70_000);
  expect(
    captureSelection(
      text,
      {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 70_001,
      },
      { path: "src/big.ts", source: "working tree", version: "sha256:big" },
    ),
  ).toMatchObject({ kind: "invalid", reason: "too-large" });
});

test("crlf line endings keep carriage returns in the frozen text", () => {
  const text = "a\r\nb\r\n";
  const value = captureSelection(
    text,
    { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 },
    { path: "src/crlf.ts", source: "working tree", version: "sha256:crlf" },
  );
  expect(value).toMatchObject({
    kind: "selection",
    text: "a\r\n",
    startLine: 1,
    startColumn: 1,
    endLine: 2,
    endColumn: 1,
  });
});
