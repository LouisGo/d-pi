// @vitest-environment happy-dom

import { act, type ComponentType, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { ConversationEvent } from "../../../modules/conversation/contracts/public";
import type { RuntimeView } from "../../../modules/execution/contracts/public";
import {
  captureSelection,
  type FrozenSelection,
} from "../../../modules/files/core/public";
import type { CodeView } from "../../../modules/files/renderer/public";
import { DraftSchema } from "../../../modules/input/contracts/public";
import type {
  LocaleBridge,
  Preferences,
} from "../../../modules/preferences/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { createI18n } from "../../../shared/i18n/create-i18n";
import type {
  AttentionBridge,
  AttentionSnapshot,
} from "../../contracts/attention";
import {
  type Command,
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { failure } from "../../contracts/failure";
import { App } from "../app";
import { AppModel } from "../wiring/model";

// Render the real App and its Zustand subscriptions. Replace only the slow
// business views, so their render counts reveal ancestor-driven fan-out.
const views = vi.hoisted(() => ({
  conversation: vi.fn(),
  history: vi.fn(),
  submissions: vi.fn(),
  runtime: vi.fn(),
  composer: vi.fn(),
  files: vi.fn(),
}));
const shell = vi.hoisted(() => ({ folder: vi.fn() }));
vi.mock("@/components/icons/common", async (original) => {
  const icons = await original<typeof import("../components/icons/common")>();
  return {
    ...icons,
    FolderIcon: () => {
      shell.folder();
      return createElement(icons.FolderIcon);
    },
  };
});
type Selection = Extract<FrozenSelection, { kind: "selection" }>;
type Attachment = { id: string; threadId: string; selection: Selection };
const attachmentBridge = vi.hoisted(() => {
  const value: {
    attach: ((selection: Selection) => void) | null;
    applied: ((id: string) => void) | null;
    current: Attachment | null;
  } = { attach: null, applied: null, current: null };
  return value;
});
vi.mock("../reading/conversation", () => ({
  Conversation: (props: unknown) => {
    views.conversation(props);
    return null;
  },
}));
vi.mock("../reading/saved-conversation", () => ({
  SavedConversation: (props: unknown) => {
    views.conversation(props);
    return null;
  },
}));
vi.mock("../reading/history", () => ({
  History: (props: unknown) => {
    views.history(props);
    return null;
  },
}));
vi.mock("../reading/submissions", () => ({
  Submissions: (props: unknown) => {
    views.submissions(props);
    return null;
  },
}));
vi.mock("../workbench/runtime-panel", () => ({
  RuntimeInspection: () => null,
  RuntimePanel: (props: unknown) => {
    views.runtime(props);
    return null;
  },
}));
vi.mock("../workbench/composer", () => ({
  Composer: (props: {
    selectionAttachment?: Attachment | null;
    onAttachmentApplied?: (id: string) => void;
  }) => {
    views.composer(props);
    attachmentBridge.current = props.selectionAttachment ?? null;
    attachmentBridge.applied = props.onAttachmentApplied ?? null;
    return null;
  },
}));
vi.mock("../workbench/file-panel", () => ({
  FilePanel: (props: { onAttach: (selection: Selection) => void }) => {
    views.files(props);
    attachmentBridge.attach = props.onAttach;
    return null;
  },
}));

const mounted: { root: Root; container: HTMLElement; model: AppModel }[] = [];
const i18n = createI18n("en-US");
afterEach(async () => {
  for (const { root, container, model } of mounted.splice(0)) {
    await act(() => root.unmount());
    model.dispose();
    container.remove();
  }
  for (const view of Object.values(views)) view.mockClear();
  shell.folder.mockClear();
  attachmentBridge.current = null;
  attachmentBridge.attach = null;
  attachmentBridge.applied = null;
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.density;
  vi.unstubAllGlobals();
});

async function setup({
  start = true,
  restoreFails = false,
  empty = false,
  attention,
}: {
  start?: boolean;
  restoreFails?: boolean;
  empty?: boolean;
  attention?: AttentionBridge;
} = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture/first",
    revision: 0,
    text: "a saved draft",
  });
  let preferences: Preferences = {
    theme: "light",
    density: "normal",
    locale: "system",
  };
  let pending:
    | {
        command: Extract<Command, { kind: "preferences" }>;
        resolve: (reply: unknown) => void;
      }
    | undefined;
  let pendingChoice: ((reply: unknown) => void) | undefined;
  let receiveRuntime: (view: RuntimeView) => void = () => {};
  let receiveReading: (event: ConversationEvent) => void = () => {};
  const bridge: DesktopBridge = {
    ...(attention ? { attention } : {}),
    request: async (command) => {
      let reply: unknown;
      if (command.kind === "restore") {
        reply = restoreFails
          ? failure(
              command.traceId,
              "storage-unavailable",
              "draft.storageUnavailable",
            )
          : {
              kind: "ready",
              draft: empty ? null : draft,
              directoryAvailable: true,
              preferences,
            };
      } else if (command.kind === "preferences") {
        reply = await new Promise<unknown>((resolve) => {
          pending = { command, resolve };
        });
      } else if (command.kind === "choose-project") {
        reply = await new Promise<unknown>((resolve) => {
          pendingChoice = resolve;
        });
      } else throw Error("unexpected command");
      return parseDesktopReply(command, reply);
    },
    runtime: {
      request: async ({ threadId, traceId }) => ({
        kind: "view",
        view: {
          threadId,
          traceId,
          configuration: { code: "runtime.configUnknown" },
          revision: 0,
          phase: "browse",
          trusted: false,
          busy: false,
          model: null,
          message: { code: "runtime.configUnknown" },
        },
      }),
      subscribe: (listener) => {
        receiveRuntime = listener;
        return () => {};
      },
    },
    conversation: {
      connect: (_id, listener) => {
        receiveReading = listener;
        return () => {};
      },
    },
    submission: {
      request: async () => ({ kind: "list", receipts: [] }),
      subscribe: () => () => {},
    },
    files: {
      request: async (command) => ({
        kind: "completed",
        operationId: command.operationId,
        traceId: command.traceId,
        reply: { kind: "unavailable", reason: "missing" },
      }),
      cancel: async (command) => ({ kind: "acknowledged", ...command }),
    },
    git: {
      request: async (command) => ({
        kind: "completed",
        operationId: command.operationId,
        traceId: command.traceId,
        reply: { kind: "unavailable", reason: "not-git" },
      }),
      cancel: async (command) => ({ kind: "acknowledged", ...command }),
    },
    history: {
      read: async () => ({ kind: "unavailable", reason: "missing" }),
      projectList: async () => ({
        kind: "catalog",
        sessions: [],
        partial: false,
      }),
      projectRead: async () => ({ kind: "unavailable", reason: "missing" }),
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const model = new AppModel(bridge);
  if (start) await model.start();
  model.threadListStore.setState({
    threads: [1, 2, 3].map((number) => ({
      threadId:
        number === 1
          ? draft.threadId
          : DraftSchema.parse({ ...draft, threadId: crypto.randomUUID() })
              .threadId,
      workingDirectoryId: draft.workingDirectoryId,
      directory: `/fixture/project-${number}`,
    })),
    failed: false,
  });
  let localeListener: Parameters<LocaleBridge["subscribe"]>[0] | undefined;
  const localeBridge: LocaleBridge = {
    snapshot: async () => ({ preference: "system", resolvedLocale: "en-US" }),
    subscribe: (listener) => {
      localeListener = listener;
      return () => {
        localeListener = undefined;
      };
    },
    setPreference: async (preference) => ({
      preference,
      resolvedLocale: preference === "system" ? "en-US" : preference,
      persisted: true,
    }),
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container, model });
  const render = (
    editor?: ComponentType<{
      view: CodeView;
      onSelection: (value: FrozenSelection) => void;
    }>,
  ) =>
    act(async () => {
      root.render(
        createElement(I18nProvider, {
          bridge: localeBridge,
          initialSnapshot: {
            preference: "system",
            resolvedLocale: "en-US",
          },
          children: createElement(App, { model, editor }),
        }),
      );
    });
  await render();
  const button = (label: string): HTMLButtonElement => {
    const node = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (!node) throw Error(`missing button: ${label}`);
    return node;
  };
  return {
    model,
    bridge,
    container,
    button,
    render,
    emitRuntime: (patch: Partial<RuntimeView>) => {
      const current = model.runtime?.getSnapshot();
      if (!current) throw Error("missing runtime");
      receiveRuntime({ ...current, revision: current.revision + 1, ...patch });
    },
    emitReading: (event: ConversationEvent) => receiveReading(event),
    changeLanguage: () =>
      localeListener?.({ preference: "zh-CN", resolvedLocale: "zh-CN" }),
    settle: (failed = false) => {
      if (!pending) throw Error("no pending preference save");
      const { command, resolve } = pending;
      pending = undefined;
      if (failed)
        resolve(
          failure(
            command.traceId,
            "storage-unavailable",
            "draft.storageUnavailable",
          ),
        );
      else {
        preferences = command.value;
        resolve({ kind: "preferences-saved", value: preferences });
      }
    },
    changeThread: () => {
      draft = DraftSchema.parse({
        ...draft,
        threadId: crypto.randomUUID(),
        directory: "/fixture/second",
      });
      return model.start();
    },
    cancelChoice: () => {
      if (!pendingChoice) throw Error("no pending project choice");
      pendingChoice({ kind: "cancelled" });
      pendingChoice = undefined;
    },
  };
}

function renderCounts() {
  return Object.fromEntries(
    Object.entries(views).map(([name, view]) => [name, view.mock.calls.length]),
  );
}

it("places Thread creation and project opening in the sidebar and settings in a modal over mounted work", async () => {
  const fixture = await setup();
  const sidebar = fixture.container.querySelector(".primary-sidebar");
  expect(sidebar?.querySelector("[data-new-thread]")?.textContent).toContain(
    i18n.t("app.toolbar.newThread"),
  );
  expect(
    sidebar?.querySelector(".sidebar-label button")?.getAttribute("aria-label"),
  ).toBe(i18n.t("app.empty.choose"));
  expect(fixture.container.querySelector(".toolbar select")).toBeNull();
  const work = fixture.container.querySelector(".conversation-body");
  const controller = fixture.model.controller;
  await act(() => fixture.button(i18n.t("app.layout.settings")).click());
  const modal = document.querySelector(".ui-settings-modal");
  expect(modal?.getAttribute("role")).toBe("dialog");
  expect(modal?.querySelector("[role=radiogroup]")).not.toBeNull();
  expect(fixture.container.querySelector(".conversation-body")).toBe(work);
  expect(work?.hasAttribute("hidden")).toBe(false);
  expect(fixture.model.controller).toBe(controller);
  const close = modal?.querySelector<HTMLButtonElement>("[aria-label='Close']");
  if (!close) throw Error("missing modal close");
  await act(() => close.click());
  expect(
    document.querySelector(".ui-settings-modal")?.hasAttribute("hidden"),
  ).toBe(true);
});

it("keeps normal controls and Thread views untouched while saving a theme", async () => {
  const fixture = await setup();
  const initial = renderCounts();
  expect(Object.values(initial)).toEqual([1, 1, 1, 1, 1, 1]);
  let saving: Promise<void> | undefined;
  await act(() => {
    saving = fixture.model.preference("theme");
  });
  expect(fixture.button(i18n.t("app.toolbar.darkTheme")).disabled).toBe(false);
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(renderCounts()).toEqual(initial);

  await act(async () => {
    fixture.settle();
    await saving;
  });
  expect(fixture.button(i18n.t("app.toolbar.systemTheme")).disabled).toBe(
    false,
  );
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(renderCounts()).toEqual(initial);
});

it("does not execute sidebar Thread rows for theme or shortcut save busy updates", async () => {
  const fixture = await setup();
  for (const key of ["theme", "sendKey"] as const) {
    const before = shell.folder.mock.calls.length;
    let saving: Promise<void> | undefined;
    await act(() => {
      saving = fixture.model.preference(key);
    });
    const row = fixture.container
      .querySelector<HTMLButtonElement>(".thread-name")
      ?.closest("button");
    // happy-dom does not implement fieldset-inherited :disabled. Chromium's
    // inherited disabled behavior and opacity are checked by the native probe.
    expect(row?.closest("fieldset")?.disabled).toBe(false);
    await act(async () => {
      fixture.settle();
      await saving;
    });
    expect(row?.closest("fieldset")?.disabled).toBe(false);
    // Preference persistence must not disable or re-execute navigation.
    expect(shell.folder.mock.calls.length - before).toBe(0);
  }
});

it("translates controls with one locale repaint while preserving Thread resources and business operations", async () => {
  const fixture = await setup();
  const before = renderCounts();
  const state = fixture.model.getSnapshot();
  const { runtime, submission, conversation, files, git, history } =
    fixture.bridge;
  if (!runtime || !submission || !conversation || !files || !git || !history)
    throw Error("missing business ports");
  const operations = [
    vi.spyOn(fixture.bridge, "request"),
    vi.spyOn(runtime, "request"),
    vi.spyOn(runtime, "subscribe"),
    vi.spyOn(submission, "request"),
    vi.spyOn(submission, "subscribe"),
    vi.spyOn(conversation, "connect"),
    vi.spyOn(files, "request"),
    vi.spyOn(files, "cancel"),
    vi.spyOn(git, "request"),
    vi.spyOn(git, "cancel"),
    vi.spyOn(history, "read"),
    vi.spyOn(history, "projectList"),
    vi.spyOn(history, "projectRead"),
  ];
  const resources = [
    () => views.conversation.mock.calls.at(-1)?.[0].model,
    () => views.conversation.mock.calls.at(-1)?.[0].positions,
    () => views.history.mock.calls.at(-1)?.[0].bridge,
    () => views.history.mock.calls.at(-1)?.[0].positions,
    () => views.history.mock.calls.at(-1)?.[0].threadId,
    () => views.submissions.mock.calls.at(-1)?.[0].model,
    () => views.runtime.mock.calls.at(-1)?.[0].model,
    () => views.composer.mock.calls.at(-1)?.[0].thread,
    () => views.composer.mock.calls.at(-1)?.[0].model,
    () => views.files.mock.calls.at(-1)?.[0].resource,
    () => views.files.mock.calls.at(-1)?.[0].files,
    () => views.files.mock.calls.at(-1)?.[0].git,
  ];
  const previousResources = resources.map((read) => read());
  await act(() => fixture.changeLanguage());
  expect(
    document.querySelector(".thread-tools-content .reading-navigation")
      ?.textContent,
  ).toContain("原生历史");
  // Locale affects each view's chrome. It may repaint once, but cannot replace
  // the owning Thread or re-run its business requests and subscriptions.
  expect(renderCounts()).toEqual(
    Object.fromEntries(
      Object.entries(before).map(([name, count]) => [name, count + 1]),
    ),
  );
  expect(fixture.model.getSnapshot()).toBe(state);
  for (const [index, read] of resources.entries())
    expect(read()).toBe(previousResources[index]);
  for (const operation of operations) expect(operation).not.toHaveBeenCalled();
});

it("does not mutate appearance attributes when only the send shortcut changes", async () => {
  const fixture = await setup();
  const attributes: (string | null)[] = [];
  const observer = new MutationObserver((records) => {
    attributes.push(...records.map((record) => record.attributeName));
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-density"],
  });
  try {
    await act(async () => {
      const saving = fixture.model.preference("sendKey");
      fixture.settle();
      await saving;
    });
    attributes.push(
      ...observer.takeRecords().map((record) => record.attributeName),
    );
    expect(attributes).toEqual([]);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.density).toBeUndefined();
  } finally {
    observer.disconnect();
  }
});

