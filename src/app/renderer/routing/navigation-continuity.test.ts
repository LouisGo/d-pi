// @vitest-environment happy-dom

import { RouterProvider } from "@tanstack/react-router";
import type { Editor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  type RuntimeBridge,
  type RuntimeView,
  SubmissionReceiptSchema,
} from "../../../modules/execution/contracts/public";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { AppModel } from "../wiring/model";
import { createAppRouting } from "./router";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose();
  vi.unstubAllGlobals();
});
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function fixture(withFailedReceipt = false, runtime?: RuntimeBridge) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const first = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture/first",
    revision: 0,
    text: "first draft",
  });
  const second = DraftSchema.parse({
    ...first,
    threadId: crypto.randomUUID(),
    directory: "/fixture/second",
    text: "second draft",
  });
  const drafts = new Map([
    [first.threadId, first],
    [second.threadId, second],
  ]);
  let selected = first.threadId;
  let uncertain = false;
  const failedReceipt = SubmissionReceiptSchema.parse({
    submissionId: crypto.randomUUID(),
    threadId: first.threadId,
    traceId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    revision: 0,
    text: "failed request",
    target: {
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: crypto.randomUUID(),
      configContextId: "fixture",
      nativeSessionRef: "fixture",
    },
    state: "acknowledged",
    acknowledgedAt: "2026-10-06T00:00:00Z",
    createdAt: "2026-10-06T00:00:00Z",
    updatedAt: "2026-10-06T00:00:00Z",
    outcome: "failed",
  });
  const bridge: DesktopBridge = {
    ...(runtime ? { runtime } : {}),
    ...(withFailedReceipt
      ? {
          submission: {
            request: vi.fn(async () => ({
              kind: "list" as const,
              receipts: [failedReceipt],
            })),
            subscribe: () => () => {},
          },
        }
      : {}),
    request: async (command) => {
      if (
        uncertain &&
        (command.kind === "select-thread" || command.kind === "restore")
      )
        throw Error("lost selection receipt");
      if (command.kind === "list-threads")
        return parseDesktopReply(command, {
          kind: "threads",
          threads: [...drafts.values()],
        });
      if (command.kind === "select-thread") selected = command.threadId;
      if (command.kind === "restore" || command.kind === "select-thread")
        return parseDesktopReply(command, {
          kind: "ready",
          draft: drafts.get(selected),
          directoryAvailable: true,
          preferences: { theme: "light", density: "normal", locale: "system" },
        });
      throw Error("unexpected command");
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const model = new AppModel(bridge);
  await model.start();
  const routing = createAppRouting(model);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const disconnect = routing.connect();
  await act(async () => {
    root.render(
      createElement(I18nProvider, {
        initialSnapshot: { preference: "system", resolvedLocale: "en-US" },
        children: createElement(RouterProvider, { router: routing.router }),
      }),
    );
  });
  await act(async () => {
    await routing.router.load();
  });
  cleanup.push(async () => {
    await act(() => root.unmount());
    disconnect();
    routing.dispose();
    model.dispose();
    container.remove();
  });
  return {
    first,
    second,
    model,
    router: routing.router,
    container,
    failedReceipt,
    loseSelection: () => {
      uncertain = true;
    },
  };
}

it("keeps the application shell visible and mounted while a Thread route waits for readiness", async () => {
  const input = await fixture();
  const shell = input.container.querySelector<HTMLElement>(".app-shell");
  const toolbar = input.container.querySelector(".toolbar");
  expect(shell).not.toBeNull();
  const gate = deferred();
  const route = input.router.routesById["/threads/$threadId"];
  const beforeLoad = route.options.beforeLoad;
  route.options.beforeLoad = () => gate.promise;
  route.update({ pendingMinMs: 0 });
  let navigation: Promise<void> | undefined;
  await act(async () => {
    navigation = input.router.navigate({
      to: "/threads/$threadId",
      params: { threadId: input.second.threadId },
      search: { view: "conversation" },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  try {
    expect(shell?.isConnected).toBe(true);
    expect(shell?.style.display).not.toBe("none");
    expect(input.container.querySelector(".toolbar")).toBe(toolbar);
  } finally {
    await act(async () => {
      gate.resolve();
      await navigation;
    });
    if (beforeLoad) route.options.beforeLoad = beforeLoad;
    else delete route.options.beforeLoad;
  }
  expect(input.container.querySelector(".app-shell")).toBe(shell);
  expect(input.container.querySelector(".tiptap")?.textContent).toBe(
    "second draft",
  );
});

it("opens a failed attention receipt in readable space, preserves the editor and restores controls for a pending interaction", async () => {
  const input = await fixture(true);
  const editor = input.container.querySelector(".tiptap");
  await act(() =>
    input.router.navigate({
      to: "/threads/$threadId",
      params: { threadId: input.first.threadId },
      search: { view: "submissions" },
    }),
  );
  const entry = {
    threadId: input.first.threadId,
    eventId: crypto.randomUUID(),
    traceId: input.failedReceipt.traceId,
    kind: "failed" as const,
    unread: true,
  };
  const receipt = input.container.querySelector<HTMLElement>(
    `[data-attention-receipt-trace="${entry.traceId}"]`,
  );
  expect(receipt).not.toBeNull();
  if (receipt) receipt.scrollIntoView = vi.fn();
  await act(() => input.model.attention.locate(entry));
  await act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  expect(
    input.container
      .querySelector(".thread-workspace")
      ?.getAttribute("data-reading-focus"),
  ).toBe("true");
  expect(receipt?.closest("details")?.open).toBe(true);
  expect(document.activeElement).toBe(receipt);
  expect(input.container.querySelector(".tiptap")).toBe(editor);
  expect(editor?.textContent).toBe("first draft");
  const restore = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Restore controls",
  );
  await act(() => restore?.click());
  expect(
    input.container.querySelector(".composer")?.hasAttribute("hidden"),
  ).toBe(false);
  await act(() =>
    input.model.attention.locate({ ...entry, eventId: crypto.randomUUID() }),
  );
  await act(() =>
    input.model.attention.locate({ ...entry, traceId: crypto.randomUUID() }),
  );
  expect(
    input.container
      .querySelector(".thread-workspace")
      ?.getAttribute("data-reading-focus"),
  ).toBe("false");
  await act(() =>
    input.model.attention.locate({ ...entry, kind: "needs-answer" }),
  );
  expect(
    input.container
      .querySelector(".thread-workspace")
      ?.getAttribute("data-reading-focus"),
  ).toBe("false");
  expect(input.container.querySelector(".tiptap")).toBe(editor);
});

it("retains the frozen source workspace until the confirmed target route can replace it", async () => {
  const input = await fixture();
  const editor = input.container.querySelector(".tiptap");
  const gate = deferred();
  const route = input.router.routesById["/threads/$threadId"];
  const beforeLoad = route.options.beforeLoad;
  route.options.beforeLoad = () => gate.promise;
  let navigation: Promise<void> | undefined;
  await act(async () => {
    navigation = input.router.navigate({
      to: "/threads/$threadId",
      params: { threadId: input.second.threadId },
      search: { view: "conversation" },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  try {
    expect(input.model.controller?.getTextSnapshot()).toBe("second draft");
    expect(input.router.state.resolvedLocation?.pathname).toBe(
      `/threads/${input.first.threadId}`,
    );
    expect(input.container.querySelector(".tiptap")).toBe(editor);
    expect(editor?.isConnected).toBe(true);
    expect(
      input.container.querySelector(".thread-workspace")?.hasAttribute("inert"),
    ).toBe(true);
    expect(
      input.container
        .querySelector(".thread-workspace")
        ?.getAttribute("aria-busy"),
    ).toBe("true");
    expect(input.container.textContent).not.toContain("second draft");
  } finally {
    await act(async () => {
      gate.resolve();
      await navigation;
    });
    if (beforeLoad) route.options.beforeLoad = beforeLoad;
    else delete route.options.beforeLoad;
  }
  expect(input.container.querySelector(".tiptap")?.textContent).toBe(
    "second draft",
  );
  expect(
    input.container.querySelector(".thread-workspace")?.hasAttribute("inert"),
  ).toBe(false);
});

it("restores each Thread's reading position on return without sharing scroll between Threads", async () => {
  const input = await fixture();
  const pane = () =>
    input.container.querySelector<HTMLElement>(".reading-pane");
  const select = (threadId: typeof input.first.threadId) =>
    act(async () => {
      await input.router.navigate({
        to: "/threads/$threadId",
        params: { threadId },
        search: { view: "conversation" },
      });
    });
  const firstPane = pane();
  if (!firstPane) throw Error("missing first pane");
  firstPane.scrollTop = 180;
  firstPane.dispatchEvent(new Event("scroll"));
  await select(input.second.threadId);
  expect(pane()?.scrollTop).toBe(0);
  const secondPane = pane();
  if (!secondPane) throw Error("missing second pane");
  secondPane.scrollTop = 95;
  secondPane.dispatchEvent(new Event("scroll"));
  await select(input.first.threadId);
  expect(pane()?.scrollTop).toBe(180);
  await select(input.second.threadId);
  expect(pane()?.scrollTop).toBe(95);
});

it("removes the retained workspace when authoritative selection becomes unknown", async () => {
  const input = await fixture();
  const shell = input.container.querySelector(".app-shell");
  input.loseSelection();
  await act(async () => {
    await input.router.navigate({
      to: "/threads/$threadId",
      params: { threadId: input.second.threadId },
      search: { view: "conversation" },
    });
  });
  expect(input.model.getSnapshot()).toMatchObject({
    threadTransition: "unknown",
  });
  expect(input.router.state.location.pathname).toBe(
    `/threads/${input.first.threadId}`,
  );
  expect(input.container.querySelector(".app-shell")).toBe(shell);
  expect(input.container.querySelector(".thread-workspace")).toBeNull();
});

it("does not replace a reading position with the hidden viewport's zero coordinate", async () => {
  const input = await fixture();
  const pane = input.container.querySelector<HTMLElement>(".reading-pane");
  if (!pane) throw Error("missing reading pane");
  // happy-dom has no layout. Chromium reports zero for a hidden viewport;
  // model this DOM boundary, as observed by the packaged Electron regression.
  let visibleTop = 180;
  Object.defineProperty(pane, "scrollTop", {
    get: () => (pane.hidden ? 0 : visibleTop),
    set: (value: number) => {
      visibleTop = value;
    },
  });
  pane.dispatchEvent(new Event("scroll"));
  for (const view of ["files", "conversation"] as const) {
    await act(async () => {
      await input.router.navigate({
        to: "/threads/$threadId",
        params: { threadId: input.first.threadId },
        search: { view },
        replace: true,
      });
    });
  }
  expect(pane.scrollTop).toBe(180);
});

it("restores the requested position after Composer mounting finalizes the reading viewport", async () => {
  const input = await fixture();
  let range = 1000;
  const positions = new WeakMap<HTMLElement, number>();
  const getter = vi
    .spyOn(HTMLElement.prototype, "scrollTop", "get")
    .mockImplementation(function (this: HTMLElement) {
      return positions.get(this) ?? 0;
    });
  const setter = vi
    .spyOn(HTMLElement.prototype, "scrollTop", "set")
    .mockImplementation(function (this: HTMLElement, top: number) {
      positions.set(this, Math.min(top, range));
      if (range === 100 && top === 180)
        requestAnimationFrame(() => {
          range = 1000;
        });
    });
  try {
    const pane = () =>
      input.container.querySelector<HTMLElement>(".reading-pane");
    const select = (threadId: typeof input.first.threadId) =>
      act(async () => {
        await input.router.navigate({
          to: "/threads/$threadId",
          params: { threadId },
          search: { view: "conversation" },
        });
      });
    const first = pane();
    if (!first) throw Error("missing reading pane");
    first.scrollTop = 180;
    first.dispatchEvent(new Event("scroll"));
    await select(input.second.threadId);
    // A native viewport can initially be shorter before the Composer mounts.
    range = 100;
    await select(input.first.threadId);
    await act(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    expect(pane()?.scrollTop).toBe(180);
  } finally {
    getter.mockRestore();
    setter.mockRestore();
  }
});

it("focuses reading without remounting the draft editor or reading pane and restores controls", async () => {
  const input = await fixture();
  const pane = input.container.querySelector<HTMLElement>(".reading-pane");
  const editorElement = input.container.querySelector<
    HTMLElement & { editor: Editor }
  >(".tiptap");
  if (!editorElement || !pane) throw Error("missing work content");
  const editor = editorElement.editor;
  await act(() => editor.commands.setTextSelection({ from: 2, to: 6 }));
  pane.scrollTop = 120;
  pane.dispatchEvent(new Event("scroll"));
  const focus = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Focus reading",
  );
  expect(focus).toBeDefined();
  await act(() => focus?.click());
  expect(
    input.container
      .querySelector(".thread-workspace")
      ?.getAttribute("data-reading-focus"),
  ).toBe("true");
  expect(input.container.querySelector(".tiptap")).toBe(editorElement);
  expect(input.container.querySelector(".reading-pane")).toBe(pane);
  expect(editor.isDestroyed).toBe(false);
  const restore = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Restore controls",
  );
  await act(() => restore?.click());
  expect(
    input.container
      .querySelector(".thread-workspace")
      ?.getAttribute("data-reading-focus"),
  ).toBe("false");
  expect(editor.state.selection.from).toBe(2);
  expect(editor.state.selection.to).toBe(6);
  expect(editor.getText()).toBe("first draft");
  expect(pane.scrollTop).toBe(120);
});

it("locates a pending interaction after a delayed inspect without stealing focus on later runtime samples", async () => {
  const gate = deferred();
  let hold = false;
  let latest: RuntimeView | null = null;
  const listeners = new Set<(view: RuntimeView) => void>();
  const input = await fixture(false, {
    request: async ({ threadId, traceId }) => {
      if (hold) await gate.promise;
      latest = {
        threadId,
        traceId,
        configuration: { code: "runtime.configDefault" },
        revision: 1,
        phase: "ready",
        trusted: true,
        busy: hold,
        model: "fixture",
        message: { code: "runtime.readyToSend" },
        ...(hold
          ? {
              interactions: {
                connectionGeneration: crypto.randomUUID(),
                unsupported: false,
                items: [
                  {
                    id: "delayed-question",
                    method: "confirm",
                    title: "Delayed question",
                    status: "pending",
                    expiresAt: null,
                  },
                ],
              },
            }
          : {}),
      };
      return { kind: "view", view: latest };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  hold = true;
  await act(() =>
    input.router.navigate({
      to: "/threads/$threadId",
      params: { threadId: input.second.threadId },
      search: { view: "conversation" },
    }),
  );
  await act(() =>
    input.model.attention.locate({
      threadId: input.second.threadId,
      eventId: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      kind: "needs-answer",
      unread: true,
    }),
  );
  await act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  expect(
    input.container.querySelector("[data-attention-target=interaction]"),
  ).toBeNull();
  await act(async () => {
    gate.resolve();
    await gate.promise;
  });
  await act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  const interaction = input.container.querySelector(
    "[data-attention-target=interaction]",
  );
  expect(interaction).not.toBeNull();
  expect(document.activeElement).toBe(interaction);
  const editor = input.container.querySelector<HTMLElement>(".tiptap");
  editor?.focus();
  await act(() => {
    if (latest)
      for (const listener of listeners)
        listener({ ...latest, revision: 2, busy: false });
  });
  await act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  expect(document.activeElement).toBe(editor);
});

it("opens Thread tools as a dialog and preserves the editor and panes after closing", async () => {
  const input = await fixture();
  const trigger = input.container.querySelector<HTMLButtonElement>(
    "[data-thread-tools-trigger]",
  );
  expect(trigger).not.toBeNull();
  expect(document.querySelector(".ui-modal:not([hidden])")).toBeNull();
  const editor = input.container.querySelector(".tiptap");
  const panes = [...input.container.querySelectorAll(".reading-pane")];
  await act(() => trigger?.click());
  expect(document.querySelector(".ui-modal")?.getAttribute("role")).toBe(
    "dialog",
  );
  expect(document.querySelector(".ui-modal .thread-setup")).not.toBeNull();
  await act(() =>
    document
      .querySelector<HTMLButtonElement>(".ui-modal-header button")
      ?.click(),
  );
  expect(input.container.querySelector(".tiptap")).toBe(editor);
  expect([...input.container.querySelectorAll(".reading-pane")]).toEqual(panes);
  expect(editor?.textContent).toBe("first draft");
});

it("discloses healthy runtime inspection without hiding Stop when execution becomes active", async () => {
  let receive: ((view: RuntimeView) => void) | undefined;
  let latest: RuntimeView | undefined;
  const commands: string[] = [];
  const input = await fixture(false, {
    request: async ({ kind, threadId, traceId }) => {
      commands.push(kind);
      latest = {
        threadId,
        traceId,
        connectionGeneration: crypto.randomUUID(),
        revision: 1,
        phase: "ready",
        trusted: true,
        busy: false,
        model: "fixture",
        configuration: { code: "runtime.configDefault" },
        message: { code: "runtime.readyToSend" },
      };
      return { kind: "view", view: latest };
    },
    subscribe: (listener) => {
      receive = listener;
      return () => {
        receive = undefined;
      };
    },
  });
  expect(input.container.querySelector(".runtime-panel")).toBeNull();
  const editor = input.container.querySelector(".tiptap");
  const tools = input.container.querySelector<HTMLButtonElement>(
    "[data-thread-tools-trigger]",
  );
  if (!tools) throw Error("missing tools");
  await act(() => tools.click());
  expect(
    document.querySelector(".ui-modal [data-runtime-inspector]"),
  ).not.toBeNull();
  expect(input.container.querySelector(".runtime-panel")).toBeNull();
  await act(() =>
    document
      .querySelector<HTMLButtonElement>(".ui-modal-header button")
      ?.click(),
  );
  expect(input.container.querySelector(".runtime-panel")).toBeNull();
  if (!latest || !receive) throw Error("missing runtime observation");
  const busy: RuntimeView = {
    ...latest,
    revision: 2,
    busy: true,
    control: {
      pendingAsync: false,
      admitted: true,
      paused: false,
      stopping: false,
      streaming: true,
      compacting: false,
      queued: 0,
      background: 0,
      queue: [],
    },
  };
  await act(() => receive?.(busy));
  const stop = [
    ...input.container.querySelectorAll<HTMLButtonElement>(
      ".runtime-panel button",
    ),
  ].find((button) => button.textContent === "Stop and pause queue");
  expect(stop).toBeDefined();
  expect(document.querySelector(".ui-modal:not([hidden])")).toBeNull();
  await act(() => stop?.click());
  expect(commands.filter((command) => command === "stop")).toHaveLength(1);
  expect(input.container.querySelector(".tiptap")).toBe(editor);
});
