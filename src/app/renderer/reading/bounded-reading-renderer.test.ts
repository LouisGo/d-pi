// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ConversationModel } from "../../../modules/conversation/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { Conversation } from "./conversation";
import { ReadingBody } from "./reading-body";

const parsed = vi.hoisted(() => ({ texts: [] as string[] }));
vi.mock("./markdown", () => ({
  Markdown: ({ text }: { text: string }) => {
    parsed.texts.push(text);
    return createElement("p", { "data-markdown": true }, text);
  },
}));

it("uses bounded original-text segments for giant messages while retaining Markdown for short messages", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  parsed.texts = [];
  const text = "中".repeat(30000);
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
            role: "assistant",
            state: "streaming",
            label: { kind: "literal", text: "OMP" },
          },
          {
            id: 2,
            text: "**short**",
            role: "assistant",
            state: "complete",
            label: { kind: "literal", text: "OMP" },
          },
        ],
      });
      return () => {};
    },
  });
  model.connect("thread");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(Conversation, { model }),
        }),
      ),
    );
    expect(parsed.texts).toEqual(["**short**"]);
    expect(container.querySelector("[data-reading-text]")?.textContent).toBe(
      "中".repeat(8192),
    );
    expect(container.textContent).toContain("Original text in segments");
  } finally {
    await act(() => root.unmount());
    model.dispose();
    container.remove();
    vi.unstubAllGlobals();
  }
});

it.each(["tool", "subagent"] as const)(
  "bounds %s output and copies the complete available projection",
  async (kind) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const text = "native output ".repeat(3000);
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
    model.connect("thread");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() =>
        root.render(
          createElement(I18nProvider, {
            initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
            children: createElement(Conversation, { model }),
          }),
        ),
      );
      expect(
        container.querySelector("[data-reading-text]")?.textContent?.length,
      ).toBe(8192);
      const button = [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("复制"),
      );
      if (!button) throw Error("missing copy button");
      await act(() => button.click());
      expect(copy).toHaveBeenCalledWith(text);
      expect(container.textContent).toContain("截断");
    } finally {
      await act(() => root.unmount());
      model.dispose();
      container.remove();
      copy.mockRestore();
      vi.unstubAllGlobals();
    }
  },
);