it("ignores legacy density and exposes only the default compact appearance", async () => {
  const fixture = await setup();
  expect(document.documentElement.dataset.density).toBeUndefined();
  expect(fixture.container.textContent).not.toContain(
    i18n.t("app.toolbar.compactDensity"),
  );
  expect(fixture.container.textContent).not.toContain(
    i18n.t("app.toolbar.normalDensity"),
  );
});

it("isolates theme busy and failed-save notices while preserving the previous preference", async () => {
  const fixture = await setup();
  const initial = renderCounts();
  let saving: Promise<void> | undefined;
  await act(() => {
    saving = fixture.model.preference("theme");
  });
  expect(renderCounts()).toEqual(initial);
  await act(async () => {
    fixture.settle(true);
    await saving;
  });
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(fixture.container.querySelector(".notice")?.textContent).toContain(
    i18n.t("draft.storageUnavailable"),
  );
  expect(renderCounts()).toEqual(initial);
  await act(async () => {
    const retry = fixture.model.preference("theme");
    fixture.settle();
    await retry;
  });
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(fixture.container.querySelector(".notice")).toBeNull();
  expect(renderCounts()).toEqual(initial);
});

it("writes only the appearance attribute that changes", async () => {
  const fixture = await setup();
  const attributes: (string | null)[] = [];
  const observer = new MutationObserver((records) => {
    attributes.push(...records.map((record) => record.attributeName));
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-density"],
  });
  try {
    for (const key of ["theme"] as const) {
      await act(async () => {
        const saving = fixture.model.preference(key);
        fixture.settle();
        await saving;
      });
    }
    attributes.push(
      ...observer.takeRecords().map((record) => record.attributeName),
    );
    expect(attributes).toEqual(["data-theme"]);
  } finally {
    observer.disconnect();
  }
});

