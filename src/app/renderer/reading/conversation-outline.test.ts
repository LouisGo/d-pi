// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ConversationOutline } from "./conversation-outline";

it("positions a stable turn through the reading owner and ignores streamed body mutations", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    frames.set(++sequence, fn);
    return sequence;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const fn of pending) fn(0);
  };
  const pane = document.createElement("div");
  pane.innerHTML =
    '<section><article data-conversation-turn="one" data-turn-preview="First question"></article><article data-message-role="assistant"><p>Answer</p></article><article data-conversation-turn="two" data-turn-preview="Second question"></article></section>';
  pane.getBoundingClientRect = () => new DOMRect(0, 0, 600, 200);
  Object.defineProperties(pane, {
    clientHeight: { value: 200 },
    scrollHeight: { value: 1600 },
  });
  const rows = [
    ...pane.querySelectorAll<HTMLElement>("[data-conversation-turn]"),
  ];
  rows.forEach((row, index) => {
    row.getBoundingClientRect = () =>
      new DOMRect(0, index * 600 - pane.scrollTop, 500, 60);
  });
  const query = vi.spyOn(pane, "querySelectorAll");
  const position = vi.fn((action: () => boolean) => action());
  const container = document.createElement("div");
  document.body.append(pane, container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ConversationOutline, {
            pane,
            anchor: { position },
          }),
        }),
      ),
    );
    await act(flush);
    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ];
    expect(buttons).toHaveLength(2);
    await act(() => buttons[1]?.click());
    expect(position).toHaveBeenCalledOnce();
    expect(pane.scrollTop).toBe(600);
    expect(buttons[1]?.getAttribute("aria-current")).toBe("step");
    const before = query.mock.calls.length;
    await act(async () => {
      pane
        .querySelector("p")
        ?.append(document.createTextNode(" streamed tail"));
      await new Promise((r) => setTimeout(r, 0));
      flush();
    });
    expect(query.mock.calls.length).toBe(before);
    await act(() =>
      buttons[1]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
      ),
    );
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () => {
      rows[0]?.remove();
      await new Promise((r) => setTimeout(r, 0));
      flush();
    });
    expect(container.querySelector("nav")).toBeNull();
  } finally {
    await act(() => root.unmount());
    pane.remove();
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("previews the single-line question with # prefix and 3-line reply description without navigating", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const pane = document.createElement("div");
  pane.innerHTML =
    '<article data-conversation-turn="one" data-turn-preview="Short summary"><div class="user-message-bubble" data-reading-text></div></article><article data-message-role="assistant"><div data-reading-text data-assistant-reply>Private reply</div></article><article data-conversation-turn="two" data-turn-preview="Second question"></article>';
  const question = `First line\n\n${"Long question content. ".repeat(35)}\nLast line beyond the summary`;
  const body = pane.querySelector("[data-reading-text]");
  if (body) body.textContent = question;
  const read = vi.spyOn(body as HTMLElement, "textContent", "get");
  const position = vi.fn();
  const container = document.createElement("div");
  document.body.append(pane, container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ConversationOutline, {
            pane,
            anchor: { position },
          }),
        }),
      ),
    );
    // The outline indexes identities without reading full transcript text.
    expect(read).not.toHaveBeenCalled();
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    const button = buttons[0];

    // Rhythmic dock test: initial idle state (inactive: 7px, active: 12px)
    expect(button?.style.getPropertyValue("--turn-width")).toBe("7px");
    expect(buttons[1]?.style.getPropertyValue("--turn-width")).toBe("12px");

    await act(async () => {
      button?.focus();
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 180);
      await promise;
    });

    // Focal point on button 0: button 0 expands to 32px, button 1 to 22px
    expect(button?.style.getPropertyValue("--turn-width")).toBe("32px");
    expect(buttons[1]?.style.getPropertyValue("--turn-width")).toBe("22px");
    const preview = document.querySelector('[data-slot="hover-card"]');
    expect(preview?.getAttribute("role")).toBe("region");
    expect(preview?.querySelector(".turn-preview-number")?.textContent).toBe(
      "#1",
    );
    expect(preview?.querySelector(".turn-preview-heading")).toBeNull();
    expect(preview?.querySelector(".turn-preview-title")?.textContent).toBe(
      question.trim().replace(/\s+/g, " "),
    );
    expect(
      preview?.querySelector(".turn-preview-description")?.textContent,
    ).toBe("Private reply");
    expect(read).toHaveBeenCalled();
    expect(position).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    await act(async () => {
      button?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      const { promise: closed, resolve: resolveClosed } =
        Promise.withResolvers<void>();
      setTimeout(resolveClosed, 0);
      await closed;
    });
    expect(document.activeElement).toBe(button);

    // Keyboard activation retains focus for the next arrow-key navigation.
    await act(async () => {
      button?.click();
    });
    expect(position).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(button);

    // Pointer leave does not discard the keyboard focal point.
    const nav = container.querySelector("nav");
    await act(async () => {
      nav?.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    });
    expect(button?.style.getPropertyValue("--turn-width")).toBe("32px");
    expect(buttons[1]?.style.getPropertyValue("--turn-width")).toBe("22px");
  } finally {
    await act(() => root.unmount());
    pane.remove();
    container.remove();
    vi.unstubAllGlobals();
  }
});
it("reuses a single shared preview popup during rapid switching between anchors without overlapping", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const pane = document.createElement("div");
  pane.innerHTML =
    '<article data-conversation-turn="one" data-turn-preview="First question"><div class="user-message-bubble" data-reading-text>First full question</div></article><article data-message-role="assistant"><details open><div data-reading-text>Internal reasoning</div></details><div data-reading-text data-assistant-reply>Reply 1</div></article><article data-conversation-turn="two" data-turn-preview="Second question"><div class="user-message-bubble" data-reading-text>Second full question</div></article><article data-message-role="assistant"><div data-reading-text data-assistant-reply>Reply 2</div></article>';
  const container = document.createElement("div");
  document.body.append(pane, container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ConversationOutline, {
            pane,
            anchor: { position: vi.fn() },
          }),
        }),
      ),
    );
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");

    // Focus button 0 -> opens popup for turn 1
    await act(async () => {
      buttons[0]?.focus();
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 180);
      await promise;
    });

    let popups = document.querySelectorAll('[data-slot="hover-card"]');
    expect(popups).toHaveLength(1);
    expect(popups[0]?.querySelector(".turn-preview-number")?.textContent).toBe(
      "#1",
    );
    expect(
      popups[0]?.querySelector(".turn-preview-description")?.textContent,
    ).toBe("Reply 1");
    await act(async () => {
      const reply = pane.querySelector("[data-assistant-reply]");
      if (reply) reply.textContent = "Final reply 1";
      await new Promise((resolve) => setTimeout(resolve, 180));
    });
    expect(
      popups[0]?.querySelector(".turn-preview-description")?.textContent,
    ).toBe("Final reply 1");

    // Rapidly switch focus to button 1
    await act(async () => {
      buttons[1]?.focus();
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 180);
      await promise;
    });

    // Exactly 1 popup remains in the DOM: zero overlap
    popups = document.querySelectorAll('[data-slot="hover-card"]');
    expect(popups).toHaveLength(1);
    expect(popups[0]?.querySelector(".turn-preview-number")?.textContent).toBe(
      "#2",
    );
  } finally {
    await act(() => root.unmount());
    pane.remove();
    container.remove();
    vi.unstubAllGlobals();
  }
});
