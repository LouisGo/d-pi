// @vitest-environment happy-dom
import type { EditorOptions } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { createI18n } from "../../../shared/i18n/create-i18n";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { AppModel } from "../model";
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

async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
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
  const model = new AppModel(bridge);
  await model.start();
  const state = model.getSnapshot();
  if (state.kind !== "ready" || state.workspace.kind !== "thread")
    throw Error("missing Thread");
  const thread = state.workspace.thread;
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
    if (current.kind !== "ready" || current.workspace.kind !== "thread")
      throw Error("missing current Thread");
    return current.workspace.thread;
  }
  await render();
  return {
    thread,
    model,
    container,
    root,
    render,
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