it("updates the owning Thread resources when the working directory identity changes", async () => {
  const fixture = await setup();
  const previous = fixture.model.controller;
  await act(() => fixture.changeThread());
  const state = fixture.model.getSnapshot();
  if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
    throw Error("missing replacement Thread");
  const { thread } = state.threadSelection;
  expect(thread.controller).not.toBe(previous);
  expect(
    document.querySelector(".thread-tools-content .directory-info")
      ?.textContent,
  ).toContain("/fixture/second");
  expect(views.composer.mock.calls.at(-1)?.[0]).toMatchObject({ thread });
  expect(views.files.mock.calls.at(-1)?.[0]).toMatchObject({
    resource: thread.context,
  });
  expect(views.conversation.mock.calls.at(-1)?.[0]).toMatchObject({
    model: thread.reading,
  });
  expect(views.submissions.mock.calls.at(-1)?.[0]).toMatchObject({
    model: thread.submission,
  });
  expect(views.history.mock.calls.at(-1)?.[0]).toMatchObject({
    threadId: thread.context.threadId,
  });
});

it("consumes an attachment once and prevents old Thread callbacks from populating a replacement composer", async () => {
  const fixture = await setup();
  const selection = captureSelection(
    "exact source",
    { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6 },
    { path: "source.ts", source: "working tree", version: "v1" },
  );
  if (selection.kind !== "selection") throw Error("invalid selection fixture");
  const attach = attachmentBridge.attach;
  if (!attach) throw Error("missing attachment route");
  await act(() => attach(selection));
  const attachment = attachmentBridge.current;
  const applied = attachmentBridge.applied;
  if (!attachment || !applied) throw Error("attachment not delivered");
  const state = fixture.model.getSnapshot();
  if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
    throw Error("missing attachment Thread");
  expect(attachment).toMatchObject({
    threadId: state.threadSelection.thread.context.threadId,
    selection,
  });
  await act(() => applied(attachment.id));
  expect(attachmentBridge.current).toBeNull();
  const calls = views.composer.mock.calls.length;
  await act(() => applied(attachment.id));
  expect(views.composer.mock.calls.length).toBe(calls);

  await act(() => fixture.changeThread());
  expect(attachmentBridge.current).toBeNull();
  await act(() => attach(selection));
  expect(attachmentBridge.current).toBeNull();
});

