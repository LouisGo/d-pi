// @vitest-environment happy-dom
import { act, type ComponentType, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  captureSelection,
  type FrozenSelection,
} from "../../../modules/files/core/public";
import type { CodeView } from "../../../modules/files/renderer/public";
import { DraftSchema } from "../../../modules/input/contracts/public";
import type { Preferences } from "../../../modules/preferences/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { createI18n } from "../../../shared/i18n/create-i18n";
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
}: {
  start?: boolean;
  restoreFails?: boolean;
  empty?: boolean;
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
  const bridge: DesktopBridge = {
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
      subscribe: () => () => {},
    },
    conversation: { connect: () => () => {} },
    submission: {
      request: async () => ({ kind: "list", receipts: [] }),
      subscribe: () => () => {},
    },
    files: {
      request: async () => ({ kind: "unavailable", reason: "missing" }),
    },
    git: { request: async () => ({ kind: "unavailable", reason: "not-git" }) },
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
    act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: {
            preference: "system",
            resolvedLocale: "en-US",
          },
          children: createElement(App, { model, editor }),
        }),
      ),
    );
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
    container,
    button,
    render,
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

it("keeps Thread views untouched while theme saving disables controls and then applies the confirmed appearance", async () => {
  const fixture = await setup();
  const initial = renderCounts();
  expect(Object.values(initial)).toEqual([1, 1, 1, 1, 1, 1]);
  let saving: Promise<void> | undefined;
  await act(() => {
    saving = fixture.model.preference("theme");
  });
  expect(fixture.button(i18n.t("app.toolbar.darkTheme")).disabled).toBe(true);
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(renderCounts()).toEqual(initial);

  await act(async () => {
    fixture.settle();
    await saving;
  });
  expect(fixture.button(i18n.t("app.toolbar.lightTheme")).disabled).toBe(false);
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(renderCounts()).toEqual(initial);
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
    expect(document.documentElement.dataset.density).toBe("normal");
  } finally {
    observer.disconnect();
  }
});

it("isolates density, busy and failed-save notices while preserving the previous preference", async () => {
  const fixture = await setup();
  const initial = renderCounts();
  const compactButton = () =>
    Array.from(fixture.container.querySelectorAll("button")).find(
      (button) => button.textContent === i18n.t("app.toolbar.compactDensity"),
    );
  let saving: Promise<void> | undefined;
  await act(() => {
    saving = fixture.model.preference("density");
  });
  expect(compactButton()?.disabled).toBe(true);
  expect(fixture.container.querySelector("select")?.disabled).toBe(true);
  expect(renderCounts()).toEqual(initial);
  await act(async () => {
    fixture.settle(true);
    await saving;
  });
  expect(compactButton()?.disabled).toBe(false);
  expect(fixture.container.querySelector("select")?.disabled).toBe(false);
  expect(document.documentElement.dataset.density).toBe("normal");
  expect(fixture.container.querySelector(".notice")?.textContent).toContain(
    i18n.t("draft.storageUnavailable"),
  );
  expect(renderCounts()).toEqual(initial);

  await act(async () => {
    const retry = fixture.model.preference("density");
    fixture.settle();
    await retry;
  });
  expect(document.documentElement.dataset.density).toBe("compact");
  expect(fixture.container.querySelector(".notice")).toBeNull();
  expect(fixture.container.textContent).toContain(
    i18n.t("app.toolbar.normalDensity"),
  );
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
    for (const key of ["theme", "density"] as const) {
      await act(async () => {
        const saving = fixture.model.preference(key);
        fixture.settle();
        await saving;
      });
    }
    attributes.push(
      ...observer.takeRecords().map((record) => record.attributeName),
    );
    expect(attributes).toEqual(["data-theme", "data-density"]);
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
  expect(fixture.container.textContent).toContain("/fixture/second");
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
  expect(fixture.container.textContent).toContain(i18n.t("app.loading"));
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

it("keeps the project chooser disabled for its real pending operation", async () => {
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
  expect(choose()?.disabled).toBe(true);
  await act(async () => {
    fixture.cancelChoice();
    await choosing;
  });
  expect(choose()?.disabled).toBe(false);
});

it("still updates localized workbench text when the language context changes", async () => {
  const fixture = await setup();
  expect(fixture.container.textContent).toContain(
    i18n.t("ui.conversation.heading"),
  );
  const language = fixture.container.querySelector("select");
  if (!language) throw Error("missing language selector");
  await act(() => {
    language.value = "zh-CN";
    language.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(fixture.container.textContent).toContain(
    createI18n("zh-CN").t("ui.conversation.heading"),
  );
});
