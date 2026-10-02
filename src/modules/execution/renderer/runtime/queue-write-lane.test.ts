import { expect, it } from "vitest";
import { ThreadIdSchema } from "../../../../shared/identity";
import type {
  RuntimeCommand,
  RuntimeReply,
  RuntimeView,
} from "../../contracts/public";
import { RuntimeViewSchema } from "../../contracts/public";
import { RuntimeModel } from "./runtime-model";

const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
async function fixture() {
  const entryId = crypto.randomUUID();
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  let view = RuntimeViewSchema.parse({
    threadId,
    traceId: crypto.randomUUID(),
    revision: 0,
    phase: "ready",
    trusted: true,
    busy: true,
    configuration: { code: "runtime.configDefault" },
    model: "fixture",
    message: { code: "runtime.readyToSend" },
    connectionGeneration: crypto.randomUUID(),
    control: {
      paused: false,
      stopping: false,
      pendingAsync: false,
      admitted: false,
      streaming: true,
      compacting: false,
      queued: 1,
      background: 0,
      queue: [],
      queueState: {
        revision: 10,
        hiddenCount: 0,
        coverage: "complete",
        editing: { entryId, draftText: "original" },
        items: [
          {
            id: entryId,
            kind: "followUp",
            text: "original",
            editable: true,
            editing: true,
            truncated: false,
          },
        ],
      },
    },
  });
  const calls: {
    command: RuntimeCommand;
    resolve(value: RuntimeReply): void;
    reject(error: Error): void;
  }[] = [];
  let deliver: (next: RuntimeView) => void = () => {};
  const model = new RuntimeModel({
    subscribe: (listener) => {
      deliver = listener;
      return () => {};
    },
    request: async (command) => {
      if (command.kind === "inspect") return { kind: "view", view };
      return new Promise<RuntimeReply>((resolve, reject) => {
        calls.push({ command, resolve, reject });
      });
    },
  });
  await model.bind(threadId);
  return {
    model,
    calls,
    entryId,
    threadId,
    view: () => view,
    publish(next: RuntimeView) {
      view = next;
      deliver(next);
    },
    confirm(index: number, revision: number, draftText: string) {
      const call = calls[index];
      if (!call || !view.control?.queueState)
        throw Error("missing fixture command");
      view = {
        ...view,
        revision: view.revision + 1,
        queueOperation: {
          traceId: call.command.traceId,
          status: "acknowledged",
        },
        control: {
          ...view.control,
          queueState: {
            ...view.control.queueState,
            revision,
            editing: { entryId, draftText },
          },
        },
      };
      call.resolve({ kind: "view", view });
    },
  };
}

it("serializes rapid draft updates with newly confirmed revisions; save follows the last draft", async () => {
  const f = await fixture();
  const first = f.model.manageQueue({
    action: "update-edit",
    entryId: f.entryId,
    revision: 10,
    text: "a",
  });
  const second = f.model.manageQueue({
    action: "update-edit",
    entryId: f.entryId,
    revision: 10,
    text: "ab",
  });
  const save = f.model.manageQueue({
    action: "save-edit",
    entryId: f.entryId,
    revision: 10,
    text: "ab",
  });
  await turn();
  expect(f.calls).toHaveLength(1);
  f.confirm(0, 11, "a");
  await first;
  await turn();
  expect(f.calls).toHaveLength(2);
  expect(f.calls[1]?.command).toMatchObject({
    kind: "manage-queue",
    command: { action: "update-edit", revision: 11, text: "ab" },
  });
  f.confirm(1, 12, "ab");
  await second;
  await turn();
  expect(f.calls).toHaveLength(3);
  expect(f.calls[2]?.command).toMatchObject({
    kind: "manage-queue",
    command: { action: "save-edit", revision: 12, text: "ab" },
  });
  f.confirm(2, 13, "ab");
  await save;
  f.model.dispose();
});

