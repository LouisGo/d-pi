// @vitest-environment happy-dom
import type { EditorOptions } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  type RuntimeView,
  RuntimeViewSchema,
} from "../../../modules/execution/contracts/public";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { createI18n } from "../../../shared/i18n/create-i18n";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { AppModel } from "../wiring/model";
import { Composer } from "./composer";

const editorCalls = vi.hoisted(() => [] as Partial<EditorOptions>[]);
const documentCalls = vi.hoisted(() => vi.fn());
const i18n = createI18n("en-US");
vi.mock("@tiptap/react", () => ({
  useEditor: (options: Partial<EditorOptions>) => {
    editorCalls.push(options);
    return null;
  },
  EditorContent: () => null,
}));
vi.mock("../../../modules/input/renderer/public", async (importOriginal) => {
  const input =
    await importOriginal<
      typeof import("../../../modules/input/renderer/public")
    >();
  return {
    ...input,
    draftDocument: (text: string) => {
      documentCalls(text);
      return input.draftDocument(text);
    },
  };
});

const mounted: { root: Root; container: HTMLElement; model: AppModel }[] = [];
afterEach(async () => {
  for (const { root, container, model } of mounted.splice(0)) {
    await act(() => root.unmount());
    model.dispose();
    container.remove();
  }
  editorCalls.splice(0);
  documentCalls.mockClear();
  vi.unstubAllGlobals();
});

async function setup(control?: RuntimeView["control"]) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "restored draft",
  });
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind === "restore")
        return parseDesktopReply(command, {
          kind: "ready",
          draft,
          directoryAvailable: true,
          preferences: { theme: "light", density: "normal", locale: "system" },
        });
      if (command.kind === "preferences")
        return parseDesktopReply(command, {
          kind: "preferences-saved",
          value: command.value,
        });
      if (command.kind === "save")
        return parseDesktopReply(command, {
          kind: "saved",
          threadId: command.threadId,
          revision: command.expectedRevision + 1,
        });
      throw Error("unexpected command");
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  let runtimeView: RuntimeView | null = null;
  let deliverRuntime: (view: RuntimeView) => void = () => {};
  if (control) {
    bridge.runtime = {
      subscribe: (listener) => {
        deliverRuntime = listener;
        return () => {};
      },
      request: async (command) => {
        runtimeView = RuntimeViewSchema.parse({
          threadId: command.threadId,
          traceId: command.traceId,
          revision: 0,
          phase: "ready",
          trusted: true,
          busy: true,
          model: "fixture/model",
          configuration: { code: "runtime.configDefault" },
          message: { code: "runtime.readyToSend" },
          control,
        });
        return { kind: "view", view: runtimeView };
      },
    };
    bridge.submission = {
      request: async () => ({ kind: "list", receipts: [] }),
      subscribe: () => () => {},
    };
  }
  const model = new AppModel(bridge);
  await model.start();
  const state = model.getSnapshot();
  if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
    throw Error("missing Thread");
  const thread = state.threadSelection.thread;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container, model });
  const render = () =>
    act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: {
            preference: "system",
            resolvedLocale: "en-US",
          },
          children: createElement(Composer, {
            thread: currentThread(),
            model,
          }),
        }),
      ),
    );
  function currentThread() {
    const current = model.getSnapshot();
    if (current.kind !== "ready" || current.threadSelection.kind !== "thread")
      throw Error("missing current Thread");
    return current.threadSelection.thread;
  }
  await render();
  return {
    thread,
    model,
    container,
    root,
    render,
    publishControl: async (next: NonNullable<RuntimeView["control"]>) => {
      if (!runtimeView) throw Error("missing runtime fixture");
      runtimeView = {
        ...runtimeView,
        revision: runtimeView.revision + 1,
        control: next,
      };
      await act(() => deliverRuntime(runtimeView as RuntimeView));
    },
    changeThread: () => {
      draft = DraftSchema.parse({
        ...draft,
        threadId: crypto.randomUUID(),
        text: "replacement Thread draft",
      });
      return model.start();
    },
  };
}

