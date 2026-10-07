// @vitest-environment happy-dom
import { code } from "@streamdown/code";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Streamdown } from "streamdown";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { Markdown } from "./markdown";

const staticPlugins = { code };

function mountMarkdown(staticReference = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return {
    container,
    render: (text: string, streaming: boolean) =>
      act(async () =>
        root.render(
          createElement(I18nProvider, {
            initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
            children: staticReference
              ? createElement(Streamdown, {
                  mode: "static",
                  controls: false,
                  plugins: staticPlugins,
                  linkSafety: { enabled: false },
                  children: text,
                })
              : createElement(Markdown, { text, streaming }),
          }),
        ),
      ),
    dispose: async () => {
      window.getSelection()?.removeAllRanges();
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      await act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}

async function waitForHighlightedCode(container: HTMLElement) {
  await act(async () => {
    await vi.waitFor(() => {
      const tokens = container.querySelectorAll<HTMLElement>(
        '[data-streamdown="code-block-body"] span[style]',
      );
      expect(
        [...tokens].some((token) => {
          const color = token.style.getPropertyValue("--sdm-c");
          return color && color !== "inherit";
        }),
      ).toBe(true);
    });
  });
}

it("preserves completed Markdown prefix nodes, selection and nested code position when the same message finishes", async () => {
  const fixture = mountMarkdown();
  const text =
    "Stable selected prefix.\n\n```js\n" +
    "const line = 'code';\n".repeat(35) +
    "```\n\nFinal tail.";
  try {
    await fixture.render(text, true);
    // Real Streamdown and its lazy code plugin; no Markdown/component mock.
    await waitForHighlightedCode(fixture.container);
    const paragraph = fixture.container.querySelector("p");
    const node = paragraph?.firstChild;
    const code = fixture.container.querySelector<HTMLElement>(
      '[data-streamdown="code-block-body"]',
    );
    if (!paragraph || !node || !code)
      throw Error("missing rendered prefix or code");
    const range = document.createRange();
    range.setStart(node, 7);
    range.setEnd(node, 15);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    code.scrollTop = 71;
    await fixture.render(text, false);
    expect(fixture.container.querySelector("p")).toBe(paragraph);
    expect(paragraph.firstChild).toBe(node);
    expect(range.startContainer).toBe(node);
    expect(selection?.toString()).toBe("selected");
    expect(selection?.anchorNode).toBe(node);
    expect(
      fixture.container.querySelector('[data-streamdown="code-block-body"]'),
    ).toBe(code);
    expect(code.scrollTop).toBe(71);
    expect(fixture.container.textContent).toContain("Final tail.");
  } finally {
    await fixture.dispose();
  }
});

it.each([
  {
    name: "global reference definitions",
    text: "Reference [guide][reading].\n\nSeparate paragraph.\n\n[reading]: https://example.com/guide\n",
    actualSelector: 'span[title="https://example.com/guide"]',
    referenceSelector: 'a[href="https://example.com/guide"]',
    directText: true,
    expected: ["guide"],
  },
  {
    name: "global footnote definitions",
    text: "Statement.[^note]\n\nOther paragraph.\n\n[^note]: Supporting text.\n",
    actualSelector: "[data-footnotes] li p",
    referenceSelector: "[data-footnotes] li p",
    directText: true,
    expected: ["Supporting text."],
  },
  {
    name: "tables, escaped separators and final cells",
    text: "| First | Second |\n| --- | --- |\n| a\\|b | **final cell** |\n",
    actualSelector: "th, td",
    referenceSelector: "th, td",
    directText: false,
    expected: ["First", "Second", "a|b", "final cell"],
  },
  {
    name: "closed fences and an unfinished interrupted inline delimiter",
    text: "```text\nreceived code\n```\n\nReceived **unfinished text",
    actualSelector: "pre, p",
    referenceSelector: "pre, p",
    directText: false,
    expected: ["received code", "Received **unfinished text"],
  },
])(
  "matches real static parsing for final $name",
  async ({ text, actualSelector, referenceSelector, directText, expected }) => {
    const fixture = mountMarkdown();
    const reference = mountMarkdown(true);
    const values = (container: HTMLElement, selector: string) =>
      [...container.querySelectorAll(selector)].map((node) =>
        directText
          ? [...node.childNodes]
              .filter((child) => child.nodeType === Node.TEXT_NODE)
              .map((child) => child.textContent)
              .join("")
              .trim()
          : node.textContent,
      );
    try {
      await reference.render(text, false);
      await fixture.render(text, true);
      await fixture.render(text, false);
      expect(values(reference.container, referenceSelector)).toEqual(expected);
      expect(values(fixture.container, actualSelector)).toEqual(expected);
    } finally {
      await fixture.dispose();
      await reference.dispose();
    }
  },
);

it("resolves a reference link whose definition arrives with final text without losing the final tail", async () => {
  const fixture = mountMarkdown();
  const prefix = "Reference [guide][reading].\n\nA separate paragraph.\n\n";
  try {
    await fixture.render(prefix, true);
    expect(fixture.container.textContent).toContain("[guide][reading]");
    await fixture.render(
      prefix + "[reading]: https://example.com/guide\n\nFinal tail.",
      false,
    );
    const link = fixture.container.querySelector(
      'span[title="https://example.com/guide"]',
    );
    expect(link?.textContent).toContain("guide");
    expect(fixture.container.textContent).not.toContain("[guide][reading]");
    expect(fixture.container.textContent).toContain("Final tail.");
    expect(fixture.container.querySelector("a")).toBeNull();
  } finally {
    await fixture.dispose();
  }
});

it("resolves an escaped closing bracket in a late reference definition", async () => {
  const fixture = mountMarkdown();
  const prefix = "Reference [guide][read\\]ing].\n\nSeparate paragraph.\n\n";
  try {
    await fixture.render(prefix, true);
    await fixture.render(
      prefix + "[read\\]ing]: https://example.com/escaped",
      false,
    );
    expect(
      fixture.container.querySelector(
        'span[title="https://example.com/escaped"]',
      )?.textContent,
    ).toContain("guide");
  } finally {
    await fixture.dispose();
  }
});

it("closes a streamed fence and renders the complete final text outside that fence", async () => {
  const fixture = mountMarkdown();
  const prefix = "Stable prefix.\n\n```js\nconst received = 'code';\n";
  try {
    await fixture.render(prefix, true);
    await waitForHighlightedCode(fixture.container);
    const paragraph = fixture.container.querySelector("p");
    expect(
      fixture.container
        .querySelector('[data-streamdown="code-block"]')
        ?.hasAttribute("data-incomplete"),
    ).toBe(true);
    await fixture.render(prefix + "```\n\n**Final message_end tail.**", false);
    expect(fixture.container.querySelector("p")).toBe(paragraph);
    expect(
      fixture.container
        .querySelector('[data-streamdown="code-block"]')
        ?.hasAttribute("data-incomplete"),
    ).toBe(false);
    expect(fixture.container.querySelector("pre")?.textContent).toBe(
      "const received = 'code';",
    );
    expect(
      fixture.container.querySelector('[data-streamdown="strong"]')
        ?.textContent,
    ).toBe("Final message_end tail.");
  } finally {
    await fixture.dispose();
  }
});

it("supports late footnote definitions in their whole-document parse scope", async () => {
  const fixture = mountMarkdown();
  const prefix = "Statement with a footnote.[^note]\n\nAnother paragraph.\n\n";
  try {
    await fixture.render(prefix, true);
    expect(fixture.container.querySelector("sup")).toBeNull();
    await fixture.render(
      prefix + "[^note]: Supporting text.\n\nFinal tail.",
      false,
    );
    expect(fixture.container.querySelector("sup")?.textContent).toContain("1");
    expect(
      fixture.container.querySelector("[data-footnotes]")?.textContent,
    ).toContain("Supporting text.");
    expect(fixture.container.textContent).not.toContain("[^note]");
    expect(fixture.container.textContent).toContain("Final tail.");
  } finally {
    await fixture.dispose();
  }
});

it("shows interrupted received text without keeping a synthesized closing delimiter", async () => {
  const fixture = mountMarkdown();
  try {
    await fixture.render("Received **unfinished text", true);
    expect(
      fixture.container.querySelector('[data-streamdown="strong"]')
        ?.textContent,
    ).toBe("unfinished text");
    await fixture.render("Received **unfinished text", false);
    expect(
      fixture.container.querySelector('[data-streamdown="strong"]'),
    ).toBeNull();
    expect(fixture.container.querySelector("p")?.textContent).toBe(
      "Received **unfinished text",
    );
  } finally {
    await fixture.dispose();
  }
});
