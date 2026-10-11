// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type {
  AnswerHistoryEntry,
  AnswerHistoryPage,
} from "../../../modules/execution/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ThreadIdSchema } from "../../../shared/identity";
import { ConversationVisibilityContext } from "../shell/layout/conversation-visibility";
import { AnswerHistory } from "./answer-history";

it("reveals history on an explicit recovery action and does not reclaim focus when the window returns", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const scroll = vi
    .spyOn(HTMLElement.prototype, "scrollIntoView")
    .mockImplementation(() => {});
  const client = new QueryClient();
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const bridge = {
    request: vi.fn(
      async (): Promise<AnswerHistoryPage> => ({
        threadId,
        source: "app-observed",
        entries: [],
        cursor: null,
      }),
    ),
  };
  let visible = true,
    revealRequest = 0;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = () =>
    root.render(
      createElement(QueryClientProvider, {
        client,
        children: createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ConversationVisibilityContext, {
            value: { visible, reveal: () => {} },
            children: createElement(AnswerHistory, {
              bridge,
              threadId,
              revealRequest,
            }),
          }),
        }),
      }),
    );
  const other = document.createElement("button");
  document.body.append(other);
  try {
    await act(render);
    expect(bridge.request).not.toHaveBeenCalled();
    revealRequest++;
    await act(render);
    expect(host.querySelector<HTMLDetailsElement>("details")?.open).toBe(true);
    expect(document.activeElement).toBe(host.querySelector(".answer-history"));
    expect(scroll).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.waitFor(() => expect(bridge.request).toHaveBeenCalledOnce());
    });
    visible = false;
    await act(render);
    other.focus();
    visible = true;
    await act(render);
    expect(document.activeElement).toBe(other);
    expect(scroll).toHaveBeenCalledOnce();
    await act(() => {
      const detail = host.querySelector<HTMLDetailsElement>("details")!;
      detail.open = false;
      detail.dispatchEvent(new Event("toggle"));
    });
    await act(render);
    expect(host.querySelector<HTMLDetailsElement>("details")?.open).toBe(false);
    revealRequest++;
    await act(render);
    expect(host.querySelector<HTMLDetailsElement>("details")?.open).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(host.querySelector(".answer-history"));
  } finally {
    await act(() => root.unmount());
    client.clear();
    host.remove();
    other.remove();
    scroll.mockRestore();
    vi.unstubAllGlobals();
  }
});

it("samples history only when opened, replaces bounded pages and retains a failed refresh's previous observations", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient();
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const entry: AnswerHistoryEntry = {
    kind: "answer",
    operationId: crypto.randomUUID(),
    origin: "user",
    status: "written",
    requestKey: {
      threadId,
      nativeSessionKey: "real-native",
      connectionGeneration: crypto.randomUUID(),
      requestId: "A",
    },
    dialog: { id: "A", method: "input", title: "冻结题目" },
    answer: { kind: "value", value: "  原始中文答案  " },
    createdAt: "2026-10-11T10:00:00.000Z",
    updatedAt: "2026-10-11T10:00:01.000Z",
  };
  const olderOperationId = crypto.randomUUID();
  let fail = false;
  let visible = true;
  let windowVisible = true;
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockImplementation(() => (windowVisible ? "visible" : "hidden"));
  const bridge = {
    request: vi.fn(
      async ({
        cursor,
      }: {
        cursor: number | null;
      }): Promise<AnswerHistoryPage> => {
        if (fail) throw Error("disk read failed");
        return {
          threadId,
          source: "app-observed",
          entries: [
            {
              ...entry,
              operationId:
                cursor === null ? entry.operationId : olderOperationId,
              dialog: {
                ...entry.dialog,
                title: cursor === null ? "冻结题目" : "更早题目",
              },
            },
          ],
          cursor: cursor === null ? 17 : null,
        };
      },
    ),
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const button = (text: string) =>
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) => node.textContent === text,
    )!;
  try {
    const render = () =>
      root.render(
        createElement(QueryClientProvider, {
          client,
          children: createElement(I18nProvider, {
            initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
            children: createElement(ConversationVisibilityContext, {
              value: { visible, reveal: () => {} },
              children: createElement(AnswerHistory, { bridge, threadId }),
            }),
          }),
        }),
      );
    await act(render);
    expect(bridge.request).not.toHaveBeenCalled();
    await act(() => {
      const disclosure = host.querySelector("details")!;
      disclosure.open = true;
      disclosure.dispatchEvent(new Event("toggle"));
    });
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain("冻结题目"));
    });
    expect(host.textContent).toContain("App 观察到的历史");
    expect(host.textContent).toContain("尚未确认原生接受");
    expect(host.textContent).not.toContain("  原始中文答案  ");
    await act(() => {
      const detail = host.querySelector<HTMLDetailsElement>(
        ".answer-history-entry details",
      )!;
      detail.open = true;
      detail.dispatchEvent(new Event("toggle"));
    });
    expect(host.textContent).toContain("  原始中文答案  ");
    await act(() => button("更早记录").click());
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain("更早题目"));
    });
    expect(host.textContent).not.toContain("冻结题目");
    expect(bridge.request).toHaveBeenLastCalledWith({
      threadId,
      cursor: 17,
      traceId: expect.any(String),
    });
    await act(() => {
      const detail = host.querySelector<HTMLDetailsElement>(
        ".answer-history-entry details",
      )!;
      detail.open = true;
      detail.dispatchEvent(new Event("toggle"));
    });
    for (const scope of ["shell", "window"]) {
      const count = bridge.request.mock.calls.length;
      await act(() => {
        if (scope === "shell") {
          visible = false;
          render();
        } else {
          windowVisible = false;
          document.dispatchEvent(new Event("visibilitychange"));
        }
      });
      expect(host.querySelector(".answer-history-page")).toBeNull();
      expect(host.querySelector("details")?.open).toBe(true);
      await vi.waitFor(() =>
        expect(client.getQueryCache().getAll()).toHaveLength(0),
      );
      expect(bridge.request).toHaveBeenCalledTimes(count);
      await act(() => {
        if (scope === "shell") {
          visible = true;
          render();
        } else {
          windowVisible = true;
          document.dispatchEvent(new Event("visibilitychange"));
        }
      });
      await act(async () => {
        await vi.waitFor(() => expect(host.textContent).toContain("更早题目"));
      });
      expect(bridge.request).toHaveBeenCalledTimes(count + 1);
      expect(
        host.querySelector<HTMLDetailsElement>(".answer-history-entry details")
          ?.open,
      ).toBe(true);
      expect(host.textContent).toContain("  原始中文答案  ");
      expect(bridge.request).toHaveBeenLastCalledWith({
        threadId,
        cursor: 17,
        traceId: expect.any(String),
      });
    }
    fail = true;
    await act(async () => {
      button("刷新记录").click();
      await vi.waitFor(() =>
        expect(host.querySelector('[role="alert"]')?.textContent).toContain(
          "读取回答记录失败",
        ),
      );
    });
    expect(host.textContent).toContain("更早题目");
    await act(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  } finally {
    await act(() => root.unmount());
    client.clear();
    host.remove();
    visibility.mockRestore();
    vi.unstubAllGlobals();
  }
});
