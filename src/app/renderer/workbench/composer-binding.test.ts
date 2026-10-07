import type { EditorOptions } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { draftDocument } from "../../../modules/input/renderer/public";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { AppModel } from "../wiring/model";
import { Composer } from "./composer";

const editorCalls = vi.hoisted(() => [] as Partial<EditorOptions>[]);
vi.mock("@tiptap/react", () => ({
  useEditor: (options: Partial<EditorOptions>) => {
    editorCalls.push(options);
    return null;
  },
  EditorContent: () => null,
}));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) =>
      snapshot(),
  };
});
vi.mock("../../../modules/preferences/renderer/public", async () => {
  const { createI18n } = await import("../../../shared/i18n/create-i18n");
  return { useI18n: () => createI18n("en-US") };
});
vi.mock("../../../modules/ui/renderer/public", async (importOriginal) => {
  const ui =
    await importOriginal<
      typeof import("../../../modules/ui/renderer/public")
    >();
  return {
    ...ui,
    Button: ({ children }: { children: ReactNode }) =>
      createElement("button", null, children),
  };
});
vi.mock("@/components/icons/common", () => ({ WebsiteIcon: () => null }));

const models: AppModel[] = [];
afterEach(() => {
  for (const model of models.splice(0)) model.dispose();
  editorCalls.splice(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function setup() {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const first = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "restored A",
  });
  let current = first;
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind === "restore")
        return parseDesktopReply(command, {
          kind: "ready",
          draft: current,
          directoryAvailable: true,
          preferences: { theme: "light", density: "normal", locale: "system" },
        });
      if (command.kind === "save")
        return parseDesktopReply(command, {
          kind: "saved",
          threadId: command.threadId,
          revision: command.expectedRevision + 1,
        });
      throw Error("unexpected command");
    },
    submission: {
      request: async () => ({ kind: "list", receipts: [] }),
      subscribe: () => () => {},
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const model = new AppModel(bridge);
  models.push(model);
  await model.start();
  const state = model.getSnapshot();
  if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
    throw Error("missing Thread");
  const thread = state.threadSelection.thread;
  const render = () =>
    renderToStaticMarkup(createElement(Composer, { thread, model }));
  return {
    model,
    thread,
    render,
    changeThread: () => {
      current = DraftSchema.parse({
        ...first,
        threadId: crypto.randomUUID(),
        directory: "/second",
        text: "new Thread",
      });
      return model.start();
    },
  };
}

it("rebinds the editor to the latest immutable snapshot before and after its save", async () => {
  const fixture = await setup();
  fixture.render();
  expect(editorCalls.at(-1)?.content).toEqual(draftDocument("restored A"));
  fixture.thread.controller.edit("new local B");
  fixture.render();
  expect(editorCalls.at(-1)?.content).toEqual(draftDocument("new local B"));
  await fixture.thread.controller.flush();
  fixture.render();
  expect(editorCalls.at(-1)?.content).toEqual(draftDocument("new local B"));
});

it("cannot let the previous editor's deferred composition callback consume a new Thread", async () => {
  vi.useFakeTimers();
  const fixture = await setup();
  fixture.render();
  const compositionEnd =
    editorCalls.at(-1)?.editorProps?.handleDOMEvents?.compositionend;
  if (!compositionEnd) throw Error("missing composition callback");
  await fixture.changeThread();
  const active = fixture.model.submission;
  if (!active) throw Error("missing active submission");
  const consume = vi.spyOn(active, "consume");
  compositionEnd(
    { composing: false } as EditorView,
    { type: "compositionend", data: "" } as CompositionEvent,
  );
  await vi.runAllTimersAsync();
  expect(consume).not.toHaveBeenCalled();
});
