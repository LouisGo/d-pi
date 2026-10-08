// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type {
  ConversationEvent,
  HistoryBridge,
} from "../../../modules/conversation/contracts/public";
import { ConversationModel } from "../../../modules/conversation/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { SavedConversation } from "./saved-conversation";

vi.mock("./markdown", () => ({
  Markdown: ({ text }: { text: string }) => createElement("p", null, text),
}));
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
});
async function mount(active = true) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let emit: ((event: ConversationEvent) => void) | undefined;
  const model = new ConversationModel({
    connect: (_id, listener) => {
      emit = listener;
      return () => {};
    },
  });
  model.connect("A");
  const bridge: HistoryBridge = {
    projectList: vi.fn(),
    projectRead: vi.fn(),
    read: vi.fn(async (_id, cursor) => ({
      kind: "page",
      entries: [
        {
          id: cursor ? "two" : "one",
          parentId: null,
          role: "assistant",
          text: cursor ? "second saved message" : "first saved message",
        },
      ],
      source: "saved",
      coverage: "append-order",
      next: cursor ? null : { threadId: "A", source: "saved", offset: 100 },
      incompleteTail: false,
      omitted: 0,
    })),
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  cleanups.push(async () => {
    await act(() => root.unmount());
    client.clear();
    model.dispose();
    container.remove();
  });
  await act(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(SavedConversation, {
            model,
            bridge,
            threadId: "A",
            active,
          }),
        }),
      ),
    ),
  );
  return {
    container,
    bridge,
    emit: (event: ConversationEvent) => emit?.(event),
  };
}
it("opens bound native messages directly without project selection, execute or a read click", async () => {
  const f = await mount();
  await vi.waitFor(async () => {
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(f.container.textContent).toContain("first saved message");
  });
  expect(f.bridge.read).toHaveBeenCalledWith("A", null);
  expect(f.bridge.projectList).not.toHaveBeenCalled();
  expect(f.container.textContent).not.toContain("Read native records");
});
it("keeps pages adjacent in one transcript instead of replacing the previous messages", async () => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.cb(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
      unobserve() {}
    },
  );
  const f = await mount();
  await vi.waitFor(async () => {
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(f.container.textContent).toContain("second saved message");
  });
  expect(f.container.textContent).toContain("first saved message");
});
it("hands over to the native live branch snapshot without guessing duplicate identities", async () => {
  const f = await mount();
  await vi.waitFor(async () => {
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(f.container.textContent).toContain("first saved message");
  });
  await act(() =>
    f.emit({
      kind: "snapshot",
      connectionGeneration: "generation",
      seq: 1,
      gap: false,
      items: [
        {
          id: 1,
          role: "assistant",
          state: "complete",
          label: { kind: "literal", text: "OMP" },
          text: "first saved message",
        },
      ],
    }),
  );
  expect(f.container.querySelectorAll("[data-reading-text]")).toHaveLength(1);
  expect(f.container.textContent).toContain("first saved message");
});
it("does not start a history read from a hidden inactive pane", async () => {
  const f = await mount(false);
  await act(() => new Promise((r) => setTimeout(r, 10)));
  expect(f.bridge.read).not.toHaveBeenCalled();
});
