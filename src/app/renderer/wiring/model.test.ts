import { match } from "ts-pattern";
import { afterEach, expect, it, vi } from "vitest";
import type { ConversationEvent } from "../../../modules/conversation/contracts/public";
import type { RuntimeView } from "../../../modules/execution/contracts/public";
import {
  type Draft,
  DraftSchema,
  type SaveReply,
} from "../../../modules/input/contracts/public";
import type { DraftController } from "../../../modules/input/core/public";
import { ThreadIdSchema } from "../../../shared/identity";
import {
  type Command,
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { failure } from "../../contracts/failure";
import { AppModel } from "./model";

function deferredReceipt() {
  let resolve: (reply: SaveReply) => void = () => {
    throw new Error("Receipt not initialized");
  };
  const promise = new Promise<SaveReply>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

type SaveCommand = Extract<Command, { kind: "save" }>;
const draft = DraftSchema.parse({
  schemaVersion: 1,
  threadId: crypto.randomUUID(),
  workingDirectoryId: crypto.randomUUID(),
  directory: "/fixture",
  revision: 0,
  text: "saved source",
});
const controllers: DraftController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.unstubAllGlobals();
});
async function setup(
  save: (command: SaveCommand) => Promise<SaveReply>,
  restored: () => Draft = () => draft,
) {
  // Only the document theme surface and the process boundary are substituted;
  // AppModel and DraftController collaborate without React or native UI.
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const bridge: DesktopBridge = {
    request: async (command) => {
      const input: Command = command;
      const raw = await match(input)
        .with({ kind: "restore" }, async () => ({
          kind: "ready" as const,
          draft: restored(),
          directoryAvailable: true,
          preferences: {
            theme: "light" as const,
            density: "normal" as const,
            locale: "system" as const,
          },
        }))
        .with({ kind: "save" }, save)
        .with(
          { kind: "choose-project" },
          { kind: "list-threads" },
          { kind: "select-thread" },
          { kind: "new-thread" },
          { kind: "preferences" },
          () => {
            throw new Error("Unexpected command in close scenario");
          },
        )
        .exhaustive();
      return parseDesktopReply(command, raw);
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const model = new AppModel(bridge);
  await model.start();
  const controller = model.controller;
  if (!controller) throw new Error("Draft not restored");
  controllers.push(controller);
  let composing = false;
  let editable = true;
  model.attachEditorBoundary(controller, {
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
    controller,
    isEditable: () => editable,
    compose: (value: boolean) => {
      composing = value;
    },
  };
}
const saved = (revision: number): SaveReply => ({
  kind: "saved",
  threadId: draft.threadId,
  revision,
});

it("the recovery action reads storage without replacing local editor content and permits close after saving new input", async () => {
  let stored = draft;
  let loseReply = true;
  const input = await setup(
    async (command) => {
      expect(command.expectedRevision).toBe(stored.revision);
      stored = { ...stored, revision: stored.revision + 1, text: command.text };
      if (loseReply) throw Error("lost receipt");
      return saved(stored.revision);
    },
    () => stored,
  );
  input.controller.edit("committed");
  expect(await input.model.prepareClose()).toBe(false);
  input.controller.edit("new local words");
  loseReply = false;
  await input.model.reconcileDraft();
  expect(input.model.controller).toBe(input.controller);
  expect(stored.text).toBe("new local words");
  expect(await input.model.prepareClose()).toBe(true);
});

it("refuses close during IME composition, then freezes editing until the draft is confirmed", async () => {
  const receipt = deferredReceipt();
  const input = await setup(() => receipt.promise);
  input.controller.edit("unconfirmed source");
  input.compose(true);
  const composingClose = input.model.prepareClose();
  await Promise.resolve();
  expect(input.controller.getSnapshot().kind).toBe("dirty");
  expect(await composingClose).toBe(false);
  expect(input.isEditable()).toBe(true);
  input.compose(false);
  let closed = false;
  const closing = input.model.prepareClose().then((result) => {
    closed = result;
    return result;
  });
  await Promise.resolve();
  expect(input.isEditable()).toBe(false);
  expect(closed).toBe(false);
  receipt.resolve(saved(1));
  expect(await closing).toBe(true);
  expect(input.controller.getSnapshot().kind).toBe("saved");
});

it("failed close releases editing and explicit retry saves the latest text", async () => {
  let fail = true;
  let persisted = draft.text;
  const input = await setup(async (command) => {
    if (fail)
      return failure(
        command.traceId,
        "storage-unavailable",
        "draft.storageUnavailable",
      );
    persisted = command.text;
    return saved(command.expectedRevision + 1);
  });
  input.controller.edit("first edit");
  expect(await input.model.prepareClose()).toBe(false);
  expect(input.isEditable()).toBe(true);
  expect(persisted).toBe("saved source");
  input.controller.edit("latest edit after failure");
  fail = false;
  expect(await input.controller.retry()).toBe(true);
  expect(persisted).toBe("latest edit after failure");
  expect(await input.model.prepareClose()).toBe(true);
});

it("cancelling a pending close releases editing and preserves edits made before its late receipt", async () => {
  const receipt = deferredReceipt();
  const persisted: string[] = [];
  const input = await setup(async (command) => {
    const result =
      command.expectedRevision === 0
        ? await receipt.promise
        : saved(command.expectedRevision + 1);
    persisted.push(command.text);
    return result;
  });
  input.controller.edit("before timeout");
  const closing = input.model.prepareClose();
  expect(input.isEditable()).toBe(false);
  input.model.cancelClose();
  expect(input.isEditable()).toBe(true);
  input.controller.edit("after timeout");
  receipt.resolve(saved(1));
  await closing;
  expect(input.isEditable()).toBe(true);
  expect(persisted).toEqual(["before timeout", "after timeout"]);
  expect(input.controller.getSnapshot().kind).toBe("saved");
});

it("cannot release a replacement editor after the original close save fails late", async () => {
  let rejectSave: (cause: Error) => void = () => {};
  const input = await setup(
    () =>
      new Promise<SaveReply>((_accept, reject) => {
        rejectSave = reject;
      }),
  );
  input.controller.edit("closing original editor");
  const closing = input.model.prepareClose();
  const replacementRelease = vi.fn();
  input.model.attachEditorBoundary(input.controller, {
    freeze: () => true,
    release: replacementRelease,
  });
  rejectSave(Error("old save reply lost"));
  expect(await closing).toBe(false);
  expect(replacementRelease).not.toHaveBeenCalled();
});

it("keeps conversation projection lifecycle in the AppModel", async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const connectionGeneration = crypto.randomUUID();
  const view: RuntimeView = {
    threadId,
    traceId: crypto.randomUUID(),
    configuration: { code: "runtime.configDefault" },
    connectionGeneration,
    revision: 0,
    phase: "browse",
    trusted: false,
    busy: false,
    model: null,
    message: { code: "runtime.browseOnly" },
  };
  const ready = {
    ...view,
    revision: 1,
    phase: "ready" as const,
    trusted: true,
    model: "fixture",
    message: { code: "runtime.readyToSend" as const },
  };
  const runtimeListeners: ((value: RuntimeView) => void)[] = [];
  const conversationListeners: ((event: ConversationEvent) => void)[] = [];
  let runtimeUnsubscriptions = 0;
  let conversationUnsubscriptions = 0;
  let conversationConnections = 0;
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind !== "restore") throw Error("unexpected command");
      return parseDesktopReply(command, {
        kind: "ready" as const,
        draft: DraftSchema.parse({
          schemaVersion: 1,
          threadId,
          workingDirectoryId: crypto.randomUUID(),
          directory: "/fixture",
          revision: 0,
          text: "saved source",
        }),
        directoryAvailable: true,
        preferences: {
          theme: "light" as const,
          density: "normal" as const,
          locale: "system" as const,
        },
      });
    },
    runtime: {
      request: () => new Promise<{ kind: "view"; view: RuntimeView }>(() => {}),
      subscribe: (listener) => {
        runtimeListeners.push(listener);
        return () => {
          runtimeUnsubscriptions += 1;
        };
      },
    },
    conversation: {
      connect: (connectedThread, listener) => {
        expect(connectedThread).toBe(threadId);
        conversationConnections += 1;
        conversationListeners.push(listener);
        listener({
          kind: "snapshot",
          connectionGeneration,
          seq: 0,
          items: [],
          gap: false,
        });
        return () => {
          conversationUnsubscriptions += 1;
        };
      },
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const model = new AppModel(bridge);
  await model.start();
  expect(model.getSnapshot().kind).toBe("ready");
  runtimeListeners[0]?.(view);
  expect(conversationConnections).toBe(1);
  runtimeListeners[0]?.(ready);
  expect(conversationConnections).toBe(2);
  expect(model.reading?.getSnapshot()?.connectionGeneration).toBe(
    connectionGeneration,
  );
  const reading = model.reading;
  const readingBeforeDispose = reading?.getSnapshot();
  model.dispose();
  expect(runtimeUnsubscriptions).toBe(1);
  expect(conversationUnsubscriptions).toBe(2);

  runtimeListeners[0]?.({ ...ready, revision: 2 });
  conversationListeners[1]?.({
    kind: "update",
    connectionGeneration,
    seq: 1,
    droppedBefore: 0,
    gap: false,
    item: {
      id: 1,
      role: "assistant",
      text: "late",
      state: "complete",
      label: { kind: "literal", text: "Assistant" },
    },
  });
  expect(conversationConnections).toBe(2);
  expect(reading?.getSnapshot()).toEqual(readingBeforeDispose);
  expect(model.reading).toBeNull();
});
