// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useStore } from "zustand";
import {
  type RuntimeCommand,
  type RuntimeReply,
  type RuntimeView,
  RuntimeViewSchema,
} from "../../../modules/execution/contracts/public";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { AppModel } from "../wiring/model";
import { ThreadWorkbench } from "./thread-workbench";

// Composer is outside this answer-owner combination. The actual AppModel,
// ThreadModel, ThreadWorkbench, RuntimePanel, DecisionDock and answer fields
// remain in the path. Main/native answer persistence has separate real tests.
vi.mock("./composer", () => ({ Composer: () => null }));

async function fixture() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const a = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/isolated/a",
    revision: 0,
    text: "",
  });
  const b = DraftSchema.parse({
    ...a,
    threadId: crypto.randomUUID(),
    directory: "/isolated/b",
  });
  const drafts = new Map([
    [a.threadId, a],
    [b.threadId, b],
  ]);
  const listeners = new Map<string, Set<(view: RuntimeView) => void>>();
  const commands: RuntimeCommand[] = [];
  let active = a;
  const deadline = Date.now() + 300000;
  const generation = crypto.randomUUID();
  let current: RuntimeView = RuntimeViewSchema.parse({
    threadId: a.threadId,
    traceId: crypto.randomUUID(),
    revision: 1,
    configuration: { code: "runtime.configDefault" },
    phase: "ready",
    trusted: true,
    busy: false,
    model: "fixture",
    message: { code: "runtime.readyToSend" },
    connectionGeneration: generation,
    interactions: {
      connectionGeneration: generation,
      nativeSessionKey: "actual-fixture-native",
      unsupported: false,
      items: [
        {
          id: "rich",
          method: "ask",
          title: "选择方案",
          status: "pending",
          expiresAt: deadline,
          policy: {
            defaultOwner: "native",
            expiry: deadline,
            reason: "native-ask",
          },
          questions: [
            {
              id: "first",
              question: "采用哪个方案？",
              options: [{ label: "方案甲" }, { label: "方案乙" }],
            },
            {
              id: "second",
              question: "补充哪些能力？",
              multi: true,
              options: [{ label: "能力甲" }, { label: "能力乙" }],
            },
          ],
        },
        {
          id: "independent",
          method: "input",
          title: "独立问题",
          status: "pending",
          expiresAt: deadline,
          policy: {
            defaultOwner: "app",
            expiry: deadline - 1000,
            reason: "legacy-default",
            defaultResult: { kind: "cancel" },
          },
        },
      ],
    },
  });
  let failAnswer: () => void = () => {};
  const runtime: NonNullable<DesktopBridge["runtime"]> = {
    subscribe(listener, threadId) {
      if (!threadId) throw Error("Expected formal Thread-scoped subscription");
      const set = listeners.get(threadId) ?? new Set();
      listeners.set(threadId, set);
      set.add(listener);
      return () => set.delete(listener);
    },
    async request(command): Promise<RuntimeReply> {
      commands.push(command);
      if (command.kind === "answer")
        return new Promise((_resolve, reject) => {
          failAnswer = () =>
            reject(
              Error("Reply lost after native write; no confirmation available"),
            );
        });
      if (command.threadId === b.threadId)
        return {
          kind: "view",
          view: { ...current, threadId: b.threadId, interactions: undefined },
        };
      if (command.kind === "start") {
        const next = crypto.randomUUID();
        current = {
          ...current,
          revision: current.revision + 1,
          phase: "ready",
          connectionGeneration: next,
          interactions: {
            ...current.interactions!,
            connectionGeneration: next,
            items: current.interactions!.items.map((item) => ({
              ...item,
              status: "pending",
            })),
          },
        };
      }
      return { kind: "view", view: current };
    },
  };
  const bridge: DesktopBridge = {
    runtime,
    request: async (command) => {
      if (command.kind === "list-threads")
        return parseDesktopReply(command, { kind: "threads", threads: [a, b] });
      if (command.kind === "save") {
        const draft = drafts.get(command.threadId)!;
        drafts.set(command.threadId, {
          ...draft,
          text: command.text,
          revision: command.expectedRevision + 1,
        });
        return parseDesktopReply(command, {
          kind: "saved",
          threadId: command.threadId,
          revision: command.expectedRevision + 1,
        });
      }
      if (command.kind === "select-thread")
        active = drafts.get(command.threadId)!;
      return parseDesktopReply(command, {
        kind: "ready",
        draft: active,
        directoryAvailable: true,
        preferences: { theme: "light", density: "normal", locale: "system" },
      });
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose() {},
  };
  const app = new AppModel(bridge, 1);
  await app.start();
  const owner = app.runtime!;
  await owner.act("inspect");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Window() {
    const state = useStore(app.stateStore);
    return state.kind === "ready" && state.threadSelection.kind === "thread"
      ? createElement(ThreadWorkbench, {
          model: app,
          threadSelection: state.threadSelection,
          readingView: "conversation",
          onReadingViewChange: () => {},
        })
      : null;
  }
  const render = () =>
    act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
          children: createElement(Window),
        }),
      ),
    );
  await render();
  function button(scope: ParentNode, label: string) {
    const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) =>
        node.textContent === label || node.getAttribute("aria-label") === label,
    );
    if (!found) throw Error(`Missing ${label}`);
    return found;
  }
  async function input(scope: ParentNode, text: string) {
    const field = scope.querySelector<HTMLTextAreaElement>("textarea");
    expect(field).not.toBeNull();
    await act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(field, text);
      field!.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function editRich() {
    const timeline = host.querySelector<HTMLElement>(
      '[data-editor-surface="timeline"][aria-label="选择方案"]',
    )!;
    await act(() =>
      timeline
        .querySelector<HTMLElement>('[role="radio"][aria-label="方案甲"]')!
        .click(),
    );
    await act(() => button(timeline, "下一题").click());
    await act(() => button(timeline, "其他回答").click());
    await input(timeline, "  中文半写草稿  ");
    await act(() => owner.chooseInteractionEditor("rich", "dock"));
    const independent = host.querySelector<HTMLElement>(
      '[data-editor-surface="timeline"][aria-label="独立问题"]',
    )!;
    await input(independent, "独立回答草稿");
  }
  return {
    app,
    owner,
    host,
    a,
    b,
    deadline,
    generation,
    commands,
    render,
    editRich,
    button,
    failAnswer: () => failAnswer(),
    async disconnect() {
      current = {
        ...current,
        revision: current.revision + 1,
        phase: "interrupted",
        message: { code: "runtime.disconnected" },
      };
      await act(() => {
        for (const listener of listeners.get(a.threadId) ?? [])
          listener(current);
      });
    },
    async cleanup() {
      await act(() => root.unmount());
      app.dispose();
      host.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
    async hide() {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      await act(() => document.dispatchEvent(new Event("visibilitychange")));
      await act(() => root.render(null));
    },
    async show() {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      await act(() => document.dispatchEvent(new Event("visibilitychange")));
      await render();
    },
  };
}

it("retains the real Thread answer owner, current question, Dock transfer and deadlines through selection and window hiding", async () => {
  const view = await fixture();
  try {
    await view.editRich();
    const rich = structuredClone(view.owner.interactionDraft("rich"));
    const independent = structuredClone(
      view.owner.interactionDraft("independent"),
    );
    expect(view.host.querySelectorAll(".decision-dock textarea")).toHaveLength(
      1,
    );
    await view.hide();
    await view.show();
    expect(view.owner.interactionDraft("rich")).toEqual(rich);
    expect(
      view.host.querySelector<HTMLTextAreaElement>(".decision-dock textarea")
        ?.value,
    ).toBe("  中文半写草稿  ");
    await act(async () => {
      expect((await view.app.selectThread(view.b.threadId)).kind).toBe(
        "applied",
      );
    });
    expect(view.app.runtime).not.toBe(view.owner);
    expect(view.host.querySelectorAll("textarea")).toHaveLength(0);
    await view.hide();
    await view.show();
    await act(async () => {
      expect((await view.app.selectThread(view.a.threadId)).kind).toBe(
        "applied",
      );
    });
    expect(view.app.runtime).toBe(view.owner);
    expect(view.owner.interactionDraft("rich")).toEqual(rich);
    expect(view.owner.interactionDraft("independent")).toEqual(independent);
    expect(view.owner.interactionDraft("rich")?.ask?.questionId).toBe("second");
    expect(
      view.host.querySelector<HTMLTextAreaElement>(".decision-dock textarea")
        ?.value,
    ).toBe("  中文半写草稿  ");
    expect(
      view.host.querySelectorAll('.decision-dock [data-editor-owner="true"]'),
    ).toHaveLength(1);
    expect(
      view.host.querySelector(
        '[data-editor-surface="timeline"][aria-label="选择方案"] textarea',
      ),
    ).toBeNull();
    expect(
      view.owner
        .getSnapshot()
        ?.interactions?.items.map((item) => item.expiresAt),
    ).toEqual([view.deadline, view.deadline]);
    expect(
      view.commands.filter((command) => command.kind === "answer"),
    ).toEqual([]);
  } finally {
    await view.cleanup();
  }
});

it("keeps typed input and an unknown answer across real owner detach, disconnect and explicit reconnection without replaying an old handle", async () => {
  const view = await fixture();
  try {
    await view.editRich();
    const oldRich = view.owner.captureInteractionEditor("rich")!;
    const oldIndependent = view.owner.captureInteractionEditor("independent")!;
    let sending: ReturnType<typeof view.owner.submitAsk> | undefined;
    await act(() => {
      sending = view.owner.submitAsk("rich", "dock", oldRich);
    });
    expect(view.owner.interactionOperation("rich")?.status).toBe("dispatching");
    await view.disconnect();
    await act(async () => {
      view.failAnswer();
      await sending;
    });
    expect(view.owner.interactionOperation("rich")?.status).toBe("unknown");
    expect(
      view.owner.interactionDraft("rich")?.ask?.answers.second?.customInput,
    ).toBe("  中文半写草稿  ");
    expect(view.owner.interactionDraft("independent")?.value).toBe(
      "独立回答草稿",
    );
    await act(async () => {
      await view.app.selectThread(view.b.threadId);
    });
    await view.hide();
    await view.show();
    await act(async () => {
      await view.app.selectThread(view.a.threadId);
    });
    expect(view.app.runtime).toBe(view.owner);
    expect(view.owner.interactionOperation("rich")?.status).toBe("unknown");
    expect(
      view.commands.filter((command) => command.kind === "answer"),
    ).toHaveLength(1);
    expect(
      view.commands.filter((command) => command.kind === "start"),
    ).toHaveLength(0);
    await act(async () => {
      await view.owner.act("start");
    });
    expect(view.owner.getSnapshot()?.phase).toBe("ready");
    // A new connection owns new requests. The prior frozen intent belongs in
    // Main's durable AnswerHistory, not an editable alias under the reused ID.
    expect(
      view.commands.find((command) => command.kind === "answer"),
    ).toMatchObject({
      kind: "answer",
      connectionGeneration: view.generation,
      answer: {
        kind: "ask",
        answers: [
          { id: "first", selectedOptions: ["方案甲"] },
          {
            id: "second",
            selectedOptions: [],
            customInput: "  中文半写草稿  ",
          },
        ],
      },
    });
    await act(async () => {
      expect(await view.owner.submitAsk("rich", "dock", oldRich)).toBeNull();
      expect(
        await view.owner.answerFromEditor(
          "independent",
          { kind: "value", value: "迟到回答" },
          "timeline",
          oldIndependent,
        ),
      ).toBeNull();
      view.owner.editAnswerDraft(
        "independent",
        { value: "旧回调" },
        "timeline",
        oldIndependent,
      );
    });
    expect(view.owner.interactionDraft("independent")?.value).toBe("");
    expect(
      view.commands.filter((command) => command.kind === "answer"),
    ).toHaveLength(1);
  } finally {
    await view.cleanup();
  }
});
