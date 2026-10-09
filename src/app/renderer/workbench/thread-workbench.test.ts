// @vitest-environment happy-dom
import { act, type ComponentProps, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import {
  ConversationModel,
  ReadingPositions,
} from "../../../modules/conversation/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ThreadIdSchema } from "../../../shared/identity";
import type { AttentionEntry } from "../../contracts/attention";
import { ThreadWorkbench } from "./thread-workbench";

const trace = "test-trace";
vi.mock("./composer", () => ({
  Composer: () => createElement("div", { "data-composer": true }),
}));
vi.mock("./file-panel", () => ({ FilePanel: () => null }));
vi.mock("../reading/submissions", () => ({
  Submissions: () =>
    createElement(
      "section",
      null,
      createElement(
        "details",
        null,
        createElement(
          "article",
          { "data-attention-receipt-trace": "test-trace", tabIndex: -1 },
          "failure",
        ),
      ),
    ),
}));
vi.mock("../reading/saved-conversation", async () => ({
  SavedConversation: (await import("../reading/conversation")).Conversation,
}));
vi.mock("../reading/history", () => ({
  History: ({ onReturnLive }: { onReturnLive?: () => void }) =>
    createElement("button", { onClick: onReturnLive }, "Back to Thread"),
}));
vi.mock("../reading/markdown", () => ({
  Markdown: ({ text }: { text: string }) => createElement("p", null, text),
}));

function setup(target: boolean) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
    () => [new DOMRect(0, 0, 400, 200)] as unknown as DOMRectList,
  );
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(
    function (this: HTMLElement) {
      const pane = this.closest<HTMLElement>(".reading-pane");
      if (pane) pane.scrollTop = 600;
    },
  );
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const entry: AttentionEntry = {
    threadId,
    eventId: crypto.randomUUID(),
    traceId: trace,
    kind: "failed",
    unread: true,
  };
  const locationStore = createStore(() => ({ target: target ? entry : null }));
  const positions = new ReadingPositions();
  const reading = new ConversationModel({
    connect: (_thread, listener) => {
      listener({
        kind: "snapshot",
        connectionGeneration: "host",
        seq: 0,
        gap: true,
        items: [
          {
            id: 1,
            text: "retained",
            role: "assistant",
            state: "complete",
            label: { kind: "literal", text: "OMP" },
          },
        ],
      });
      return () => {};
    },
  });
  reading.connect(threadId);
  const props = {
    model: { attention: { locationStore }, history: {} },
    editor: {},
    threadSelection: {
      kind: "thread",
      directoryAvailable: true,
      thread: {
        context: { threadId, directory: "/fixture/project" },
        reading,
        readingSources: positions,
        readingPositions: new Map([["submissions", 50]]),
        submission: {},
      },
    },
    readingView: "submissions",
    onReadingViewChange: vi.fn(),
  } as unknown as ComponentProps<typeof ThreadWorkbench>;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = () =>
    act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ThreadWorkbench, props),
        }),
      ),
    );
  const flush = () =>
    act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(0);
    });
  const cleanup = async () => {
    await act(() => root.unmount());
    reading.dispose();
    positions.dispose();
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  };
  return { host, props, render, flush, cleanup };
}

it("keeps an explicitly located failure receipt after its disclosure schedules content restoration", async () => {
  const f = setup(true);
  try {
    await f.render();
    const pane = f.host.querySelector<HTMLElement>(
      ".reading-pane:not([hidden])",
    );
    if (!pane) throw Error("missing pane");
    Object.defineProperties(pane, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 1000 },
    });
    await f.flush();
    expect(pane.scrollTop).toBe(600);
    await f.flush();
    expect(pane.scrollTop).toBe(600);
  } finally {
    await f.cleanup();
  }
});

it("lets a newer outer reading gesture cancel a queued attention location before it can move focus or scroll", async () => {
  const f = setup(true);
  try {
    await f.render();
    const pane = f.host.querySelector<HTMLElement>(
      ".reading-pane:not([hidden])",
    );
    if (!pane) throw Error("missing pane");
    Object.defineProperties(pane, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 1000 },
    });
    pane.dispatchEvent(new WheelEvent("wheel", { deltaY: 40, bubbles: true }));
    pane.scrollTop = 200;
    await act(() => pane.dispatchEvent(new Event("scroll")));
    await f.flush();
    expect(pane.scrollTop).toBe(200);
    expect(
      document.activeElement?.getAttribute("data-attention-receipt-trace"),
    ).not.toBe(trace);
  } finally {
    await f.cleanup();
  }
});

it("opens the existing Thread tools at native history from a live coverage gap and returns to the same live pane", async () => {
  const f = setup(false);
  f.props.readingView = "conversation";
  try {
    await f.render();
    const gapEntry = [...f.host.querySelectorAll("button")].find(
      (button) => button.textContent === "Thread details",
    );
    expect(gapEntry).toBeDefined();
    await act(() => gapEntry?.click());
    await f.flush();
    const history = [
      ...document.querySelectorAll<HTMLButtonElement>("[role=dialog] button"),
    ].find((button) => button.textContent === "History");
    expect(history).toBeDefined();
    await act(() => history?.click());
    expect(f.props.onReadingViewChange).toHaveBeenLastCalledWith("history");
    f.props.readingView = "history";
    await f.render();
    const returnLive = [...f.host.querySelectorAll("button")].find(
      (button) => button.textContent === "Back to Thread",
    );
    await act(() => returnLive?.click());
    expect(f.props.onReadingViewChange).toHaveBeenLastCalledWith(
      "conversation",
    );
  } finally {
    await f.cleanup();
  }
});
