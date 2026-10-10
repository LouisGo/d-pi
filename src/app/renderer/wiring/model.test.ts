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
import { AttachmentImports } from "../../../modules/input/renderer/public";
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
  attachments?: DesktopBridge["attachments"],
) {
  // Only the document theme surface and the process boundary are substituted;
  // AppModel and DraftController collaborate without React or native UI.
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const bridge: DesktopBridge = {
    ...(attachments ? { attachments } : {}),
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
        .with({ kind: "select-thread" }, async () => ({
          kind: "ready" as const,
          draft: restored(),
          directoryAvailable: true,
          preferences: {
            theme: "light" as const,
            density: "normal" as const,
            locale: "system" as const,
          },
        }))
        .with(
          { kind: "choose-project" },
          { kind: "list-threads" },
          { kind: "new-thread" },
          { kind: "preferences" },
          { kind: "thread-command" },
          { kind: "sidebar-read" },
          { kind: "sidebar-change" },
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

it("keeps unpersisted attachment originals on close until explicitly removed", async () => {
  const input = await setup(async () => saved(1));
  const imports = new AttachmentImports(async () => []);
  const source = new File(["original"], "oversized.png");
  Object.defineProperty(source, "size", { value: 25 * 1024 * 1024 + 1 });
  imports.importFiles([source], "drop");
  try {
    expect(await input.model.prepareClose()).toBe(false);
    expect(input.isEditable()).toBe(true);
    expect(input.model.stateStore.getState()).toMatchObject({
      kind: "ready",
      notice: { message: { code: "attachment.closePending" } },
    });
  } finally {
    for (const failure of imports.stateStore.getState().failures)
      imports.removeFailure(failure.id);
  }
  expect(await input.model.prepareClose()).toBe(true);
});

it("saves before replacing a view, refuses failed saves and preserves the editable Thread", async () => {
  let fail = true;
  const input = await setup(async () => {
    if (fail) throw Error("storage offline");
    return saved(1);
  });
  input.controller.edit("view navigation draft");
  expect(await input.model.prepareViewNavigation()).toBe(false);
  expect(input.isEditable()).toBe(true);
  expect(input.model.controller).toBe(input.controller);
  fail = false;
  await input.model.reconcileDraft();
  expect(await input.model.prepareViewNavigation()).toBe(true);
  expect(input.isEditable()).toBe(true);
  expect(input.model.controller).toBe(input.controller);
});

it("does not release a close freeze when a pending view navigation loses ownership", async () => {
  const receipt = deferredReceipt();
  const input = await setup(() => receipt.promise);
  input.controller.edit("shared pending save");
  const navigation = input.model.prepareViewNavigation();
  await Promise.resolve();
  const close = input.model.prepareClose();
  receipt.resolve(saved(1));
  expect(await navigation).toBe(false);
  expect(await close).toBe(true);
  expect(input.isEditable()).toBe(false);
  input.model.cancelClose();
  expect(input.isEditable()).toBe(true);
});

it("rechecks unfinished view input after the save and releases its own freeze when admission fails", async () => {
  const receipt = deferredReceipt();
  const input = await setup(() => receipt.promise);
  let pending = false;
  let editable = true;
  input.model.attachEditorBoundary(input.controller, {
    canLeaveView: () => !pending,
    freeze: () => {
      editable = false;
      return true;
    },
    release: () => {
      editable = true;
    },
  });
  input.controller.edit("save with a new attachment intent");
  const admission = input.model.prepareViewNavigation();
  pending = true;
  receipt.resolve(saved(1));
  expect(await admission).toBe(false);
  expect(editable).toBe(true);
  pending = false;
  expect(await input.model.prepareViewNavigation()).toBe(true);
});

it("blocks application close for a failed required source even after its view detaches", async () => {
  const input = await setup(
    async () => saved(1),
    () => draft,
    {
      request: async () => ({
        kind: "unavailable",
        reason: "source-too-large",
      }),
    },
  );
  const selected = input.model.stateStore.getState();
  if (selected.kind !== "ready") throw Error("not ready");
  const selection = selected.threadSelection;
  if (selection.kind !== "thread") throw Error("not selected");
  const sources = selection.thread.attachments;
  if (!sources) throw Error("no attachment model");
  await sources.run({ kind: "choose-import" }, true);
  expect(await input.model.prepareClose()).toBe(false);
  expect(input.isEditable()).toBe(true);
  sources.removeFailure();
  expect(await input.model.prepareClose()).toBe(true);
  input.model.dispose();
});

it("freezes source intents across the close save barrier and restores them on cancellation", async () => {
  const receipt = deferredReceipt();
  const request = vi.fn(
    async (): Promise<
      import("../../contracts/attachments").AttachmentReply
    > => ({ kind: "unavailable", reason: "source-too-large" }),
  );
  const input = await setup(
    () => receipt.promise,
    () => draft,
    { request },
  );
  const state = input.model.stateStore.getState();
  if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
    throw Error("not ready");
  const sources = state.threadSelection.thread.attachments;
  const imports = state.threadSelection.thread.attachmentImports;
  if (!sources || !imports) throw Error("missing sources");
  input.controller.edit("unsaved input");
  const closing = input.model.prepareClose();
  expect(await sources.run({ kind: "choose-import" }, true)).toBeNull();
  imports.importFiles([new File(["original"], "file.txt")], "drop");
  expect(request).not.toHaveBeenCalled();
  expect(imports.stateStore.getState().pending).toBe(0);
  expect(imports.stateStore.getState().failures).toEqual([]);
  input.model.cancelClose();
  expect(input.isEditable()).toBe(true);
  await sources.run({ kind: "choose-import" }, true);
  expect(request).toHaveBeenCalledTimes(1);
  receipt.resolve(saved(1));
  expect(await closing).toBe(false);
  input.model.dispose();
});

it("rechecks unresolved sources after saving and releases the failed close attempt", async () => {
  const receipt = deferredReceipt();
  const input = await setup(() => receipt.promise);
  const outside = new AttachmentImports(async () => []);
  const source = new File(["original"], "oversized.txt");
  Object.defineProperty(source, "size", { value: 25 * 1024 * 1024 + 1 });
  input.controller.edit("unsaved input");
  const closing = input.model.prepareClose();
  outside.importFiles([source], "drop");
  try {
    receipt.resolve(saved(1));
    expect(await closing).toBe(false);
    expect(input.isEditable()).toBe(true);
  } finally {
    outside.dispose();
    input.model.dispose();
  }
});

it("keeps source entry points frozen after a successful close until explicit cancellation", async () => {
  const request = vi.fn(
    async (): Promise<
      import("../../contracts/attachments").AttachmentReply
    > => ({ kind: "cancelled" }),
  );
  const input = await setup(
    async () => saved(1),
    () => draft,
    { request },
  );
  const state = input.model.stateStore.getState();
  if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
    throw Error("not ready");
  const sources = state.threadSelection.thread.attachments;
  if (!sources) throw Error("missing sources");
  expect(await input.model.prepareClose()).toBe(true);
  expect(await sources.run({ kind: "choose-import" }, true)).toBeNull();
  expect(request).not.toHaveBeenCalled();
  expect(await input.model.prepareClose()).toBe(false);
  input.model.cancelClose();
  expect(sources.stateStore.getState().acceptingSources).toBe(true);
  expect(await sources.run({ kind: "choose-import" }, true)).toEqual({
    kind: "cancelled",
  });
  input.model.dispose();
});

it("refuses close for late unconfirmed input on an inactive Thread, then admits normal confirmed owners on retry", async () => {
  let selected = draft;
  const stored = new Map([[draft.threadId, draft]]);
  const second = DraftSchema.parse({
    ...draft,
    threadId: crypto.randomUUID(),
    text: "second",
  });
  stored.set(second.threadId, second);
  const input = await setup(
    async (command) => {
      const saved = {
        kind: "saved" as const,
        threadId: command.threadId,
        revision: command.expectedRevision + 1,
      };
      const old = stored.get(command.threadId);
      if (!old) throw Error("missing draft");
      stored.set(command.threadId, {
        ...old,
        text: command.text,
        revision: saved.revision,
      });
      return saved;
    },
    () => stored.get(selected.threadId) ?? selected,
  );
  input.controller.edit("confirmed before switching");
  selected = second;
  expect(await input.model.selectThread(second.threadId)).toMatchObject({
    kind: "applied",
  });
  expect(await input.model.prepareClose()).toBe(true);
  input.model.cancelClose();
  // A retained old view or completion must keep its own unconfirmed body.
  input.controller.edit("late input on first");
  expect(await input.model.prepareClose()).toBe(false);
  expect(input.controller.getTextSnapshot()).toBe("late input on first");
  selected = draft;
  expect(await input.model.selectThread(draft.threadId)).toMatchObject({
    kind: "applied",
  });
  expect(await input.model.prepareClose()).toBe(true);
  input.model.cancelClose();
  expect(input.controller.getTextSnapshot()).toBe("late input on first");
  input.model.dispose();
});

it("rechecks inactive late input after the active close save and releases every owner for retry", async () => {
  let selected = draft;
  const second = DraftSchema.parse({
    ...draft,
    threadId: crypto.randomUUID(),
    text: "second",
  });
  const receipt = deferredReceipt();
  const input = await setup(
    async (command) =>
      command.threadId === second.threadId
        ? receipt.promise
        : saved(command.expectedRevision + 1),
    () => selected,
    { request: async () => ({ kind: "cancelled" }) },
  );
  selected = second;
  expect(await input.model.selectThread(second.threadId)).toMatchObject({
    kind: "applied",
  });
  const state = input.model.stateStore.getState();
  if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
    throw Error("not selected");
  const active = state.threadSelection.thread;
  active.controller.edit("active close body");
  const closing = input.model.prepareClose();
  expect(active.attachments?.stateStore.getState().acceptingSources).toBe(
    false,
  );
  input.controller.edit("late completion body on A");
  receipt.resolve({ kind: "saved", threadId: second.threadId, revision: 1 });
  expect(await closing).toBe(false);
  const blocked = input.model.stateStore.getState();
  if (blocked.kind !== "ready") throw Error("not ready");
  expect(blocked.notice?.message).toEqual({
    code: "draft.inactiveClosePending",
    params: { thread: draft.threadId.slice(0, 6) },
  });
  expect(active.attachments?.stateStore.getState().acceptingSources).toBe(true);
  selected = draft;
  expect(await input.model.selectThread(draft.threadId)).toMatchObject({
    kind: "applied",
  });
  expect(await input.model.prepareClose()).toBe(true);
  input.model.cancelClose();
  expect(input.controller.getTextSnapshot()).toBe("late completion body on A");
  input.model.dispose();
});

it("reads a new thread list after an in-flight pre-mutation sample instead of retaining the stale row", async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  let listCalls = 0;
  let release: (value: unknown) => void = () => {};
  const stale = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  const row = {
    threadId: draft.threadId,
    workingDirectoryId: draft.workingDirectoryId,
    directory: draft.directory,
    title: "Before",
  };
  const model = new AppModel({
    request: async (command) => {
      if (command.kind !== "list-threads")
        throw Error("Unexpected fixture request");
      listCalls++;
      return parseDesktopReply(
        command,
        listCalls === 1
          ? await stale
          : {
              kind: "threads",
              threads: [{ ...row, title: "After", completed: true }],
              projects: [],
            },
      );
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  });
  try {
    const existing = model.refreshThreads();
    const following = model.refreshThreads(true);
    release({ kind: "threads", threads: [row], projects: [] });
    await existing;
    await following;
    expect(listCalls).toBe(2);
    expect(model.threadListStore.getState().threads[0]).toMatchObject({
      title: "After",
      completed: true,
    });
  } finally {
    model.dispose();
  }
});
