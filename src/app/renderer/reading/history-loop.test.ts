// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { HistoryBridge } from "../../../modules/conversation/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { History } from "./history";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
});
async function mount(bridge: HistoryBridge, onReturnLive = vi.fn()) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(() => root.unmount());
    client.clear();
    container.remove();
  });
  await act(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(History, {
            bridge,
            threadId: "thread",
            active: true,
            onReturnLive,
          }),
        }),
      ),
    ),
  );
  return { container, onReturnLive };
}
const emptyBridge = (): HistoryBridge => ({
  projectList: async () => ({ kind: "catalog", sessions: [], partial: false }),
  projectRead: async () => ({ kind: "unavailable", reason: "missing" }),
  read: vi.fn<HistoryBridge["read"]>(async () => ({
    kind: "unavailable",
    reason: "missing",
  })),
});
const settle = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 10)));

it("explains the read-only saved order and refresh scope, and returns to live without reading or binding", async () => {
  const bridge = emptyBridge();
  const { container, onReturnLive } = await mount(bridge);
  await settle();
  expect(container.textContent).toContain(
    "Native history is read-only and paged in saved order",
  );
  expect(container.textContent).toContain(
    "Refresh reads this source again from its first page",
  );
  expect(container.textContent).toContain(
    "The bound session history has not been read yet",
  );
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Return to live reading",
  );
  expect(button).toBeDefined();
  await act(() => button?.click());
  expect(onReturnLive).toHaveBeenCalledOnce();
  expect(bridge.read).not.toHaveBeenCalled();
});

it("keeps discovery access denial distinct from an empty history and preserves the bound-read fallback", async () => {
  const bridge = emptyBridge();
  bridge.projectList = async () => ({ kind: "unavailable", reason: "denied" });
  const { container } = await mount(bridge);
  await vi.waitFor(async () => {
    await settle();
    expect(container.textContent).toContain("access was denied");
  });
  expect(container.textContent).not.toContain(
    "No complete text messages to display",
  );
  const read = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Read native records",
  );
  expect(read?.disabled).toBe(false);
  expect(bridge.read).not.toHaveBeenCalled();
});

it.each([
  ["missing", "records are missing"],
  ["denied", "access was denied"],
  ["changed", "records changed"],
] as const)(
  "shows a native %s page as unavailable rather than empty",
  async (reason, message) => {
    const bridge = emptyBridge();
    bridge.projectList = async () => ({
      kind: "catalog",
      partial: true,
      sessions: [
        {
          key: "a".repeat(64),
          title: "Chosen saved session",
          sessionId: "native",
          modifiedAt: 1,
        },
      ],
    });
    bridge.projectRead = async () => ({ kind: "unavailable", reason });
    const { container } = await mount(bridge);
    await vi.waitFor(async () => {
      await settle();
      expect(container.textContent).toContain(message);
    });
    expect(container.textContent).not.toContain(
      "No complete text messages to display",
    );
    expect(container.querySelector("article")).toBeNull();
  },
);

it("shows a truly empty native page separately from an unread bound source", async () => {
  const bridge = emptyBridge();
  bridge.projectList = async () => ({
    kind: "catalog",
    partial: false,
    sessions: [
      {
        key: "a".repeat(64),
        title: "Empty saved session",
        sessionId: "native",
        modifiedAt: 1,
      },
    ],
  });
  bridge.projectRead = async () => ({
    kind: "page",
    source: "empty-version",
    entries: [],
    next: null,
    coverage: "append-order",
    omitted: 0,
    incompleteTail: false,
  });
  const { container } = await mount(bridge);
  await vi.waitFor(async () => {
    await settle();
    expect(container.textContent).toContain(
      "No complete text messages to display",
    );
  });
  expect(container.textContent).not.toContain("not been read yet");
  expect(container.textContent).not.toContain("temporarily unavailable");
});