it("passes a newly loaded editor adapter through without replacing the Thread", async () => {
  const fixture = await setup();
  const controller = fixture.model.controller;
  const editor = () => null;
  await fixture.render(editor);
  expect(views.files.mock.calls.at(-1)?.[0]).toMatchObject({ editor });
  expect(fixture.model.controller).toBe(controller);
});

it("retains loading, repeated failure details and disposal without a root state subscription", async () => {
  const fixture = await setup({ start: false, restoreFails: true });
  expect(fixture.container.textContent).not.toContain(i18n.t("app.loading"));
  await act(() => fixture.model.start());
  expect(fixture.container.textContent).toContain(i18n.t("app.failure.title"));
  const failed = fixture.model.getSnapshot();
  if (failed.kind !== "failed") throw Error("missing startup failure");
  expect(fixture.container.textContent).toContain(failed.error.traceId);
  await act(() => fixture.model.start());
  const retried = fixture.model.getSnapshot();
  if (retried.kind !== "failed") throw Error("missing retry failure");
  expect(retried.error.traceId).not.toBe(failed.error.traceId);
  expect(fixture.container.textContent).toContain(retried.error.traceId);
  expect(fixture.container.textContent).not.toContain(failed.error.traceId);
  await act(() => fixture.model.dispose());
  expect(fixture.container.innerHTML).toBe("");
});

