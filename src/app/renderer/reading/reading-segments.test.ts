import { expect, it } from "vitest";
import { readingSegments } from "./reading-segments";

it("bounds multiline segments without losing original text or exceeding 120 lines", () => {
  const text = "中文一行\n".repeat(1000);
  const spans = readingSegments(text);
  const pages = spans.map(({ start, end }) => text.slice(start, end));
  expect(
    Math.max(...pages.map((page) => page.split("\n").length)),
  ).toBeLessThanOrEqual(120);
  expect(pages.join("")).toBe(text);
});

it("preserves emoji pairs and CRLF at a character boundary", () => {
  for (const text of [
    "中".repeat(8191) + "😀末尾",
    "中".repeat(8191) + "\r\n末尾",
  ]) {
    const pages = readingSegments(text).map(({ start, end }) =>
      text.slice(start, end),
    );
    expect(pages[0]?.length).toBe(8191);
    expect(pages.join("")).toBe(text);
    expect(pages.every((page) => page.length <= 8192)).toBe(true);
  }
});
