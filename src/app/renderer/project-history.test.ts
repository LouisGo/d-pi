// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { HistoryBridge } from "../../modules/conversation/contracts/public";
import { I18nProvider } from "../../modules/preferences/renderer/public";
import { History } from "./conversation";

it("opens the project's CLI history directly when the history tab is selected, without executing OMP", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const key = "a".repeat(64);
  const bridge: HistoryBridge = {
    read: vi.fn<HistoryBridge["read"]>(async () => ({
      kind: "unavailable",
      reason: "missing",
    })),
    projectList: vi.fn<HistoryBridge["projectList"]>(async () => ({
      kind: "catalog",
      sessions: [{ key, sessionId: "cli", title: "CLI hello", modifiedAt: 1 }],
      partial: false,
    })),
    projectRead: vi.fn<HistoryBridge["projectRead"]>(async () => ({
      kind: "page",
      entries: [{ id: "one", parentId: null, role: "user", text: "hello" }],
      next: null,
      source: "fixture",
      coverage: "append-order",
      incompleteTail: false,
      omitted: 0,
    })),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(I18nProvider, {
            initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
            children: createElement(History, {
              bridge,
              threadId: "thread",
              active: true,
            }),
          }),
        ),
      );
    });
    for (let i = 0; i < 4; i++)
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(bridge.projectRead).toHaveBeenCalledWith("thread", key, null);
    expect(container.querySelector("article")?.textContent).toContain("hello");
    expect(bridge.read).not.toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
  }
});