it("freezes the shell for a real pending project choice without dimming each control", async () => {
  const fixture = await setup({ empty: true });
  const choose = () =>
    Array.from(fixture.container.querySelectorAll("button")).find(
      (button) => button.textContent === i18n.t("app.empty.choose"),
    );
  expect(choose()?.disabled).toBe(false);
  let choosing: ReturnType<AppModel["choose"]> | undefined;
  await act(() => {
    choosing = fixture.model.choose();
  });
  expect(choose()?.disabled).toBe(false);
  expect(
    fixture.container.querySelector(".app-shell")?.hasAttribute("inert"),
  ).toBe(true);
  await act(async () => {
    fixture.cancelChoice();
    await choosing;
  });
  expect(choose()?.disabled).toBe(false);
});

it("still updates localized workbench text when the language context changes", async () => {
  const fixture = await setup();
  expect(
    document.querySelector(".thread-tools-content .reading-navigation")
      ?.textContent,
  ).toContain(i18n.t("ui.conversation.heading"));
  await act(() => fixture.button(i18n.t("app.layout.settings")).click());
  const general = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".settings-navigation button"),
  ).find((button) => button.textContent?.trim() === i18n.t("settings.general"));
  await act(() => general?.click());
  const language = document.querySelector<HTMLElement>(
    ".ui-settings-page:not([hidden]) [role=combobox]",
  );
  if (!language) throw Error("missing language selector");
  await act(() => language.click());
  const chinese = Array.from(
    document.querySelectorAll<HTMLElement>("[role=option]"),
  ).find((option) =>
    option.textContent?.includes(i18n.t("app.toolbar.chinese")),
  );
  if (!chinese) throw Error("missing Chinese option");
  await act(async () => chinese.click());
  expect(
    document.querySelector(".thread-tools-content .reading-navigation")
      ?.textContent,
  ).toContain(createI18n("zh-CN").t("ui.conversation.heading"));
});

