// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
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
import { RuntimePanel } from "./runtime-panel";

it("surfaces an unknown send even when the connected runtime is otherwise ready", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const view = RuntimeViewSchema.parse({
    threadId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    revision: 1,
    phase: "ready",
    trusted: true,
    busy: false,
    model: "fixture",
    configuration: { code: "runtime.configDefault" },
    message: { code: "runtime.idle" },
  });
  const receipt = SubmissionReceiptSchema.parse({
    threadId: view.threadId,
    traceId: crypto.randomUUID(),
    submissionId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    revision: 0,
    text: "保留中文输入",
    target: {
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: crypto.randomUUID(),
      configContextId: "fixture",
      nativeSessionRef: "/fixture/session.jsonl",
    },
    state: "unknown",
    acknowledgedAt: null,
    outcome: "unobserved",
    createdAt: "1",
    updatedAt: "1",
  });
  const stateStore = createStore<SubmissionView>()(() => ({
    listRead: "ready",
    sending: false,
    sendingText: false,
    receipts: [receipt],
    receiptIds: [receipt.submissionId],
    receiptsById: new Map([[receipt.submissionId, receipt]]),
    message: null,
    preparationFailure: null,
  }));
  const commands = vi.fn(async () => ({ kind: "view" as const, view }));
  const model = new RuntimeModel({
    subscribe: () => () => {},
    request: commands,
  });
  await model.bind(view.threadId);
  commands.mockClear();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(RuntimePanel, {
            model,
            submission: { stateStore } as unknown as SubmissionModel,
            inspection: false,
            onFollowUp: undefined,
          }),
        }),
      ),
    );
    expect(host.querySelector("[data-recovery-panel]")).not.toBeNull();
    expect(host.textContent).toContain("unknown outcome");
    expect(commands).not.toHaveBeenCalled();
    expect(stateStore.getState().receiptsById.get(receipt.submissionId)).toBe(
      receipt,
    );
  } finally {
    await act(() => root.unmount());
    host.remove();
    model.dispose();
    vi.unstubAllGlobals();
  }
});

it.each([
  { phase: "interrupted", message: { code: "runtime.disconnected" } },
  {
    phase: "failed",
    recoveryFailure: "occupied",
    message: { code: "runtime.recoveryOccupied" },
  },
  {
    phase: "ready",
    evidenceCoverage: "gap",
    message: { code: "runtime.processing" },
  },
  {
    phase: "interrupted",
    busy: true,
    message: { code: "runtime.disconnected" },
  },
  {
    phase: "failed",
    trusted: false,
    message: { code: "runtime.grantInvalid" },
  },
  {
    phase: "ready",
    queueOperation: { traceId: crypto.randomUUID(), status: "unknown" },
    message: { code: "runtime.processing" },
  },
  {
    phase: "ready",
    interactionOperations: [
      {
        operationId: crypto.randomUUID(),
        threadId: crypto.randomUUID(),
        connectionGeneration: crypto.randomUUID(),
        requestId: "same-id",
        kind: "answer",
        status: "unknown",
      },
    ],
    message: { code: "runtime.processing" },
  },
])(
  "exposes recovery facts in the conversation without starting or resending ($phase)",
  async (facts) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const view = RuntimeViewSchema.parse({
      threadId: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      revision: 1,
      phase: "ready",
      trusted: true,
      busy: false,
      model: "fixture",
      configuration: { code: "runtime.configDefault" },
      ...facts,
    });
    const commands: unknown[] = [];
    const model = new RuntimeModel({
      subscribe: () => () => {},
      request: async (command) => {
        commands.push(command);
        return { kind: "view", view };
      },
    });
    await model.bind(view.threadId);
    commands.length = 0;
    const answers = vi.fn(),
      operations = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(() =>
        root.render(
          createElement(I18nProvider, {
            initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
            children: createElement(RuntimePanel, {
              model,
              inspection: false,
              onFollowUp: undefined,
              onReviewAnswers: answers,
              onReviewOperations: operations,
            }),
          }),
        ),
      );
      const panel = host.querySelector("[data-recovery-panel]");
      expect(panel).not.toBeNull();
      expect(commands).toEqual([]);
      const button = (text: string) =>
        [...panel!.querySelectorAll<HTMLButtonElement>("button")].find(
          (node) => node.textContent === text,
        )!;
      expect(button("Reconnect") !== undefined).toBe(
        view.trusted &&
          !view.busy &&
          (view.phase === "failed" || view.phase === "interrupted"),
      );
      await act(async () => button("Check status").click());
      expect(commands).toEqual([
        expect.objectContaining({ kind: "inspect", threadId: view.threadId }),
      ]);
      await act(() => button("Review answer records").click());
      await act(() => button("Review sent messages").click());
      expect(answers).toHaveBeenCalledOnce();
      expect(operations).toHaveBeenCalledOnce();
      if (
        view.trusted &&
        !view.busy &&
        (view.phase === "failed" || view.phase === "interrupted")
      ) {
        await act(async () => button("Reconnect").click());
        expect(commands.at(-1)).toMatchObject({
          kind: "start",
          threadId: view.threadId,
        });
      }
      expect(
        commands.every((command) =>
          ["inspect", "start"].includes((command as { kind: string }).kind),
        ),
      ).toBe(true);
    } finally {
      await act(() => root.unmount());
      host.remove();
      model.dispose();
      vi.unstubAllGlobals();
    }
  },
);

