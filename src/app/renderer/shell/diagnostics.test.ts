// @vitest-environment happy-dom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import type {
  DiagnosticBridge,
  DiagnosticFilter,
  DiagnosticReply,
  DiagnosticSnapshot,
} from "../../../shared/diagnostics";
import { Diagnostics } from "./diagnostics";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const trace = "a1cbcb4d-e59b-4163-b000-a10aa16798a2";
const otherTrace = "45ff7a73-e951-47ab-a064-cf4b1ca5e9ea";
const snapshot = (filter: DiagnosticFilter): DiagnosticSnapshot => ({
  sampledAt: "2026-10-06T00:00:00.000Z",
  filter,
  records: [],
  coverage: {
    files: 2,
    bytes: 300,
    lines: 3,
    malformed: 1,
    redacted: 2,
    unreadable: 1,
    truncated: true,
  },
  writer: { degraded: true, dropped: 4 },
});
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose();
});
async function mount(bridge: DiagnosticBridge, traceId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async (nextTrace = traceId) =>
    act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(I18nProvider, {
            initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
            children: createElement(Diagnostics, {
              bridge,
              traceId: nextTrace,
            }),
          }),
        ),
      ),
    );
  await render();
  cleanup.push(async () => {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  });
  const button = (text: string) =>
    Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === text,
    );
  const click = async (text: string) => {
    const found = button(text);
    expect(found, text).toBeDefined();
    await act(async () => found?.click());
    await flush();
  };
  return { render, click, button, client };
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
function successBridge() {
  return {
    request: vi.fn<DiagnosticBridge["request"]>(async (command) =>
      command.kind === "query"
        ? {
            kind: "snapshot",
            traceId: command.traceId,
            snapshot: snapshot(command.filter),
          }
        : { kind: "cancelled", traceId: command.traceId },
    ),
  };
}
async function edit(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(
    `[aria-label="${label}"]`,
  );
  expect(input).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("opens only on intent, applies bounded trace and coverage, validates filters before IPC", async () => {
  const bridge = successBridge();
  const ui = await mount(bridge, trace);
  expect(bridge.request).not.toHaveBeenCalled();
  await ui.click("查看此故障诊断");
  expect(bridge.request).toHaveBeenCalledTimes(1);
  expect(bridge.request.mock.calls[0]?.[0].filter).toMatchObject({
    traceId: trace,
    limit: 100,
  });
  expect(document.body.textContent).toContain("坏行 1");
  expect(document.body.textContent).toContain("丢弃 4");
  await edit("最多记录数", "501");
  await ui.click("应用筛选");
  expect(document.body.textContent).toContain("请检查时间范围");
  expect(bridge.request).toHaveBeenCalledTimes(1);
  await edit("最多记录数", "25");
  await edit("traceId", otherTrace);
  await ui.click("应用筛选");
  expect(bridge.request.mock.calls.at(-1)?.[0].filter).toMatchObject({
    traceId: otherTrace,
    limit: 25,
  });
});
it("retains an identified old sample when explicit refresh fails, with failure trace", async () => {
  const bridge = successBridge();
  const ui = await mount(bridge);
  await ui.click("诊断与反馈");
  bridge.request.mockImplementationOnce(async (command) => ({
    kind: "failed",
    traceId: command.traceId,
    reason: "read-unavailable",
  }));
  await ui.click("刷新");
  expect(document.body.textContent).toContain("刷新失败，仍显示旧采样");
  expect(document.body.textContent).toContain("read-unavailable");
  expect(document.body.textContent).toContain("2026");
  expect(bridge.request).toHaveBeenCalledTimes(2);
});
it("exports only explicit intent once and reports cancellation, failure and exported trace", async () => {
  const bridge = successBridge();
  const ui = await mount(bridge);
  await ui.click("诊断与反馈");
  let resolve: (reply: DiagnosticReply) => void = () => {};
  bridge.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await ui.click("脱敏导出");
  expect(ui.button("正在导出…")?.disabled).toBe(true);
  await act(async () => resolve({ kind: "cancelled", traceId: trace }));
  await flush();
  expect(document.body.textContent).toContain("已取消导出");
  bridge.request.mockImplementationOnce(async () => ({
    kind: "failed",
    traceId: trace,
    reason: "busy",
  }));
  await ui.click("脱敏导出");
  expect(document.body.textContent).toContain("busy");
  bridge.request.mockImplementationOnce(async () => ({
    kind: "exported",
    traceId: trace,
    fileName: "diagnostics.json",
  }));
  await ui.click("脱敏导出");
  expect(document.body.textContent).toContain("diagnostics.json");
  expect(document.body.textContent).toContain(trace);
  expect(
    bridge.request.mock.calls.filter(([command]) => command.kind === "export"),
  ).toHaveLength(3);
});
it("drops late query and export from a closed or replaced scope", async () => {
  const bridge = successBridge();
  let resolve: (reply: DiagnosticReply) => void = () => {};
  bridge.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const ui = await mount(bridge, trace);
  await ui.click("查看此故障诊断");
  await ui.click("关闭诊断");
  await ui.render(otherTrace);
  await ui.click("查看此故障诊断");
  await act(async () =>
    resolve({
      kind: "snapshot",
      traceId: trace,
      snapshot: {
        ...snapshot(bridge.request.mock.calls[0]![0].filter),
        sampledAt: "1999-01-01T00:00:00.000Z",
      },
    }),
  );
  await flush();
  expect(document.body.textContent).not.toContain("1999");
  expect(document.body.textContent).toContain(otherTrace);
  let finish: (reply: DiagnosticReply) => void = () => {};
  bridge.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  await ui.click("脱敏导出");
  await ui.click("关闭诊断");
  await ui.click("查看此故障诊断");
  await act(async () =>
    finish({ kind: "exported", traceId: trace, fileName: "obsolete.json" }),
  );
  await flush();
  expect(document.body.textContent).not.toContain("obsolete.json");
});
it("copies controlled metadata and reproduction placeholders, reporting clipboard failure", async () => {
  const writeText = vi.fn(async (_text: string) => {});
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  const bridge = successBridge();
  const ui = await mount(bridge, trace);
  await ui.click("查看此故障诊断");
  await ui.click("复制反馈模板");
  const text = writeText.mock.calls[0]?.[0] ?? "";
  expect(text).toContain(trace);
  expect(text).toContain("复现步骤：");
  expect(text).toContain("期待结果：");
  expect(text).toContain("实际结果：");
  expect(document.body.textContent).toContain("已复制");
  expect(text).not.toContain("/Users/");
  writeText.mockRejectedValueOnce(new Error("secret transport details"));
  await ui.click("复制反馈模板");
  expect(document.body.textContent).toContain("复制失败");
  expect(document.body.textContent).not.toContain("secret transport");
});

it("applies explicit local time, Thread, Writer, operation and stage without issuing intermediate reads", async () => {
  const bridge = successBridge();
  const ui = await mount(bridge);
  await ui.click("诊断与反馈");
  await edit("开始时间", "2026-10-05T12:00:00");
  await edit("结束时间", "2026-10-06T12:00:00");
  await edit("Thread ID", trace);
  await edit("Writer实例 ID", otherTrace);
  for (const [name, value] of [
    ["stage", "failed"],
    ["operation", "submit"],
  ]) {
    await act(() =>
      document
        .querySelector<HTMLButtonElement>(`button[name="${name}"]`)
        ?.click(),
    );
    const item = Array.from(
      document.querySelectorAll<HTMLElement>("[role=option]"),
    ).find((el) => el.dataset.value === value);
    if (!item) throw Error("missing filter option");
    await act(() => item.click());
  }
  expect(bridge.request).toHaveBeenCalledTimes(1);
  await ui.click("应用筛选");
  expect(bridge.request.mock.calls.at(-1)?.[0].filter).toMatchObject({
    since: new Date("2026-10-05T12:00:00").toISOString(),
    until: new Date("2026-10-06T12:00:00").toISOString(),
    threadId: trace,
    processInstanceId: otherTrace,
    stage: "failed",
    operation: "submit",
  });
});
it("renders typed records and restores trigger focus after Escape without background lifecycle effects", async () => {
  const bridge = successBridge();
  bridge.request.mockImplementationOnce(async (command) => ({
    kind: "snapshot",
    traceId: command.traceId,
    snapshot: {
      ...snapshot(command.filter),
      records: [
        {
          schemaVersion: 1,
          time: "2026-10-06T00:00:00.000Z",
          process: "main",
          processInstanceId: trace,
          build: {
            id: "candidate-123",
            version: "m2",
            commit: "abcd",
            dirty: false,
          },
          traceId: otherTrace,
          requestId: trace,
          connectionId: trace,
          operation: "submit",
          stage: "unknown",
          durationMs: 321,
          code: "host-exited",
          causeCode: "process-ended",
          threadId: trace,
          receiptState: "acknowledged",
          outcome: "unknown",
        },
      ],
    },
  }));
  const ui = await mount(bridge);
  await ui.click("诊断与反馈");
  const panel = document.querySelector<HTMLElement>("[data-diagnostics-panel]");
  expect(document.activeElement).toBe(panel);
  const record = document.querySelector("[data-diagnostics-record]");
  expect(record?.textContent).toContain("321 ms");
  expect(record?.textContent).toContain("host-exited");
  expect(record?.textContent).toContain("acknowledged");
  expect(record?.textContent).toContain(otherTrace);
  await act(async () =>
    panel?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(document.querySelector("[data-diagnostics-panel]")).toBeNull();
  expect(document.activeElement).toBe(ui.button("诊断与反馈"));
  expect(bridge.request).toHaveBeenCalledTimes(1);
});
it("keeps local reads available offline and never retries or leaks transport error text", async () => {
  onlineManager.setOnline(false);
  cleanup.push(async () => {
    onlineManager.setOnline(true);
  });
  const bridge = successBridge();
  bridge.request.mockRejectedValueOnce(
    new Error("api_key=private business text"),
  );
  const ui = await mount(bridge);
  await ui.click("诊断与反馈");
  expect(document.body.textContent).toContain("connection-failed");
  expect(document.body.textContent).not.toContain("api_key");
  await flush();
  expect(bridge.request).toHaveBeenCalledTimes(1);
});

it("releases diagnostic scope cache on close and restores apply focus after changing scope", async () => {
  const bridge = successBridge();
  const ui = await mount(bridge);
  await ui.click("诊断与反馈");
  await edit("traceId", trace);
  ui.button("应用筛选")?.focus();
  await ui.click("应用筛选");
  expect(document.activeElement).toBe(ui.button("应用筛选"));
  expect(ui.client.getQueryCache().getAll()).toHaveLength(1);
  await ui.click("关闭诊断");
  await flush();
  expect(ui.client.getQueryCache().getAll()).toHaveLength(0);
});

it("discards a completed late read cache after its observer has closed", async () => {
  const bridge = successBridge();
  let finish: (reply: DiagnosticReply) => void = () => {};
  bridge.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const ui = await mount(bridge);
  await ui.click("诊断与反馈");
  await ui.click("关闭诊断");
  const request = bridge.request.mock.calls[0]?.[0];
  if (!request) throw Error("missing read");
  await act(async () =>
    finish({
      kind: "snapshot",
      traceId: request.traceId,
      snapshot: snapshot(request.filter),
    }),
  );
  await flush();
  expect(ui.client.getQueryCache().getAll()).toHaveLength(0);
  expect(document.querySelector("[data-diagnostics-panel]")).toBeNull();
});

it("distinguishes recovered current health from cumulative gaps and active I/O", async () => {
  const bridge = successBridge();
  bridge.request.mockImplementationOnce(async (command) => ({
    kind: "snapshot",
    traceId: command.traceId,
    snapshot: {
      ...snapshot(command.filter),
      writer: {
        degraded: false,
        dropped: 4,
        uncertain: 2,
        retentionFailures: 3,
        rejected: 1,
        drainTimedOut: 1,
        inFlight: 100,
        lastRecovery: {
          startedAt: "2026-10-06T00:00:00.000Z",
          recoveredAt: "2026-10-06T00:01:00.000Z",
          dropped: 4,
          uncertain: 2,
          retentionFailures: 3,
        },
      },
    },
  }));
  const ui = await mount(bridge);
  await ui.click("诊断与反馈");
  expect(document.body.textContent).toContain("未确认追加 2");
  expect(document.body.textContent).toContain("清理失败 3");
  expect(document.body.textContent).toContain("在途 100");
  expect(document.body.textContent).toContain("最近恢复");
});