it("applies a preference receipt to the current App after Thread navigation without cancelling either operation", async () => {
  const fixture = await setup();
  let saving: Promise<void> | undefined;
  await act(() => {
    saving = fixture.model.preference("theme");
  });
  await act(() => fixture.changeThread());
  const selected = fixture.model.controller;
  await act(async () => {
    fixture.settle();
    await saving;
  });
  expect(fixture.model.controller).toBe(selected);
  expect(fixture.model.getSnapshot()).toMatchObject({
    kind: "ready",
    busy: false,
    preferences: { theme: "dark" },
  });
  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("serializes rapid preference changes without blocking navigation or losing earlier fields", async () => {
  const fixture = await setup();
  let theme: Promise<void> | undefined;
  let shortcut: Promise<void> | undefined;
  await act(() => {
    theme = fixture.model.preference("theme");
    shortcut = fixture.model.preference("sendKey");
  });
  expect(fixture.model.getSnapshot()).toMatchObject({
    kind: "ready",
    busy: false,
  });
  await act(async () => {
    fixture.settle();
    await theme;
  });
  expect(document.documentElement.dataset.theme).toBe("dark");
  await act(async () => {
    fixture.settle();
    await shortcut;
  });
  expect(fixture.model.getSnapshot()).toMatchObject({
    preferences: { theme: "dark", sendKey: "enter-newline" },
  });
});

it("does not clear a pending Thread transition when an independent preference save fails", async () => {
  const fixture = await setup();
  let saving: Promise<void> | undefined;
  let choosing: ReturnType<AppModel["choose"]> | undefined;
  await act(() => {
    saving = fixture.model.preference("theme");
    choosing = fixture.model.choose();
  });
  await act(async () => {
    fixture.settle(true);
    await saving;
  });
  expect(fixture.model.getSnapshot()).toMatchObject({
    kind: "ready",
    busy: true,
    threadTransition: "pending",
  });
  await act(async () => {
    fixture.cancelChoice();
    await choosing;
  });
  expect(fixture.model.getSnapshot()).toMatchObject({
    kind: "ready",
    busy: false,
  });
});

it("Main attention samples update only the relevant badge and notice, preserving editor and reading resources", async () => {
  let receive: (snapshot: AttentionSnapshot) => void = () => {};
  let snapshot: AttentionSnapshot = {
    instanceId: crypto.randomUUID(),
    revision: 0,
    entries: [],
    preferences: { system: false, completion: false },
    system: "disabled",
    coverageGap: false,
    openRequest: null,
  };
  const attention: AttentionBridge = {
    subscribe: (listener) => {
      receive = listener;
      return () => {};
    },
    request: async (command) => ({
      kind: "snapshot",
      traceId: command.traceId,
      snapshot,
    }),
  };
  const { model } = await setup({ attention });
  const other = model.threadListStore.getState().threads[1];
  if (!other) throw Error("missing background Thread");
  const counts = Object.fromEntries(
    Object.entries(views).map(([key, view]) => [key, view.mock.calls.length]),
  );
  const controller = model.controller;
  const reading = model.reading;
  snapshot = {
    ...snapshot,
    revision: 1,
    entries: [
      {
        threadId: other.threadId,
        eventId: crypto.randomUUID(),
        traceId: crypto.randomUUID(),
        kind: "needs-answer",
        unread: true,
      },
    ],
  };
  await act(async () => receive(snapshot));
  expect(
    document.querySelector(`[data-attention-thread='${other.threadId}']`)
      ?.textContent,
  ).toContain("Needs an answer");
  for (const [key, view] of Object.entries(views))
    expect(view.mock.calls.length, key).toBe(counts[key]);
  expect(model.controller).toBe(controller);
  expect(model.reading).toBe(reading);
});

it("opens the developer route across the complete workspace and restores the Thread view on return", async () => {
  const fixture = await setup();
  const controller = fixture.model.controller;
  expect(fixture.container.querySelector(".primary-sidebar")).not.toBeNull();
  const tools = fixture.container.querySelector<HTMLButtonElement>(
    "button[aria-label='开发者工具']",
  );
  if (!tools) throw Error("missing tools entry");
  await act(() => tools.click());
  const menu = document.querySelector<HTMLDivElement>("[role='menuitem']");
  if (!menu) throw Error("missing tools option");
  await act(async () => {
    menu.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(
    fixture.container.querySelector("[data-component-dashboard]"),
  ).not.toBeNull();
  expect(
    fixture.container
      .querySelector(".window-frame")
      ?.getAttribute("data-sidebar-visible"),
  ).toBe("false");
  expect(
    fixture.container
      .querySelector(".primary-sidebar")
      ?.closest("[aria-hidden]")
      ?.getAttribute("aria-hidden"),
  ).toBe("true");
  expect(
    fixture.container.querySelector("[data-developer-workspace]"),
  ).not.toBeNull();
  expect(fixture.model.controller).toBe(controller);
  const conversation = fixture.container.querySelector<HTMLButtonElement>(
    "button[aria-label='Back to conversation']",
  );
  if (!conversation) throw Error("missing conversation entry");
  await act(async () => {
    conversation.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(fixture.container.querySelector(".primary-sidebar")).not.toBeNull();
  expect(
    fixture.container.querySelector("[data-component-dashboard]"),
  ).toBeNull();
  expect(fixture.model.controller).toBe(controller);
});

it("shows a fixed navigation dock without a home icon and separates it from conversation status", async () => {
  const fixture = await setup();
  expect(fixture.container.querySelector(".activity-rail")).toBeNull();
  expect(
    fixture.container.querySelector("button[aria-label='Conversation']"),
  ).toBeNull();
  const sidebar = fixture.container.querySelector(".primary-sidebar");
  expect(
    sidebar?.querySelector(".sidebar-actions [aria-label='Settings']"),
  ).not.toBeNull();
  expect(
    sidebar?.querySelector(".sidebar-tools [aria-label='开发者工具']"),
  ).not.toBeNull();
  expect(sidebar?.querySelector(".sidebar-scroll .sidebar-actions")).toBeNull();
  expect(
    fixture.container.querySelector(
      ".window-statusbar [aria-label='Conversation quick preview']",
    ),
  ).not.toBeNull();
  expect(fixture.container.querySelector(".sidebar-bottom")).toBeNull();
});

it("updates real conversation status without rendering the workspace and never counts tools as conversation rounds", async () => {
  const fixture = await setup();
  const generation = crypto.randomUUID();
  const snapshot: ConversationEvent = {
    kind: "snapshot",
    connectionGeneration: generation,
    seq: 0,
    gap: false,
    items: (["user", "assistant", "tool", "notice", "subagent"] as const).map(
      (role, id) => ({
        id,
        role,
        text: "live text",
        state: "complete",
        label: { kind: "literal", text: role },
      }),
    ),
  };
  const before = renderCounts();
  await act(() => {
    fixture.emitRuntime({
      phase: "ready",
      busy: true,
      model: "fixture-model",
      control: {
        pendingAsync: false,
        admitted: true,
        paused: false,
        stopping: false,
        streaming: true,
        compacting: false,
        queued: 3,
        background: 2,
        queue: [],
      },
    });
    fixture.emitReading(snapshot);
  });
  const status = fixture.button("Conversation quick preview");
  expect(status.textContent).toContain("OMP is working");
  expect(status.textContent).toContain("2 messages");
  expect(status.textContent).toContain("3 queued");
  expect(renderCounts()).toEqual(before);
  await act(() => status.click());
  const preview = document.querySelector(".ui-status-preview");
  expect(preview?.textContent).toContain("fixture-model");
  expect(preview?.textContent).toContain("current live window");
  expect(preview?.textContent).not.toContain("tokens");
  await act(() => fixture.emitReading({ ...snapshot, seq: 1, gap: true }));
  expect(preview?.textContent).toContain("synchronization gap");
});

it("clears the prior Thread status and keeps missing metrics distinct from zero", async () => {
  const fixture = await setup();
  await act(() => fixture.emitRuntime({ model: "old-thread-model" }));
  await act(async () => fixture.changeThread());
  await act(() => fixture.button("Conversation quick preview").click());
  const preview = document.querySelector(".ui-status-preview");
  expect(preview?.textContent).not.toContain("old-thread-model");
  expect(preview?.textContent).toContain("Unavailable");
  expect(preview?.textContent).toContain("/fixture/second");
});

it("saves an explicit theme target in one write while keeping Thread resources intact", async () => {
  const fixture = await setup();
  const controller = fixture.model.controller;
  let saving: Promise<void> | undefined;
  await act(() => {
    saving = fixture.model.preference("theme", "system");
  });
  await act(async () => {
    fixture.settle();
    await saving;
  });
  expect(fixture.model.getSnapshot()).toMatchObject({
    kind: "ready",
    preferences: { theme: "system" },
  });
  expect(fixture.model.controller).toBe(controller);
});