it("does not turn an ordinary running reply into a queue area above the conversation", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const view = RuntimeViewSchema.parse({
    threadId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    revision: 0,
    phase: "ready",
    trusted: true,
    busy: true,
    model: "fixture",
    configuration: { code: "runtime.configDefault" },
    message: { code: "runtime.processing" },
    control: {
      paused: false,
      stopping: false,
      pendingAsync: false,
      admitted: false,
      streaming: true,
      compacting: false,
      queued: 0,
      background: 0,
      queue: [],
    },
  });
  const model = new RuntimeModel({
    subscribe: () => () => {},
    request: async () => ({ kind: "view", view }),
  });
  await model.bind(view.threadId);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(RuntimePanel, {
            model,
            inspection: false,
            onFollowUp: undefined,
          }),
        }),
      ),
    );
    expect(container.querySelector(".runtime-panel")).toBeNull();
  } finally {
    await act(() => root.unmount());
    container.remove();
    model.dispose();
  }
});

it("keeps stop in the composer and dispatches against the current execution identity", async () => {
  const { ComposerStopAction } = await import("./composer-execution-controls");
  const commands: unknown[] = [];
  const threadId = crypto.randomUUID(),
    connectionGeneration = crypto.randomUUID();
  const view = RuntimeViewSchema.parse({
    threadId,
    connectionGeneration,
    traceId: crypto.randomUUID(),
    revision: 1,
    phase: "ready",
    trusted: true,
    busy: true,
    model: "fixture",
    configuration: { code: "runtime.configDefault" },
    message: { code: "runtime.processing" },
    control: {
      paused: false,
      stopping: false,
      pendingAsync: false,
      admitted: false,
      streaming: true,
      compacting: false,
      queued: 0,
      background: 0,
      queue: [],
    },
  });
  const model = new RuntimeModel({
    subscribe: () => () => {},
    request: async (command) => {
      commands.push(command);
      return { kind: "view", view };
    },
  });
  await model.bind(view.threadId);
  commands.length = 0;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ComposerStopAction, { model }),
        }),
      ),
    );
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Stop response"]',
    );
    expect(button).not.toBeNull();
    await act(async () => button?.click());
    expect(commands).toContainEqual(
      expect.objectContaining({ kind: "stop", threadId, connectionGeneration }),
    );
  } finally {
    await act(() => root.unmount());
    container.remove();
    model.dispose();
  }
});
