// @vitest-environment happy-dom
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { RuntimeViewSchema } from "../../../modules/execution/contracts/public";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { replaceDraftText } from "../../../modules/input/renderer/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { AppModel } from "../model";
import { Composer } from "./composer";

const mounted: { root: Root; container: HTMLElement; model: AppModel }[] = [];
afterEach(async () => {
  for (const { root, container, model } of mounted.splice(0)) {
    await act(() => root.unmount());
    model.dispose();
    container.remove();
  }
  vi.unstubAllGlobals();
});

async function setup(phase?: "interrupted" | "allowed") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const first = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "alpha omega",
  });
  const second = DraftSchema.parse({
    ...first,
    threadId: crypto.randomUUID(),
    text: "bravo",
  });
  const drafts = new Map([
    [first.threadId, first],
    [second.threadId, second],
  ]);
  let selected = first.threadId;
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind === "save") {
        const old = drafts.get(command.threadId);
        if (!old) throw Error("missing saved draft");
        drafts.set(command.threadId, {
          ...old,
          revision: command.expectedRevision + 1,
          text: command.text,
        });
        return parseDesktopReply(command, {
          kind: "saved",
          threadId: command.threadId,
          revision: command.expectedRevision + 1,
        });
      }
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
  if (phase)
    bridge.runtime = {
      subscribe: () => () => {},
      request: async (command) => ({
        kind: "view",
        view: RuntimeViewSchema.parse({
          threadId: command.threadId,
          traceId: command.traceId,
          revision: 0,
          phase,
          trusted: true,
          busy: false,
          model: null,
          configuration: { code: "runtime.configDefault" },
          message: { code: "runtime.previousSessionReadOnly" },
        }),
      }),
    };
  const model = new AppModel(bridge);
  await model.start();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container, model });
  function thread() {
    const state = model.getSnapshot();
    if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
      throw Error("missing selected thread");
    return state.threadSelection.thread;
  }
  const render = () =>
    act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "system", resolvedLocale: "en-US" },
          children: createElement(Composer, {
            key: thread().key,
            thread: thread(),
            model,
          }),
        }),
      ),
    );
  await render();
  const editor = () => {
    const dom = container.querySelector<HTMLElement & { editor: Editor }>(
      ".tiptap",
    );
    if (!dom) throw Error("missing real editor");
    return dom.editor;
  };
  const select = async (id: typeof first.threadId) => {
    await act(() => model.selectThread(id));
    await render();
  };
  return { model, first, second, drafts, thread, render, editor, select };
}

it("preserves A's middle selection and independent undo/redo across A → B → A with fresh views", async () => {
  const fixture = await setup();
  const firstView = fixture.editor().view;
  await act(() => {
    fixture.editor().commands.setTextSelection(6);
    fixture.editor().commands.insertContent(" one");
    fixture.editor().view.dispatch(closeHistory(fixture.editor().state.tr));
    fixture.editor().commands.insertContent(" two");
    fixture.editor().commands.setTextSelection({ from: 3, to: 9 });
  });
  await fixture.select(fixture.second.threadId);
  await act(() => fixture.editor().commands.insertContent(" B"));
  await fixture.select(fixture.first.threadId);
  const restored = fixture.editor();
  expect(restored.view).not.toBe(firstView);
  expect(restored.state.selection.from).toBe(3);
  expect(restored.state.selection.to).toBe(9);
  await act(() => expect(restored.commands.undo()).toBe(true));
  expect(restored.getText()).toBe("alpha one omega");
  expect(restored.state.selection.from).toBe(10);
  await act(() => expect(restored.commands.undo()).toBe(true));
  expect(restored.getText()).toBe("alpha omega");
  expect(restored.state.selection.from).toBe(6);
  await act(() => expect(restored.commands.redo()).toBe(true));
  await act(() => expect(restored.commands.redo()).toBe(true));
  expect(restored.getText()).toBe("alpha one two omega");
  await fixture.select(fixture.second.threadId);
  expect(fixture.editor().getText()).toBe(" Bbravo");
  await act(() => expect(fixture.editor().commands.undo()).toBe(true));
  expect(fixture.editor().getText()).toBe("bravo");
});

it("cannot undo accepted submission consumption in the current editor or after a switch", async () => {
  const fixture = await setup();
  await act(() => fixture.editor().commands.insertContent("sent "));
  const controller = fixture.thread().controller;
  const captured = await act(() =>
    controller.captureSubmission("submission", async () => true),
  );
  if (!captured) throw Error("missing captured draft");
  await act(() =>
    expect(
      controller.consumeSubmission(captured, () =>
        replaceDraftText(fixture.editor(), ""),
      ),
    ).toBe(true),
  );
  expect(fixture.editor().commands.undo()).toBe(false);
  await fixture.select(fixture.second.threadId);
  await fixture.select(fixture.first.threadId);
  expect(fixture.editor().getText()).toBe("");
  expect(fixture.editor().commands.undo()).toBe(false);
});

it("uses an externally updated draft version on return and discards the previous undo", async () => {
  const fixture = await setup();
  await act(() => fixture.editor().commands.insertContent("local "));
  await fixture.select(fixture.second.threadId);
  const old = fixture.drafts.get(fixture.first.threadId);
  if (!old) throw Error("missing old draft");
  fixture.drafts.set(fixture.first.threadId, {
    ...old,
    revision: old.revision + 1,
    text: "external draft",
  });
  await fixture.select(fixture.first.threadId);
  expect(fixture.editor().getText()).toBe("external draft");
  expect(fixture.editor().commands.undo()).toBe(false);
});

it("Shift+Enter inserts a source line in the real composer and remains undoable", async () => {
  const fixture = await setup();
  await act(() => {
    fixture.editor().commands.setTextSelection(6);
    fixture.editor().view.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(fixture.editor().getText({ blockSeparator: "\n" })).toBe(
    "alpha\n omega",
  );
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha\n omega");
  await act(() => expect(fixture.editor().commands.undo()).toBe(true));
  expect(fixture.editor().getText()).toBe("alpha omega");
});

it("offers a visible new-session exit beside the disabled send button for a recovered read-only thread", async () => {
  const fixture = await setup("interrupted");
  const container = fixture.editor().view.dom.closest("section");
  expect(container?.textContent).toContain("read-only");
  const button = Array.from(container?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === "New Thread",
  );
  expect(button).toBeDefined();
  const create = vi
    .spyOn(fixture.model, "newThread")
    .mockResolvedValue({ kind: "cancelled" });
  await act(() => button?.click());
  expect(create).toHaveBeenCalledOnce();
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha omega");
});
