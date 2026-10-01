import { afterEach, expect, it, vi } from "vitest";
import { DraftSchema } from "../../../modules/input/contracts/public";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { AppModel } from "./model";

const models: AppModel[] = [];
afterEach(() => {
  for (const model of models.splice(0)) model.dispose();
  vi.unstubAllGlobals();
});

async function fixture({
  loseSelectionReply = false,
  rejectSelection = false,
  loseRestore = false,
}: {
  loseSelectionReply?: boolean;
  rejectSelection?: boolean;
  loseRestore?: boolean;
} = {}) {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const first = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/first",
    revision: 0,
    text: "first",
  });
  const second = DraftSchema.parse({
    ...first,
    threadId: crypto.randomUUID(),
    directory: "/second",
    text: "second",
  });
  let active = first;
  const selections: string[] = [];
  let composing = false;
  let editable = true;
  let unreadable = loseRestore;
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind === "list-threads")
        return parseDesktopReply(command, {
          kind: "threads",
          threads: [first, second],
        });
      if (command.kind === "select-thread") {
        selections.push(command.threadId);
        if (rejectSelection) {
          active = { ...first, revision: 1, text: "externally updated" };
          throw Error("selection rejected");
        }
        active = second;
        if (loseSelectionReply)
          throw Error("selection receipt lost after Main committed");
      }
      if (command.kind === "restore" && selections.length && unreadable)
        throw Error("selection read unavailable");
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
  models.push(model);
  await model.start();
  const original = model.controller;
  if (!original) throw Error("missing original controller");
  model.attachEditorBoundary(original, {
    freeze: () => {
      if (composing) return false;
      editable = false;
      return true;
    },
    release: () => {
      editable = true;
    },
  });
  return {
    model,
    first,
    second,
    original,
    selections,
    editable: () => editable,
    compose: () => {
      composing = true;
    },
    allowRead: () => {
      unreadable = false;
    },
  };
}

it("reports a confirmed Thread selection for navigation and refuses to leave composing input", async () => {
  const input = await fixture();
  input.compose();
  expect(await input.model.selectThread(input.second.threadId)).toEqual({
    kind: "blocked",
    reason: "composing",
  });
  expect(input.selections).toEqual([]);
  expect(input.model.controller).toBe(input.original);
  expect(input.editable()).toBe(true);
});

it("does not report a rejected target as selected when restoring the original Thread rebuilds its resources", async () => {
  const input = await fixture({ rejectSelection: true });
  expect((await input.model.selectThread(input.second.threadId)).kind).toBe(
    "failed",
  );
  expect(input.model.controller).not.toBe(input.original);
});

it("does not bypass a close reservation when navigating to the already selected Thread", async () => {
  const input = await fixture();
  expect(await input.model.prepareClose()).toBe(true);
  expect(await input.model.selectThread(input.first.threadId)).toEqual({
    kind: "blocked",
    reason: "closing",
  });
});

it("reconciles a lost selection receipt by reading Main without sending the selection twice", async () => {
  const input = await fixture({ loseSelectionReply: true });
  const result = await input.model.selectThread(input.second.threadId);
  expect(result.kind).toBe("applied");
  expect(input.selections).toEqual([input.second.threadId]);
  const state = input.model.getSnapshot();
  expect(
    state.kind === "ready" &&
      state.threadSelection.kind === "thread" &&
      state.threadSelection.thread.context.threadId,
  ).toBe(input.second.threadId);
});

it("locks unknown selection until an explicit authoritative read, without repeating the command", async () => {
  const input = await fixture({ loseSelectionReply: true, loseRestore: true });
  expect((await input.model.selectThread(input.second.threadId)).kind).toBe(
    "unknown",
  );
  expect(input.editable()).toBe(false);
  expect(await input.model.prepareClose()).toBe(false);
  expect(await input.model.selectThread(input.first.threadId)).toEqual({
    kind: "blocked",
    reason: "selection-unknown",
  });
  input.allowRead();
  expect((await input.model.reconcileSelection()).kind).toBe("applied");
  expect(input.selections).toEqual([input.second.threadId]);
  expect(input.model.getSnapshot()).toMatchObject({
    kind: "ready",
    busy: false,
  });
  expect(input.model.getSnapshot()).not.toHaveProperty("threadTransition");
});