it("resets segment choice when the same record number belongs to a new Host or Thread", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let generation = "host-a";
  const text = "a".repeat(8192) + "b".repeat(8192) + "c".repeat(8192);
  const model = new ConversationModel({
    connect: (_thread, listener) => {
      listener({
        kind: "snapshot",
        connectionGeneration: generation,
        seq: 0,
        gap: false,
        items: [
          {
            id: 1,
            text,
            role: "assistant",
            state: "streaming",
            label: { kind: "literal", text: "OMP" },
          },
        ],
      });
      return () => {};
    },
  });
  model.connect("first");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const next = () => {
    const button = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Next segment",
    );
    if (!button) throw Error("missing next button");
    button.click();
  };
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(Conversation, { model }),
        }),
      ),
    );
    await act(next);
    expect(
      container
        .querySelector("[data-reading-segment]")
        ?.getAttribute("data-reading-segment"),
    ).toBe("1");
    // Same Host reconnection keeps the current record's reading position.
    await act(() => model.connect("first"));
    expect(
      container
        .querySelector("[data-reading-segment]")
        ?.getAttribute("data-reading-segment"),
    ).toBe("1");
    generation = "host-b";
    await act(() => model.connect("first"));
    expect(
      container
        .querySelector("[data-reading-segment]")
        ?.getAttribute("data-reading-segment"),
    ).toBe("0");
    await act(next);
    await act(() => model.connect("second"));
    expect(
      container
        .querySelector("[data-reading-segment]")
        ?.getAttribute("data-reading-segment"),
    ).toBe("0");
  } finally {
    await act(() => root.unmount());
    model.dispose();
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("clamps a shortened record permanently so later growth cannot resurrect an old segment choice", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let text = "a".repeat(30000);
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
            role: "assistant",
            state: "streaming",
            label: { kind: "literal", text: "OMP" },
          },
        ],
      });
      return () => {};
    },
  });
  model.connect("thread");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const next = () => {
    const button = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Next segment",
    );
    if (!button) throw Error("missing next button");
    button.click();
  };
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(Conversation, { model }),
        }),
      ),
    );
    await act(next);
    await act(next);
    await act(next);
    text = "b".repeat(10000);
    await act(() => model.connect("thread"));
    expect(
      container
        .querySelector("[data-reading-segment]")
        ?.getAttribute("data-reading-segment"),
    ).toBe("1");
    text += "c".repeat(30000);
    await act(() => model.connect("thread"));
    expect(
      container
        .querySelector("[data-reading-segment]")
        ?.getAttribute("data-reading-segment"),
    ).toBe("1");
    text = "short";
    await act(() => model.connect("thread"));
    text = "d".repeat(30000);
    await act(() => model.connect("thread"));
    expect(
      container
        .querySelector("[data-reading-segment]")
        ?.getAttribute("data-reading-segment"),
    ).toBe("0");
  } finally {
    await act(() => root.unmount());
    model.dispose();
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("makes the bounded scroll region keyboard reachable with its current segment label", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
          children: createElement(ReadingBody, { text: "中".repeat(10000) }),
        }),
      ),
    );
    const region = container.querySelector<HTMLElement>("[data-reading-text]");
    expect(region?.tabIndex).toBe(0);
    expect(region?.getAttribute("aria-label")).toBe("第 1 / 2 段");
    region?.focus();
    expect(document.activeElement).toBe(region);
    expect(
      [...container.querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).toEqual(["上一段", "下一段"]);
  } finally {
    await act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("keeps a sealed segment's DOM, selected range and scroll through upstream appends, and grows the tail without turning pages", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let text = "选中原文".repeat(5000);
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
            role: "assistant",
            state: "streaming",
            label: { kind: "literal", text: "OMP" },
          },
        ],
      });
      return () => {};
    },
  });
  model.connect("thread");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let observer: MutationObserver | undefined;
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(Conversation, { model }),
        }),
      ),
    );
    const region = container.querySelector<HTMLElement>("[data-reading-text]");
    const node = region?.firstChild;
    if (!region || !node) throw Error("missing original text node");
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(node, 4);
    range.setEnd(node, 8);
    selection?.removeAllRanges();
    selection?.addRange(range);
    region.scrollTop = 61;
    const mutations: MutationRecord[] = [];
    observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(region, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    text += "追加内容😀".repeat(3000);
    await act(() => model.connect("thread"));
    expect(container.querySelector("[data-reading-text]")).toBe(region);
    expect(region.firstChild).toBe(node);
    expect(selection?.toString()).toBe("选中原文");
    expect(selection?.anchorNode).toBe(node);
    expect(region.scrollTop).toBe(61);
    expect(mutations).toHaveLength(0);
    expect(
      container
        .querySelector("[data-reading-segment]")
        ?.getAttribute("data-reading-segment"),
    ).toBe("0");
    const next = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Next segment",
    );
    if (!next) throw Error("missing next segment");
    while (!next.disabled) await act(() => next.click());
    const tailPage = container
      .querySelector("[data-reading-segment]")
      ?.getAttribute("data-reading-segment");
    const tail = container.querySelector("[data-reading-text]");
    const tailLength = tail?.textContent?.length ?? 0;
    text += "新内容";
    await act(() => model.connect("thread"));
    expect(
      container
        .querySelector("[data-reading-segment]")
        ?.getAttribute("data-reading-segment"),
    ).toBe(tailPage);
    expect(container.querySelector("[data-reading-text]")).toBe(tail);
    expect(tail?.textContent?.length).toBe(tailLength + 3);
    text += "x".repeat(9000);
    await act(() => model.connect("thread"));
    expect(
      container
        .querySelector("[data-reading-segment]")
        ?.getAttribute("data-reading-segment"),
    ).toBe(tailPage);
    expect(tail?.textContent?.length).toBeLessThanOrEqual(8192);
    expect(next.disabled).toBe(false);
  } finally {
    observer?.disconnect();
    window.getSelection()?.removeAllRanges();
    await act(() => root.unmount());
    model.dispose();
    container.remove();
    vi.unstubAllGlobals();
  }
});
