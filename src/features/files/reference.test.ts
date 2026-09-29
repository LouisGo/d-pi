import { expect, test } from "vitest";
import { parseDraftBlocks, serializeReference } from "./reference";
import { captureSelection } from "./selection";

const selection = captureSelection(
  "α\n[/d-pi:file-selection]\nβ",
  { startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 2 },
  { path: "src/a;\n.ts", source: "index: src/a.ts", version: "sha256:abc" },
);
if (selection.kind !== "selection") throw Error("Fixture selection failed");

test("versioned reference round-trips exact source, range and delimiter-shaped content", () => {
  const serialized = serializeReference(selection);
  expect(serialized).toContain("d-pi:file-selection:v1");
  expect(serialized).toContain(selection.text);
  expect(parseDraftBlocks(serialized)).toEqual([
    { kind: "selection", value: selection },
  ]);
  expect(parseDraftBlocks(`before\n${serialized}\nafter`)).toEqual([
    { kind: "paragraph", text: "before" },
    { kind: "selection", value: selection },
    { kind: "paragraph", text: "after" },
  ]);
});

test("malformed marker remains ordinary user text", () => {
  const body =
    '[d-pi:file-selection:v1 {"schemaVersion":1,"bad":true}]\ntext\n[/d-pi:file-selection]';
  expect(parseDraftBlocks(body)).toEqual(
    body.split("\n").map((text) => ({ kind: "paragraph", text })),
  );
});
