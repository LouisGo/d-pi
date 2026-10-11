// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { ConversationModel } from "../../../modules/conversation/core/public";
import {
  RuntimeViewSchema,
  SubmissionReceiptSchema,
} from "../../../modules/execution/contracts/public";
import {
  RuntimeModel,
  type SubmissionModel,
  type SubmissionView,
} from "../../../modules/execution/renderer/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ExecutionStatus } from "./execution-status";

it("shows waiting, actual reasoning/text and failure; ignores old connections and never retries an unknown send", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const generation = crypto.randomUUID();
  let view = RuntimeViewSchema.parse({
    threadId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    revision: 1,
    phase: "ready",
    trusted: true,
    busy: true,
    model: "fixture",
    configuration: { code: "runtime.configDefault" },
    message: { code: "runtime.processing" },
    connectionGeneration: generation,
  });
  const commands = vi.fn(async () => ({ kind: "view" as const, view }));
  const runtime = new RuntimeModel({
    subscribe: () => () => {},
    request: commands,
  });
  await runtime.bind(view.threadId);
  commands.mockClear();
  const receipt = SubmissionReceiptSchema.parse({
    submissionId: crypto.randomUUID(),
    threadId: view.threadId,
    traceId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    revision: 0,
    text: "真实发送",
    target: {
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: generation,
      configContextId: "fixture",
      nativeSessionRef: "/fixture/native.jsonl",
    },
    state: "acknowledged",
    acknowledgedAt: "1",
    outcome: "unobserved",
    createdAt: "1",
    updatedAt: "1",
  });
  const store = createStore<SubmissionView>(() => ({
    listRead: "ready",
    sending: false,
    sendingText: false,
    receipts: [receipt],
    receiptIds: [receipt.submissionId],
    receiptsById: new Map([[receipt.submissionId, receipt]]),
    message: null,
    preparationFailure: null,
  }));
  let receive: Parameters<
    ConstructorParameters<typeof ConversationModel>[0]["connect"]
  >[1] = () => {};
  const reading = new ConversationModel({
    connect: (_id, listener) => {
      receive = listener;
      return () => {};
    },
  });
  reading.connect(view.threadId);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const review = vi.fn();
  const snapshot = (owner: string, text: string, thinking: string) =>
    act(() =>
      receive({
        kind: "snapshot",
        connectionGeneration: owner,
        seq: 1,
        gap: false,
        items: [
          {
            id: 1,
            role: "assistant",
            text,
            thinking,
            state: "streaming",
            label: { kind: "literal", text: "assistant" },
          },
        ],
      }),
    );
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
          children: createElement(ExecutionStatus, {
            runtime,
            reading,
            submission: { stateStore: store } as unknown as SubmissionModel,
            onReviewOperations: review,
          }),
        }),
      ),
    );
    expect(host.textContent).toContain("等待模型响应");
    await snapshot(crypto.randomUUID(), "旧连接的回复", "旧思考");
    expect(host.textContent).toContain("等待模型响应");
    await snapshot(generation, "", "真实思考片段");
    expect(host.textContent).toContain("正在输出思考过程");
    await snapshot(generation, "真实回复片段", "真实思考片段");
    expect(host.textContent).toContain("正在生成回复");
    await act(() =>
      store.setState({
        receipts: [
          {
            ...receipt,
            state: "unknown",
            acknowledgedAt: null,
            outcome: "unknown",
          },
        ],
      }),
    );
    expect(host.textContent).toContain("发送结果尚未确认");
    expect(host.querySelector('[data-slot="loading-indicator"]')).toBeNull();
    await act(() => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(review).toHaveBeenCalledOnce();
    expect(commands).not.toHaveBeenCalled();
    await act(() => {
      view = { ...view, busy: false, revision: view.revision + 1 };
      store.setState({
        receipts: [
          {
            ...receipt,
            outcome: "failed",
            promptResult: {
              source: "native-prompt-result",
              status: "error",
              agentInvoked: true,
              sessionSettled: true,
              error: {
                code: "native-error",
                retryable: false,
                httpStatus: 503,
              },
            },
          },
        ],
      });
    });
    // RuntimeModel's immutable snapshot is replaced by an explicit observation.
    await act(() => runtime.act("inspect"));
    expect(host.textContent).toContain("本轮执行失败");
    expect(host.textContent).not.toContain("正在生成回复");
  } finally {
    await act(() => root.unmount());
    host.remove();
    reading.dispose();
    runtime.dispose();
    vi.unstubAllGlobals();
  }
});
