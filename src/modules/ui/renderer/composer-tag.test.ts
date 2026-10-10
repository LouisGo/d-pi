// @vitest-environment happy-dom
import { DOMSerializer } from "@tiptap/pm/model";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  ComposerTag,
  ComposerTagTooltips,
  composerTagLabel,
  composerTagMarkup,
} from "./composer-tag";

it("keeps the beginning and ending of long labels without splitting graphemes", () => {
  const label = "d-pi-developer-e2e-20261010-report.md";
  expect(composerTagLabel(label)).toEqual({
    start: "d-pi-developer-e2e-20",
    end: "1010-report.md",
    truncated: true,
  });
  expect(composerTagLabel("notes.txt")).toEqual({
    start: "notes.txt",
    end: "",
    truncated: false,
  });
  const emoji = "👨‍👩‍👧‍👦".repeat(40);
  const result = composerTagLabel(emoji);
  expect(result.start).toBe("👨‍👩‍👧‍👦".repeat(21));
  expect(result.end).toBe("👨‍👩‍👧‍👦".repeat(14));
});

it("uses the same label, detail and spaces for a DOM editor tag and a React action tag", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const label = "d-pi-developer-e2e-20261010-report.md";
  const props = { label, detail: "13 KB" };
  const dom = DOMSerializer.renderSpec(document, composerTagMarkup(props))
    .dom as HTMLElement;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => root.render(createElement(ComposerTag, props)));
    expect(container.textContent).toBe(dom.textContent);
    expect(container.textContent?.startsWith(" ")).toBe(true);
    expect(container.textContent?.endsWith(" ")).toBe(true);
    expect(
      dom
        .querySelector(".composer-context-token")
        ?.getAttribute("data-composer-tag-tooltip"),
    ).toBe(`${label}\n13 KB`);
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      `${label} · 13 KB`,
    );
    expect(container.querySelector("[title]")).toBeNull();
    expect(dom.querySelector("[title]")).toBeNull();
  } finally {
    await act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("shows the complete editor tag in a shared Tooltip and closes it without moving editor focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const editor = document.createElement("div");
  editor.tabIndex = 0;
  const label = "a-very-long-context-label-that-keeps-its-ending.md";
  editor.append(
    DOMSerializer.renderSpec(
      document,
      composerTagMarkup({ label, detail: "13 KB" }),
    ).dom,
  );
  document.body.append(editor, container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(createElement(ComposerTagTooltips, { container: editor })),
    );
    await act(() => editor.focus());
    const tag = editor.querySelector("[data-composer-tag-tooltip]")!;
    await act(() =>
      tag.dispatchEvent(
        new PointerEvent("pointerover", {
          bubbles: true,
          pointerType: "mouse",
        }),
      ),
    );
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 180)));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
      `${label}\n13 KB`,
    );
    expect(document.activeElement).toBe(editor);
    expect(tag.getAttribute("aria-describedby")).toBe(
      document.querySelector('[role="tooltip"]')?.id,
    );
    await act(() =>
      tag.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerType: "mouse",
        }),
      ),
    );
    expect(document.querySelector('[role="tooltip"][data-open]')).toBeNull();
    await act(async () => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
      editor
        .querySelector(".composer-tag")!
        .classList.add("ProseMirror-selectednode");
      await Promise.resolve();
    });
    expect(
      document.querySelector('[role="tooltip"][data-open]')?.textContent,
    ).toBe(`${label}\n13 KB`);
    await act(async () => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(document.querySelector('[role="tooltip"][data-open]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    container.remove();
    editor.remove();
    vi.unstubAllGlobals();
  }
});
