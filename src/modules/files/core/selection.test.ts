import { expect, test } from "vitest";
import {
  captureSelection,
  codeViewIdentity,
  isDiffViewTooLarge,
  MAX_DIFF_PANE_CHARS,
} from "./selection";

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

test("CRLF view text keeps Monaco columns aligned with the raw slice", () => {
  const text = "ab\r\ncd";
  const source = { path: "a.txt", source: "working tree", version: "v" };
  expect(
    captureSelection(
      text,
      { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3 },
      source,
    ),
  ).toMatchObject({ kind: "selection", text: "ab" });
  expect(
    captureSelection(
      text,
      { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 },
      source,
    ),
  ).toMatchObject({ kind: "selection", text: "ab\r\nc" });
});

test("editor identity ignores locale display strings", () => {
  const pane = (source: string) => ({
    text: "const a = 1\n",
    source: { path: "src/a.ts", source, version: "sha256:abc" },
  });
  const left = pane("工作区文件 · 2026");
  const right = pane("Working tree file · 2026");
  expect(codeViewIdentity({ kind: "file", ...left })).toBe(
    codeViewIdentity({ kind: "file", ...right }),
  );
  const diff = (suffix: string) => ({
    kind: "diff" as const,
    left: pane(`left ${suffix}`),
    right: pane(`right ${suffix}`),
  });
  expect(codeViewIdentity(diff("甲"))).toBe(codeViewIdentity(diff("A")));
  expect(codeViewIdentity(diff("甲"))).not.toBe(
    codeViewIdentity({
      kind: "diff",
      left: pane("甲"),
      right: { ...pane("甲"), text: "changed\n" },
    }),
  );
});

test("oversized diff panes defer the visual compare", () => {
  const pane = (length: number) => ({
    text: "x".repeat(length),
    source: { path: "src/a.ts", source: "index", version: "v" },
  });
  expect(
    isDiffViewTooLarge({
      kind: "diff",
      left: pane(MAX_DIFF_PANE_CHARS),
      right: pane(MAX_DIFF_PANE_CHARS),
    }),
  ).toBe(false);
  expect(
    isDiffViewTooLarge({
      kind: "diff",
      left: pane(MAX_DIFF_PANE_CHARS + 1),
      right: pane(10),
    }),
  ).toBe(true);
  expect(
    isDiffViewTooLarge({
      kind: "file",
      text: "x".repeat(MAX_DIFF_PANE_CHARS + 1),
      source: { path: "src/a.ts", source: "working tree", version: "v" },
    }),
  ).toBe(false);
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
