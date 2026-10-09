// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  ConversationModel,
  ReadingPositions,
} from "../../../modules/conversation/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { Conversation } from "./conversation";
import { ReadingBody } from "./reading-body";

function fixture() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return {
    container,
    render: (text: string, streaming = true, raw = false) =>
      act(() =>
        root.render(
          createElement(I18nProvider, {
            initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
            children: createElement(ReadingBody, { text, streaming, raw }),
          }),
        ),
      ),
    dispose: async () => {
      window.getSelection()?.removeAllRanges();
      await act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}

it.each([
  { name: "character", tail: "正文😀".repeat(3000) },
  {
    name: "line",
    tail: Array.from({ length: 150 }, (_, i) => `paragraph ${i}\n\n`).join(""),
  },
])(
  "keeps all Markdown and closed nodes while streaming crosses the old $name threshold",
  async ({ tail }) => {
    const f = fixture();
    const prefix =
      "# Continuous answer\n\nStable selected prefix.\n\n| First | Second |\n| --- | --- |\n| a | b |\n\n```js\nconst ready = true;\n```\n\n";
    let observer: MutationObserver | undefined;
    try {
      await f.render(prefix + "Tail starts.");
      const paragraph = f.container.querySelector("p");
      const node = paragraph?.firstChild;
      const table = f.container.querySelector("table");
      const code = f.container.querySelector('[data-streamdown="code-block"]');
      if (!paragraph || !node || !table || !code)
        throw Error("missing Markdown prefix");
      const range = document.createRange();
      range.setStart(node, 7);
      range.setEnd(node, 15);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const mutations: MutationRecord[] = [];
      observer = new MutationObserver((records) => mutations.push(...records));
      observer.observe(paragraph, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      await f.render(prefix + tail + "\n\nEND_CONTINUOUS");
      expect(f.container.querySelector("h1")?.textContent).toBe(
        "Continuous answer",
      );
      expect(f.container.querySelector("table")).toBe(table);
      expect(f.container.querySelector('[data-streamdown="code-block"]')).toBe(
        code,
      );
      expect(f.container.querySelector("p")).toBe(paragraph);
      expect(paragraph.firstChild).toBe(node);
      expect(selection?.toString()).toBe("selected");
      expect(mutations).toHaveLength(0);
      expect(f.container.textContent).toContain("END_CONTINUOUS");
      expect(f.container.querySelector("[data-reading-segment]")).toBeNull();
      expect(f.container.querySelector("[data-reading-segment]")).toBeNull();
      await f.render(prefix + tail + "\n\nEND_CONTINUOUS", false);
      expect(f.container.querySelector("p")).toBe(paragraph);
      expect(f.container.querySelectorAll("th, td").length).toBe(4);
    } finally {
      observer?.disconnect();
      await f.dispose();
    }
  },
);

it("renders a long answer's first and last blocks together, preserving tables and fenced code", async () => {
  const f = fixture();
  const text =
    "# First heading\n\n" +
    Array.from(
      { length: 180 },
      (_, i) => `Received paragraph ${i} 中文😀.\n\n`,
    ).join("") +
    "| Name | Value |\n| --- | --- |\n| final | cell |\n\n```text\nLAST_CODE_LINE\n```\n\nLAST_PARAGRAPH";
  try {
    await f.render(text, false);
    expect(f.container.querySelector("h1")?.textContent).toBe("First heading");
    expect(f.container.querySelectorAll("p")).toHaveLength(181);
    expect(f.container.querySelector("table")?.textContent).toContain("final");
    expect(f.container.querySelector("pre")?.textContent).toBe(
      "LAST_CODE_LINE",
    );
    expect(f.container.textContent).toContain("LAST_PARAGRAPH");
    expect(f.container.querySelector("[data-reading-segment]")).toBeNull();
  } finally {
    await f.dispose();
  }
});

it("shows the full raw output without page controls or an inner vertical scrolling region", async () => {
  const f = fixture();
  const text =
    "RAW_START\n" + "native output 中文😀\n".repeat(2000) + "RAW_END";
  try {
    await f.render(text, false, true);
    expect(f.container.querySelector("pre")?.textContent?.length).toBe(
      text.length,
    );
    expect(f.container.querySelector("pre")?.textContent).toBe(text);
    expect(f.container.querySelector("[data-reading-segment]")).toBeNull();
    expect(f.container.querySelector("pre")?.hasAttribute("tabindex")).toBe(
      false,
    );
  } finally {
    await f.dispose();
  }
});

it.each(["tool", "subagent"] as const)(
  "copies the full available %s output while rendering it continuously and preserving truncation notices",
  async (kind) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const text = "native output 中文😀\n".repeat(2000) + "END_OUTPUT";
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const model = new ConversationModel({
      connect: (_thread, listener) => {
        listener({
          kind: "snapshot",
          connectionGeneration: "host",
          seq: 0,
          gap: false,
          items: [
            {
              id: 1,
              text,
              role: "tool",
              state: "complete",
              truncated: true,
              label: { kind: "literal", text: "OMP" },
              ...(kind === "subagent"
                ? {
                    subagent: {
                      nativeId: "child",
                      task: "fixture task",
                      description: "fixture child",
                      currentTool: "",
                      model: "fixture",
                      coverage: "partial" as const,
                      status: "completed" as const,
                      resultSource: "transcript" as const,
                      reason: "truncated" as const,
                    },
                  }
                : {}),
            },
          ],
        });
        return () => {};
      },
    });
    const positions = new ReadingPositions();
    model.connect("thread");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() =>
        root.render(
          createElement(I18nProvider, {
            initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
            children: createElement(Conversation, { model, positions }),
          }),
        ),
      );
      expect(
        container.querySelector("[data-reading-text]")?.textContent?.length,
      ).toBe(text.length);
      expect(container.querySelector("[data-reading-text]")?.textContent).toBe(
        text,
      );
      const button = [...container.querySelectorAll("button")].find((node) =>
        node.getAttribute("aria-label")?.startsWith("Copy"),
      );
      if (!button) throw Error("missing copy");
      await act(() => button.click());
      expect(copy).toHaveBeenCalledWith(text);
      expect(container.textContent).toContain("Showing part");
      expect(positions.stateStore.getState().bodies.size).toBe(0);
    } finally {
      await act(() => root.unmount());
      model.dispose();
      positions.dispose();
      container.remove();
      copy.mockRestore();
      vi.unstubAllGlobals();
    }
  },
);

it("expands long fenced code and tables into the same continuous reading surface", async () => {
  const f = fixture();
  const code = Array.from(
    { length: 150 },
    (_, i) => `const value${i} = ${i};`,
  ).join("\n");
  const rows = Array.from({ length: 150 }, (_, i) => `| row${i} | ${i} |`).join(
    "\n",
  );
  try {
    await f.render(
      "```js\n" + code + "\n```\n\n| Name | Value |\n| --- | --- |\n" + rows,
      false,
    );
    expect(
      [...f.container.querySelectorAll("pre > code > span")]
        .map((line) => line.textContent)
        .join("\n"),
    ).toBe(code);
    expect(f.container.querySelectorAll("tbody tr")).toHaveLength(150);
    const codeBody = f.container.querySelector<HTMLElement>(
      '[data-streamdown="code-block-body"]',
    );
    const tableBody = f.container.querySelector("table")?.parentElement;
    expect(codeBody).not.toBeNull();
    expect(codeBody?.style.maxHeight).toBe("");
    expect(tableBody?.style.maxHeight).toBe("");
    expect(f.container.querySelector("[data-reading-segment]")).toBeNull();
  } finally {
    await f.dispose();
  }
});
