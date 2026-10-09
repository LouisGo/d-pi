// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { HistoryBridge } from "../../../modules/conversation/contracts/public";
import { ReadingPositions } from "../../../modules/conversation/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { History } from "./history";

vi.mock("./markdown", () => ({
  Markdown: ({ text }: { text: string }) => createElement("p", null, text),
}));

it("restores the selected native session and record page after A to B to A remounts", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const keys = ["a".repeat(64), "b".repeat(64)];
  const owners = { A: new ReadingPositions(), B: new ReadingPositions() };
  const bridge: HistoryBridge = {
    read: async () => ({ kind: "unavailable", reason: "missing" }),
    projectList: async () => ({
      kind: "catalog",
      sessions: keys.map((key, i) => ({
        key,
        sessionId: String(i),
        title: String(i),
        modifiedAt: 1,
      })),
      partial: false,
    }),
    projectRead: async (threadId, key, cursor) => ({
      kind: "page",
      entries: [
        {
          id: "record",
          parentId: null,
          role: "assistant",
          text:
            `${threadId}/${keys.indexOf(key)}/${cursor?.offset ?? 0}:` +
            "x".repeat(20000),
        },
      ],
      next: cursor
        ? null
        : { threadId, source: `${threadId}/${key}`, offset: 100 },
      source: `${threadId}/${key}`,
      coverage: "append-order",
      incompleteTail: false,
      omitted: 0,
    }),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (threadId: "A" | "B") =>
    act(() =>
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(I18nProvider, {
            initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
            children: createElement(History, {
              bridge,
              threadId,
              positions: owners[threadId],
              active: true,
            }),
          }),
        ),
      ),
    );
  const waitText = (text: string) =>
    vi.waitFor(async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(
        container.querySelector("[data-reading-text]")?.textContent,
      ).toContain(text);
    });
  const click = (text: string) =>
    act(() => {
      const button = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === text,
      );
      if (!button) throw Error(`missing ${text}`);
      button.click();
    });
  try {
    await render("A");
    await waitText("A/0/0:");
    const select =
      container.querySelector<HTMLButtonElement>("[data-slot=select]");
    if (!select) throw Error("missing history session selector");
    await act(() => select.click());
    const option = document.querySelector<HTMLElement>(
      `[role=option][data-value="${keys[1]}"]`,
    );
    if (!option) throw Error("missing second native session option");
    await act(() => option.click());
    await waitText("A/1/0:");
    await click("Next page");
    await waitText("A/1/100:");
    await render("B");
    await waitText("B/0/0:");
    expect(container.querySelector("[data-reading-segment]")).toBeNull();
    await render("A");
    await vi.waitFor(async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(
        container.querySelector<HTMLButtonElement>("[data-slot=select]")?.value,
      ).toBe(keys[1]);
      expect(
        container.querySelector("[data-reading-text]")?.textContent,
      ).toContain("A/1/100:");
    });
    expect(owners.A.stateStore.getState().history.cursor?.offset).toBe(100);
  } finally {
    await act(() => root.unmount());
    client.clear();
    owners.A.dispose();
    owners.B.dispose();
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("renders complete native history records and copies all available original text while retaining coverage notices", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const text = "原生记录😀\n".repeat(2000);
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const bridge: HistoryBridge = {
    read: async () => ({ kind: "unavailable", reason: "missing" }),
    projectList: async () => ({
      kind: "catalog",
      sessions: [
        {
          key: "a".repeat(64),
          sessionId: "native",
          title: "Native",
          modifiedAt: 1,
        },
      ],
      partial: false,
    }),
    projectRead: async () => ({
      kind: "page",
      entries: [{ id: "one", parentId: null, role: "assistant", text }],
      next: null,
      source: "fixture",
      coverage: "append-order",
      incompleteTail: true,
      omitted: 3,
    }),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
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
    await vi.waitFor(async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(container.querySelector("article")).not.toBeNull();
    });
    expect(container.querySelector("[data-reading-text]")).not.toBeNull();
    expect(
      container.querySelector("[data-reading-text]")?.textContent?.length,
    ).toBe(text.length);
    const button = [
      ...container.querySelectorAll<HTMLButtonElement>("article button"),
    ].find((button) => button.textContent === "Copy");
    if (!button) throw Error("missing history copy button");
    await act(() => button.click());
    expect(copy).toHaveBeenCalledWith(text);
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("still being written");
  } finally {
    await act(() => root.unmount());
    client.clear();
    container.remove();
    copy.mockRestore();
    vi.unstubAllGlobals();
  }
});

it("replaces the complete record when a native history source changes without reusing old content", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { projectHistoryPageQuery } = await import(
    "../../../modules/conversation/core/public"
  );
  const key = "a".repeat(64);
  const page = (source: string) => ({
    kind: "page" as const,
    entries: [
      {
        id: "same",
        parentId: null,
        role: "assistant",
        text: source + "x".repeat(24000),
      },
    ],
    next: null,
    source,
    coverage: "append-order" as const,
    incompleteTail: false,
    omitted: 0,
  });
  const bridge: HistoryBridge = {
    read: async () => ({ kind: "unavailable", reason: "missing" }),
    projectList: async () => ({
      kind: "catalog",
      sessions: [{ key, sessionId: "native", title: "Native", modifiedAt: 1 }],
      partial: false,
    }),
    projectRead: async () => page("first-source"),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const query = projectHistoryPageQuery(bridge, "thread", key, null);
  client.setQueryData(query.queryKey, page("first-source"));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
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
    await vi.waitFor(async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(container.querySelector("[data-reading-text]")).not.toBeNull();
    });
    expect(
      container.querySelector("[data-reading-text]")?.textContent,
    ).toContain("first-source");
    expect(container.querySelector("[data-reading-segment]")).toBeNull();
    await act(() => client.setQueryData(query.queryKey, page("second-source")));
    await vi.waitFor(async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(container.querySelector("[data-reading-segment]")).toBeNull();
    });
    expect(
      container.querySelector("[data-reading-text]")?.textContent,
    ).toContain("second-source");
  } finally {
    await act(() => root.unmount());
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
  }
});
