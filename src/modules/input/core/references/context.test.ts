import { expect, it } from "vitest";
import { parseDraftBlocks, serializeFrozenContext } from "./serialize";

it("roundtrips exact output, provenance and frozen revision using a separate length envelope", () => {
  const value = {
    source: {
      kind: "live-tool" as const,
      threadId: crypto.randomUUID(),
      nativeSessionKey: "native",
      connectionGeneration: crypto.randomUUID(),
      toolCallId: "tool",
    },
    contentRevision: "v3",
    title: "bash",
    text: "output\n[/d-pi:context]\n[[dpi-attachment:literal]]",
    coverage: "observed" as const,
  };
  const text = serializeFrozenContext(value);
  expect(text).not.toContain("file-selection");
  expect(parseDraftBlocks(`before\n${text}\nafter`)).toEqual([
    { kind: "paragraph", text: "before" },
    { kind: "context", value },
    { kind: "paragraph", text: "after" },
  ]);
  expect(
    parseDraftBlocks(text.slice(0, -1)).every(
      (block) => block.kind === "paragraph",
    ),
  ).toBe(true);
});