it("drops old queued draft text across bind instead of addressing the new Thread", async () => {
  const f = await fixture();
  const first = f.model.manageQueue({
    action: "update-edit",
    entryId: f.entryId,
    revision: 10,
    text: "old sent",
  });
  const queued = f.model.manageQueue({
    action: "update-edit",
    entryId: f.entryId,
    revision: 10,
    text: "old unsent private draft",
  });
  await turn();
  const next = {
    ...f.view(),
    threadId: ThreadIdSchema.parse(crypto.randomUUID()),
    connectionGeneration: crypto.randomUUID(),
    revision: 100,
  };
  f.publish(next);
  await f.model.bind(next.threadId);
  f.calls[0]?.resolve({ kind: "view", view: f.view() });
  await Promise.all([first, queued]);
  expect(f.calls).toHaveLength(1);
  expect(f.model.getSnapshot()?.threadId).toBe(next.threadId);
  f.model.dispose();
});

it("old connection rejection cannot label a new connection of the same Thread unknown", async () => {
  const f = await fixture();
  const pending = f.model.manageQueue({
    action: "update-edit",
    entryId: f.entryId,
    revision: 10,
    text: "old generation",
  });
  await turn();
  const next = {
    ...f.view(),
    connectionGeneration: crypto.randomUUID(),
    revision: 100,
    queueOperation: undefined,
  };
  f.publish(next);
  f.calls[0]?.reject(Error("old native channel disconnected"));
  await pending;
  expect(f.model.getSnapshot()?.connectionGeneration).toBe(
    next.connectionGeneration,
  );
  expect(f.model.getSnapshot()?.queueOperation).toBeUndefined();
  f.model.dispose();
});

it("late successful reply from old connection cannot restore its snapshot over a new connection", async () => {
  const f = await fixture();
  const old = f.view();
  const pending = f.model.manageQueue({
    action: "update-edit",
    entryId: f.entryId,
    revision: 10,
    text: "old generation",
  });
  await turn();
  const next = {
    ...old,
    connectionGeneration: crypto.randomUUID(),
    revision: 100,
  };
  f.publish(next);
  f.calls[0]?.resolve({
    kind: "view",
    view: {
      ...old,
      revision: 101,
      queueOperation: {
        traceId: f.calls[0].command.traceId,
        status: "acknowledged",
      },
    },
  });
  await pending;
  expect(f.model.getSnapshot()?.connectionGeneration).toBe(
    next.connectionGeneration,
  );
  expect(f.model.getSnapshot()?.revision).toBe(100);
  f.model.dispose();
});

it("unknown suppresses queued writes; inspected reconciled snapshot allows a fresh explicit operation", async () => {
  const f = await fixture();
  const uncertain = {
    ...f.view(),
    revision: 1,
    queueOperation: {
      traceId: crypto.randomUUID(),
      status: "unknown" as const,
    },
  };
  f.publish(uncertain);
  await f.model.manageQueue({
    action: "save-edit",
    entryId: f.entryId,
    revision: 10,
    text: "not retried",
  });
  expect(f.calls).toHaveLength(0);
  const reconciled = {
    ...uncertain,
    revision: 2,
    queueOperation: { ...uncertain.queueOperation, reconciled: true },
  };
  f.publish(reconciled);
  await f.model.act("inspect");
  expect(f.calls).toHaveLength(0);
  expect(f.model.getSnapshot()?.queueOperation?.status).toBe("unknown");
  const fresh = f.model.manageQueue({
    action: "cancel-edit",
    entryId: f.entryId,
    revision: 10,
  });
  await turn();
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0]?.command).toMatchObject({
    kind: "manage-queue",
    command: { action: "cancel-edit" },
  });
  f.confirm(0, 11, "original");
  await fresh;
  f.model.dispose();
});

it("cancel queued after draft acknowledgement uses the same edit's newest revision", async () => {
  const f = await fixture();
  const update = f.model.manageQueue({
    action: "update-edit",
    entryId: f.entryId,
    revision: 10,
    text: "discard me",
  });
  const cancel = f.model.manageQueue({
    action: "cancel-edit",
    entryId: f.entryId,
    revision: 10,
  });
  await turn();
  f.confirm(0, 11, "discard me");
  await update;
  await turn();
  expect(f.calls[1]?.command).toMatchObject({
    kind: "manage-queue",
    command: { action: "cancel-edit", revision: 11 },
  });
  f.confirm(1, 12, "original");
  await cancel;
  f.model.dispose();
});
