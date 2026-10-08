// @vitest-environment happy-dom

import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { HistoryBridge } from "../../../modules/conversation/contracts/public";
import {
  listProjectNativeHistory,
  readProjectNativeHistory,
} from "../../../modules/conversation/main/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { History } from "./history";

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

it("refreshes a changed CLI history from the first page and can continue reading its new version", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const directory = mkdtempSync(join(tmpdir(), "d-pi-history-refresh-"));
  const project = join(directory, "project");
  const sessions = join(directory, "sessions");
  mkdirSync(project);
  mkdirSync(join(sessions, "bucket"), { recursive: true });
  const file = join(sessions, "bucket", "cli.jsonl");
  const message = (id: string, text: string) =>
    JSON.stringify({
      type: "message",
      id,
      parentId: null,
      message: { role: "user", content: text },
    }) + "\n";
  writeFileSync(
    file,
    JSON.stringify({ type: "session", version: 3, id: "cli", cwd: project }) +
      "\n" +
      message("first", "first page") +
      (JSON.stringify({ type: "note", text: "x".repeat(16000) }) + "\n").repeat(
        80,
      ) +
      message("last", "last page"),
  );
  let refreshGate: Promise<void> | null = null;
  let releaseRefresh: () => void = () => {};
  const bridge: HistoryBridge = {
    read: vi.fn<HistoryBridge["read"]>(async () => ({
      kind: "unavailable",
      reason: "missing",
    })),
    projectList: () => listProjectNativeHistory(sessions, project),
    projectRead: vi.fn(async (threadId, key, cursor) => {
      if (!cursor && refreshGate) await refreshGate;
      return readProjectNativeHistory(sessions, project, threadId, key, cursor);
    }),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const reading = async (text: string) => {
    await vi.waitFor(async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(container.querySelector("article")?.textContent).toContain(text);
    });
  };
  const click = async (text: string) => {
    const button = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === text,
    );
    if (!button) throw Error(`button missing: ${text}`);
    await vi.waitFor(async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(button.disabled).toBe(false);
    });
    await act(async () => button.click());
  };
  try {
    await act(async () =>
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
            }),
          }),
        ),
      ),
    );
    await reading("first page");
    await click("Next page");
    await reading("last page");
    appendFileSync(file, message("new", "newest message"));
    refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    await click("Refresh");
    // Query may show the cached first page while the new version is loading.
    await reading("first page");
    expect(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Next page",
      )?.disabled,
    ).toBe(true);
    await act(async () => releaseRefresh());
    await vi.waitFor(async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(
        [...container.querySelectorAll("button")].find(
          (button) => button.textContent === "Refresh",
        )?.disabled,
      ).toBe(false);
    });
    expect(bridge.projectRead).toHaveBeenLastCalledWith(
      "thread",
      expect.any(String),
      null,
    );
    await click("Next page");
    await vi.waitFor(async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(container.textContent).toContain("newest message");
    });
    expect(bridge.read).not.toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
    releaseRefresh();
    client.clear();
    container.remove();
    rmSync(directory, { recursive: true, force: true });
    vi.unstubAllGlobals();
  }
});

it("offers a bound read during discovery and announces the selected native page while it loads", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let found: (() => void) | undefined;
  let loaded: (() => void) | undefined;
  const discovery = new Promise<void>((resolve) => {
    found = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    loaded = resolve;
  });
  const key = "a".repeat(64);
  const bridge: HistoryBridge = {
    read: vi.fn<HistoryBridge["read"]>(async () => ({
      kind: "unavailable",
      reason: "missing",
    })),
    projectList: async () => {
      await discovery;
      return {
        kind: "catalog",
        sessions: [
          { key, sessionId: "cli", title: "Native session", modifiedAt: 1 },
        ],
        partial: false,
      };
    },
    projectRead: async () => {
      await reading;
      return {
        kind: "page",
        entries: [
          {
            id: "one",
            parentId: null,
            role: "assistant",
            text: "saved native text",
          },
        ],
        next: null,
        source: "fixture",
        coverage: "append-order",
        incompleteTail: false,
        omitted: 0,
      };
    },
  };
  try {
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
            }),
          }),
        ),
      ),
    );
    expect(container.textContent).toContain(
      "Discovering this project's history",
    );
    expect(
      [...container.querySelectorAll("button")].some(
        (b) => b.textContent === "Read native records" && !b.disabled,
      ),
    ).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>("[data-slot=select]")
        ?.disabled,
    ).toBe(true);
    await act(async () => found?.());
    await vi.waitFor(async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(container.textContent).toContain("Reading native records");
    });
    expect(
      container.querySelector<HTMLButtonElement>("[data-slot=select]")?.value,
    ).toBe(key);
    await act(async () => loaded?.());
    await vi.waitFor(async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(container.querySelector("article")?.textContent).toContain(
        "saved native text",
      );
      expect(
        [...container.querySelectorAll('[role="status"]')].some((e) =>
          e.textContent?.includes("Reading native records"),
        ),
      ).toBe(false);
    });
    expect(bridge.read).not.toHaveBeenCalled();
  } finally {
    found?.();
    loaded?.();
    await act(() => root.unmount());
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
  }
});
