import { expect, it, vi } from "vitest";
import { ThreadIdSchema } from "../../../shared/identity";
import type {
  AttentionBridge,
  AttentionSnapshot,
} from "../../contracts/attention";
import { AttentionModel } from "./attention-model";

const threadId = ThreadIdSchema.parse(crypto.randomUUID());
const instanceId = crypto.randomUUID();
function sample(revision = 1): AttentionSnapshot {
  return {
    instanceId,
    revision,
    entries: [
      {
        threadId,
        eventId: crypto.randomUUID(),
        traceId: crypto.randomUUID(),
        kind: "needs-answer",
        unread: true,
      },
    ],
    preferences: { system: false, completion: false },
    system: "disabled",
    coverageGap: false,
    openRequest: null,
  };
}
it("subscribes before sampling, preserves newest instance and revision, and closes independently of views", async () => {
  let receive: (snapshot: AttentionSnapshot) => void = () => {};
  let reply: (snapshot: AttentionSnapshot) => void = () => {};
  const stop = vi.fn();
  const bridge: AttentionBridge = {
    subscribe: (listener) => {
      receive = listener;
      return stop;
    },
    request: async (command) => ({
      kind: "snapshot",
      traceId: command.traceId,
      snapshot: await new Promise<AttentionSnapshot>((resolve) => {
        reply = resolve;
      }),
    }),
  };
  const model = new AttentionModel(bridge);
  const starting = model.start();
  const newest = { ...sample(2), instanceId: crypto.randomUUID() };
  receive(newest);
  reply(sample(99));
  await starting;
  expect(model.stateStore.getState().snapshot).toBe(newest);
  receive({ ...newest, revision: 1 });
  expect(model.stateStore.getState().snapshot).toBe(newest);
  model.dispose();
  model.dispose();
  receive({ ...newest, revision: 3 });
  expect(stop).toHaveBeenCalledTimes(1);
  expect(model.stateStore.getState().snapshot).toBe(newest);
});
it("keeps unchanged Thread entity references and sends explicit visible/seen/preferences/opened commands only", async () => {
  let receive: (snapshot: AttentionSnapshot) => void = () => {};
  const first = sample();
  const request = vi.fn<AttentionBridge["request"]>(async (command) => ({
    kind: "snapshot",
    traceId: command.traceId,
    snapshot: first,
  }));
  const model = new AttentionModel({
    request,
    subscribe: (listener) => {
      receive = listener;
      return () => {};
    },
  });
  await model.start();
  const entry = model.stateStore.getState().byThread.get(threadId);
  receive({
    ...first,
    revision: 2,
    entries: first.entries.map((item) => ({ ...item })),
  });
  expect(model.stateStore.getState().byThread.get(threadId)).toBe(entry);
  await model.visible(threadId);
  await model.visible(threadId);
  expect(
    request.mock.calls.filter(([command]) => command.kind === "visible"),
  ).toHaveLength(1);
  if (!entry) throw Error("missing entry");
  await model.seen(entry);
  await model.preferences({ system: true, completion: false });
  await model.opened(crypto.randomUUID());
  expect(request.mock.calls.map(([command]) => command.kind)).toEqual([
    "snapshot",
    "visible",
    "seen",
    "preferences",
    "opened",
  ]);
  model.dispose();
});
it("shows failure without retry or losing the prior snapshot, then explicit refresh recovers", async () => {
  const first = sample();
  const request = vi
    .fn<AttentionBridge["request"]>()
    .mockResolvedValueOnce({
      kind: "snapshot",
      traceId: crypto.randomUUID(),
      snapshot: first,
    })
    .mockRejectedValueOnce(Error("transport"))
    .mockResolvedValueOnce({
      kind: "snapshot",
      traceId: crypto.randomUUID(),
      snapshot: { ...first, revision: 2 },
    });
  const model = new AttentionModel({ request, subscribe: () => () => {} });
  await model.start();
  await model.preferences({ system: true, completion: false });
  expect(model.stateStore.getState().failed).toBe(true);
  expect(model.stateStore.getState().snapshot).toBe(first);
  expect(request).toHaveBeenCalledTimes(2);
  await model.refresh();
  expect(model.stateStore.getState().failed).toBe(false);
  expect(request).toHaveBeenCalledTimes(3);
  model.dispose();
});

it("does not return to a retired Main instance and explicit same-version refresh clears read failure", async () => {
  let receive: (snapshot: AttentionSnapshot) => void = () => {};
  const initial = sample();
  let latest = initial;
  const request = vi.fn<AttentionBridge["request"]>(async (command) => ({
    kind: "snapshot",
    traceId: command.traceId,
    snapshot: latest,
  }));
  const model = new AttentionModel({
    request,
    subscribe: (listener) => {
      receive = listener;
      return () => {};
    },
  });
  await model.start();
  latest = { ...sample(), instanceId: crypto.randomUUID() };
  receive(latest);
  receive({ ...initial, revision: 999 });
  expect(model.stateStore.getState().snapshot).toBe(latest);
  request.mockRejectedValueOnce(Error("read"));
  await model.refresh();
  expect(model.stateStore.getState().failed).toBe(true);
  await model.refresh();
  expect(model.stateStore.getState().failed).toBe(false);
  model.dispose();
});
