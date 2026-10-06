// @vitest-environment happy-dom
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import type {
  AttentionBridge,
  AttentionSnapshot,
} from "../../contracts/attention";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { createAppRouting } from "../routing/router";
import { AppModel } from "../wiring/model";
import {
  AttentionCenter,
  AttentionPreferences,
  ThreadAttention,
} from "./attention";

import { ConversationVisibilityContext } from "./layout/conversation-visibility";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  vi.restoreAllMocks();
});
async function mount(hidden = false) {
  const reveal = vi.fn();
  const first = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/a",
    revision: 0,
    text: "keep",
  });
  const second = DraftSchema.parse({
    ...first,
    threadId: crypto.randomUUID(),
    directory: "/b",
  });
  let active = first;
  let selectionGate: Promise<void> | undefined;
  let receive: (snapshot: AttentionSnapshot) => void = () => {};
  let snapshot: AttentionSnapshot = {
    instanceId: crypto.randomUUID(),
    revision: 1,
    entries: [
      {
        threadId: second.threadId,
        eventId: crypto.randomUUID(),
        traceId: crypto.randomUUID(),
        kind: "needs-answer",
        unread: true,
      },
    ],
    preferences: { system: false, completion: false },
    system: "disabled",
    coverageGap: false,
    openRequest: null,
  };
  const request = vi.fn<AttentionBridge["request"]>(async (command) => {
    if (
      command.kind === "visible" &&
      command.threadId === active.threadId &&
      document.hasFocus()
    )
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        entries: snapshot.entries.map((entry) =>
          entry.threadId === command.threadId
            ? { ...entry, unread: false }
            : entry,
        ),
      };
    if (command.kind === "preferences")
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        preferences: command.value,
      };
    if (command.kind === "seen")
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        entries: snapshot.entries.map((entry) =>
          entry.eventId === command.eventId
            ? { ...entry, unread: false }
            : entry,
        ),
      };
    if (command.kind === "opened")
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        openRequest: null,
      };
    return { kind: "snapshot", traceId: command.traceId, snapshot };
  });
  const attention: AttentionBridge = {
    request,
    subscribe: (listener) => {
      receive = listener;
      return () => {};
    },
  };
  const bridge: DesktopBridge = {
    attention,
    request: async (command) => {
      if (command.kind === "list-threads")
        return parseDesktopReply(command, {
          kind: "threads",
          threads: [first, second],
        });
      if (command.kind === "select-thread") {
        await selectionGate;
        active = command.threadId === first.threadId ? first : second;
      }
      if (command.kind === "restore" || command.kind === "select-thread")
        return parseDesktopReply(command, {
          kind: "ready",
          draft: active,
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
  await model.attention.start();
  let composing = false;
  if (!model.controller) throw Error("missing controller");
  model.attachEditorBoundary(model.controller, {
    freeze: () => !composing,
    release: () => {},
  });
  const routing = createAppRouting(model);
  const disconnect = routing.connect();
  await routing.router.load();
  // Render the actual attention controls within the production router context.
  // The root test route avoids unrelated editors while navigation still goes
  // through the real model/history admission in createAppRouting.
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const contextRouter = createRouter({
    routeTree: createRootRoute({
      component: () =>
        createElement(I18nProvider, {
          initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
          children: createElement(
            ConversationVisibilityContext,
            { value: { visible: !hidden, reveal } },
            createElement(AttentionCenter, { model }),
            createElement(AttentionPreferences, { model }),
            createElement(ThreadAttention, {
              model,
              threadId: second.threadId,
            }),
          ),
        }),
    }),
    history: createMemoryHistory(),
    context: { model },
  });
  // Controls use the production router directly; a thin root component is
  // installed into its current matched route, leaving its real admission intact.
  const original = routing.router.routesById.__root__.options.component;
  const component = contextRouter.routesById.__root__.options.component;
  if (!component) throw Error("missing test root component");
  routing.router.routesById.__root__.options.component = component;
  await act(async () => {
    root.render(createElement(RouterProvider, { router: routing.router }));
  });
  cleanup.push(async () => {
    await act(async () => root.unmount());
    if (original)
      routing.router.routesById.__root__.options.component = original;
    else delete routing.router.routesById.__root__.options.component;
    disconnect();
    routing.dispose();
    model.dispose();
    host.remove();
  });
  return {
    model,
    request,
    reveal,
    first,
    second,
    host,
    router: routing.router,
    holdSelection: () => {
      let release = () => {};
      selectionGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        selectionGate = undefined;
        release();
      };
    },
    setComposing: (value: boolean) => {
      composing = value;
    },
    emit: async (value: Partial<AttentionSnapshot>) => {
      snapshot = { ...snapshot, ...value, revision: snapshot.revision + 1 };
      await act(async () => receive(snapshot));
    },
    snapshot: () => snapshot,
    click: async (selector: string) => {
      const button = host.querySelector<HTMLButtonElement>(selector);
      expect(button).not.toBeNull();
      await act(async () => button?.click());
    },
  };
}
it("background event preserves focus and selection; click respects IME admission and exposes retry", async () => {
  const ui = await mount();
  const input = document.createElement("input");
  ui.host.append(input);
  input.focus();
  await ui.emit({ coverageGap: true });
  expect(document.activeElement).toBe(input);
  expect(ui.model.controller?.getTextSnapshot()).toBe("keep");
  ui.setComposing(true);
  await ui.click(`[data-attention-open='${ui.second.threadId}']`);
  expect(ui.host.textContent).toContain("尚未切换 Thread");
  expect(ui.model.attention.locationStore.getState().target).toBeNull();
  ui.setComposing(false);
  await ui.click("[data-attention-retry]");
  expect(ui.model.getSnapshot()).toMatchObject({
    threadSelection: { thread: { context: { threadId: ui.second.threadId } } },
  });
  expect(ui.model.attention.locationStore.getState().target?.threadId).toBe(
    ui.second.threadId,
  );
});

it("retains unread when Main selection changes before the visible route commits", async () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const ui = await mount();
  const request = ui.request.getMockImplementation();
  if (!request) throw Error("Missing fixture bridge");
  const visiblePaths: string[] = [];
  ui.request.mockImplementation(async (command) => {
    if (command.kind === "visible" && command.threadId === ui.second.threadId)
      visiblePaths.push(ui.router.state.location.pathname);
    return request(command);
  });
  await ui.click(`[data-attention-open='${ui.second.threadId}']`);
  expect(visiblePaths.length).toBeGreaterThan(0);
  expect(
    visiblePaths.every((path) => path === `/threads/${ui.second.threadId}`),
  ).toBe(true);
  expect(ui.snapshot().entries[0]?.unread).toBe(false);
});
it("system and completion preferences require explicit opt-in, supported is not authorization, unread badge is entity-scoped", async () => {
  const ui = await mount();
  const system = ui.host.querySelector<HTMLInputElement>(
    "[data-attention-system]",
  );
  expect(system?.checked).toBe(false);
  expect(ui.host.textContent).toContain("待回答 · 未读");
  await ui.click("[data-attention-system]");
  expect(
    ui.request.mock.calls.some(
      ([command]) =>
        command.kind === "preferences" &&
        command.value.system &&
        !command.value.completion,
    ),
  ).toBe(true);
  await ui.emit({ system: "available" });
  expect(ui.host.textContent).toContain("是否显示由 macOS 权限和系统设置决定");
  expect(
    ui.request.mock.calls.filter(([command]) => command.kind === "seen"),
  ).toHaveLength(0);
});
it("native click before ready can be retried, stale event opens current state without answering", async () => {
  const ui = await mount();
  ui.setComposing(true);
  const id = crypto.randomUUID();
  await ui.emit({
    openRequest: {
      id,
      threadId: ui.second.threadId,
      eventId: crypto.randomUUID(),
    },
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(
    ui.request.mock.calls.some(
      ([command]) => command.kind === "opened" && command.id === id,
    ),
  ).toBe(true);
  expect(ui.host.querySelector("[data-attention-retry]")).not.toBeNull();
  ui.setComposing(false);
  await ui.click("[data-attention-retry]");
  expect(ui.host.textContent).toContain("这条提醒已过期");
  expect(ui.model.attention.locationStore.getState().target?.eventId).toBe(
    ui.snapshot().entries[0]?.eventId,
  );
});
it("only an actually focused current Thread can be seen; a list row or background notification cannot", async () => {
  const ui = await mount();
  vi.spyOn(document, "hasFocus").mockReturnValue(false);
  await ui.click(`[data-attention-open='${ui.second.threadId}']`);
  expect(
    ui.request.mock.calls.filter(([command]) => command.kind === "seen"),
  ).toHaveLength(0);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(
    ui.request.mock.calls.filter(([command]) => command.kind === "seen"),
  ).toHaveLength(1);
  expect(ui.host.textContent).not.toContain("待回答 · 未读");
});

it("retains a native open arriving during another navigation as an explicit retry", async () => {
  const ui = await mount();
  const release = ui.holdSelection();
  const button = ui.host.querySelector<HTMLButtonElement>(
    `[data-attention-open='${ui.second.threadId}']`,
  );
  await act(async () => button?.click());
  const id = crypto.randomUUID();
  await ui.emit({
    openRequest: {
      id,
      threadId: ui.first.threadId,
      eventId: crypto.randomUUID(),
    },
  });
  await act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(
    ui.request.mock.calls.some(
      ([command]) => command.kind === "opened" && command.id === id,
    ),
  ).toBe(true);
  expect(ui.host.querySelector("[data-attention-retry]")).not.toBeNull();
  await ui.click("[data-attention-retry]");
  expect(ui.model.getSnapshot()).toMatchObject({
    threadSelection: { thread: { context: { threadId: ui.first.threadId } } },
  });
});

it("failed Thread opens the current submission results pane", async () => {
  const ui = await mount();
  await ui.emit({
    entries: ui
      .snapshot()
      .entries.map((entry) => ({ ...entry, kind: "failed" })),
  });
  await ui.click(`[data-attention-open='${ui.second.threadId}']`);
  expect(ui.router.state.location.search).toMatchObject({
    view: "submissions",
  });
});

it("a changed event during navigation selects the current result view rather than the obsolete failure", async () => {
  const ui = await mount();
  await ui.emit({
    entries: ui
      .snapshot()
      .entries.map((entry) => ({ ...entry, kind: "failed" })),
  });
  const release = ui.holdSelection();
  const button = ui.host.querySelector<HTMLButtonElement>(
    `[data-attention-open='${ui.second.threadId}']`,
  );
  await act(async () => button?.click());
  await ui.emit({
    entries: ui.snapshot().entries.map((entry) => ({
      ...entry,
      eventId: crypto.randomUUID(),
      kind: "completed",
    })),
  });
  await act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(ui.router.state.location.search).toMatchObject({
    view: "conversation",
  });
  expect(ui.model.attention.locationStore.getState().target?.kind).toBe(
    "completed",
  );
  expect(ui.host.textContent).toContain("这条提醒已过期");
});

it("clears visible attention while a Thread selection is pending and restores the committed Thread", async () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const ui = await mount();
  await act(async () => {
    await ui.router.navigate({
      to: "/threads/$threadId",
      params: { threadId: ui.first.threadId },
    });
  });
  const visible = () =>
    ui.request.mock.calls
      .filter(([command]) => command.kind === "visible")
      .at(-1)?.[0];
  expect(visible()).toMatchObject({
    kind: "visible",
    threadId: ui.first.threadId,
  });
  const release = ui.holdSelection();
  const navigation = ui.router.navigate({
    to: "/threads/$threadId",
    params: { threadId: ui.second.threadId },
  });
  try {
    await act(async () => {
      await Promise.resolve();
    });
    expect(ui.model.getSnapshot()).toMatchObject({
      threadTransition: "pending",
    });
    expect(visible()).toMatchObject({ kind: "visible", threadId: null });
    await act(async () => {
      release();
      await navigation;
    });
    expect(visible()).toMatchObject({
      kind: "visible",
      threadId: ui.second.threadId,
    });
  } finally {
    release();
    await act(async () => {
      await navigation;
    });
  }
});

it("hidden settings never mark the current unread attention as seen", async () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const ui = await mount(true);
  await act(async () =>
    ui.router.navigate({
      to: "/threads/$threadId",
      params: { threadId: ui.first.threadId },
      search: { view: "conversation" },
    }),
  );
  const entry = {
    ...ui.snapshot().entries[0]!,
    threadId: ui.first.threadId,
    unread: true,
  };
  await ui.emit({ entries: [entry] });
  expect(ui.snapshot().entries[0]?.unread).toBe(true);
  expect(
    ui.request.mock.calls.some(
      ([c]) => c.kind === "seen" && c.eventId === entry.eventId,
    ),
  ).toBe(false);
  expect(
    ui.request.mock.calls.filter(([c]) => c.kind === "visible").at(-1)?.[0],
  ).toMatchObject({ threadId: null });
});
it("accepted notification intent reveals the same current conversation before locating", async () => {
  const ui = await mount(true);
  const entry = {
    ...ui.snapshot().entries[0]!,
    threadId: ui.first.threadId,
    unread: true,
  };
  await ui.emit({
    entries: [entry],
    openRequest: {
      id: crypto.randomUUID(),
      threadId: entry.threadId,
      eventId: entry.eventId,
    },
  });
  await vi.waitFor(() => expect(ui.reveal).toHaveBeenCalledOnce());
  expect(ui.model.attention.locationStore.getState().target?.threadId).toBe(
    ui.first.threadId,
  );
});
