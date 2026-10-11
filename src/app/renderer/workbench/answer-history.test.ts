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
import { AnswerHistory } from "./answer-history";

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
  let fail = false;
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
                cursor === null ? entry.operationId : crypto.randomUUID(),
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
    await act(() =>
      root.render(
        createElement(QueryClientProvider, {
          client,
          children: createElement(I18nProvider, {
            initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
            children: createElement(AnswerHistory, { bridge, threadId }),
          }),
        }),
      ),
    );
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
    vi.unstubAllGlobals();
  }
});