it("parses the initial editor document once while mounted draft and shortcut subscriptions still update", async () => {
  const fixture = await setup();
  expect(documentCalls.mock.calls).toEqual([["restored draft"]]);
  const initialDocument = editorCalls.at(-1)?.content;
  await act(() => fixture.thread.controller.edit("new unsaved draft"));
  expect(fixture.container.textContent).toContain(
    i18n.t("composer.status.dirty"),
  );
  expect(editorCalls.length).toBeGreaterThan(1);
  expect(documentCalls.mock.calls).toEqual([["restored draft"]]);
  expect(editorCalls.at(-1)?.content).toBe(initialDocument);

  await act(() => fixture.model.preference("sendKey"));
  expect(fixture.container.textContent).toContain(
    i18n.t("composer.shortcut.newline"),
  );
  expect(documentCalls.mock.calls).toEqual([["restored draft"]]);
});

it("does not parse again for an expanded editor and reads the latest pending snapshot on a real remount", async () => {
  const fixture = await setup();
  const expand = Array.from(fixture.container.querySelectorAll("button")).find(
    (button) => button.textContent === i18n.t("composer.expand"),
  );
  if (!expand) throw Error("missing expand button");
  await act(() => expand.click());
  expect(
    fixture.container
      .querySelector("[data-expanded]")
      ?.getAttribute("data-expanded"),
  ).toBe("true");
  expect(documentCalls.mock.calls).toEqual([["restored draft"]]);
  await act(() => fixture.thread.controller.edit("pending before remount"));
  await act(() => fixture.root.render(null));
  await fixture.render();
  expect(documentCalls.mock.calls).toEqual([
    ["restored draft"],
    ["pending before remount"],
  ]);
  await act(() => fixture.thread.controller.flush());
  await act(() => fixture.root.render(null));
  await fixture.render();
  expect(documentCalls.mock.calls.at(-1)).toEqual(["pending before remount"]);
});

it("constructs the editor document for a replacement Thread controller", async () => {
  const fixture = await setup();
  await act(() => fixture.changeThread());
  await fixture.render();
  expect(documentCalls.mock.calls).toEqual([
    ["restored draft"],
    ["replacement Thread draft"],
  ]);
});

function nativeControl(
  total: number,
  visible = total,
  projection = true,
): NonNullable<RuntimeView["control"]> {
  return {
    paused: false,
    stopping: false,
    streaming: true,
    compacting: false,
    queued: total,
    background: 0,
    pendingAsync: false,
    admitted: false,
    queue: Array.from({ length: Math.min(total, 16) }, () => ({
      text: "preview",
      kind: "followUp" as const,
    })),
    ...(projection
      ? {
          queueState: {
            revision: 0,
            coverage:
              visible < total ? ("limited" as const) : ("complete" as const),
            hiddenCount: total - visible,
            editing: null,
            items: Array.from({ length: visible }, () => ({
              id: crypto.randomUUID(),
              kind: "followUp" as const,
              text: "native",
              editable: true,
              editing: false,
              truncated: false,
            })),
          },
        }
      : {}),
  };
}

it("caps both send buttons and Enter using projected entries plus hidden native entries", async () => {
  const fixture = await setup(nativeControl(20, 3));
  const submission = fixture.thread.submission;
  if (!submission) throw Error("missing submission");
  const send = vi.spyOn(submission, "send").mockResolvedValue(undefined);
  const buttons = () =>
    Array.from(fixture.container.querySelectorAll("button")).filter((button) =>
      [i18n.t("composer.queueSend"), i18n.t("composer.steer")].includes(
        button.textContent ?? "",
      ),
    );
  expect(buttons()).toHaveLength(2);
  expect(buttons().every((button) => button.disabled)).toBe(true);
  expect(fixture.container.textContent).toContain(
    i18n.t("composer.queueFull", { queued: 20, cap: 20 }),
  );
  const enter = () =>
    editorCalls
      .at(-1)
      ?.editorProps?.handleKeyDown?.(
        { composing: false } as EditorView,
        new KeyboardEvent("keydown", { key: "Enter" }),
      );
  enter();
  expect(send).not.toHaveBeenCalled();
  await fixture.publishControl(nativeControl(19));
  expect(buttons().every((button) => !button.disabled)).toBe(true);
  enter();
  expect(send).toHaveBeenCalledOnce();
});

it("retains the legacy native queue cap when no full projection is available", async () => {
  const control = nativeControl(20, 20, false);
  control.queue = Array.from({ length: 20 }, () => ({
    kind: "followUp",
    text: "legacy",
  }));
  const fixture = await setup(control);
  const button = Array.from(fixture.container.querySelectorAll("button")).find(
    (button) => button.textContent === i18n.t("composer.queueSend"),
  );
  expect(button?.disabled).toBe(true);
  expect(fixture.container.textContent).toContain(
    i18n.t("composer.queueFull", { queued: 20, cap: 20 }),
  );
});
