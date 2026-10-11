import { expect, it } from "vitest";
import type { ConversationEvent } from "../contracts/public";
import { ConversationModel } from "./model";

it("releases timeline demand without erasing its view and ignores detached late events", () => {
  const callbacks: ((event: ConversationEvent) => void)[] = [];
  let releases = 0;
  const model = new ConversationModel({
    connect: (_thread, listener) => {
      callbacks.push(listener);
      return () => {
        releases++;
      };
    },
  });
  model.connect("thread");
  const snapshot = {
    kind: "snapshot",
    connectionGeneration: crypto.randomUUID(),
    seq: 1,
    gap: false,
    items: [],
  } as const;
  callbacks[0]?.(snapshot);
  model.disconnect();
  expect(releases).toBe(1);
  expect(model.getSnapshot()).toBe(snapshot);
  callbacks[0]?.({ ...snapshot, seq: 2 });
  expect(model.getSnapshot()?.seq).toBe(1);
  model.connect("thread");
  callbacks[1]?.({ ...snapshot, seq: 10 });
  expect(model.getSnapshot()?.seq).toBe(10);
  model.dispose();
});

it("clears the previous Thread projection while a new Thread awaits its snapshot", () => {
  const listeners: ((event: ConversationEvent) => void)[] = [];
  const model = new ConversationModel({
    connect: (_thread, listener) => {
      listeners.push(listener);
      return () => {};
    },
  });
  model.connect("first");
  listeners[0]?.({
    kind: "snapshot",
    connectionGeneration: crypto.randomUUID(),
    seq: 0,
    gap: false,
    items: [
      {
        id: 1,
        text: "first Thread",
        role: "assistant",
        state: "complete",
        label: { kind: "literal", text: "OMP" },
      },
    ],
  });
  model.connect("second");
  expect(model.getSnapshot()).toBeNull();
  listeners[0]?.({
    kind: "snapshot",
    connectionGeneration: crypto.randomUUID(),
    seq: 5,
    gap: false,
    items: [],
  });
  expect(model.getSnapshot()).toBeNull();
  model.dispose();
});

it("does not regress the current projection to a late snapshot of the same connectionGeneration", () => {
  let receive: (event: ConversationEvent) => void = () => {};
  const model = new ConversationModel({
    connect: (_thread, listener) => {
      receive = listener;
      return () => {};
    },
  });
  const connectionGeneration = crypto.randomUUID();
  model.connect("thread");
  receive({
    kind: "snapshot",
    connectionGeneration,
    seq: 2,
    gap: false,
    items: [],
  });
  receive({
    kind: "snapshot",
    connectionGeneration,
    seq: 1,
    gap: true,
    items: [],
  });
  expect(model.getSnapshot()?.seq).toBe(2);
  expect(model.getSnapshot()?.gap).toBe(false);
  model.dispose();
});

it("resynchronizes sequence gaps and ignores events from the detached port", async () => {
  const callbacks: ((event: ConversationEvent) => void)[] = [];
  const model = new ConversationModel({
    connect: (_thread, cb) => {
      callbacks.push(cb);
      return () => {};
    },
  });
  const connectionGeneration = crypto.randomUUID();
  model.connect("thread");
  const snapshot = {
    kind: "snapshot",
    connectionGeneration,
    seq: 0,
    items: [],
    gap: false,
  } as const;
  callbacks[0]?.({ ...snapshot, items: [] });
  callbacks[0]?.({
    kind: "update",
    connectionGeneration,
    seq: 2,
    droppedBefore: 0,
    gap: false,
    item: {
      id: 1,
      role: "assistant",
      text: "B",
      state: "complete",
      label: { kind: "literal", text: "OMP" },
    },
  });
  expect(model.getSnapshot()?.gap).toBe(true);
  await Promise.resolve();
  expect(callbacks).toHaveLength(2);
  callbacks[1]?.({
    kind: "update",
    connectionGeneration,
    seq: 1,
    droppedBefore: 0,
    gap: false,
    item: {
      id: 2,
      role: "assistant",
      text: "pending",
      state: "streaming",
      label: { kind: "literal", text: "OMP" },
    },
  });
  await Promise.resolve();
  expect(model.getSnapshot()?.seq).toBe(0);
  callbacks[1]?.({ ...snapshot, seq: 2, items: [] });
  callbacks[0]?.({ ...snapshot, seq: 99, items: [] });
  expect(model.getSnapshot()?.seq).toBe(2);
  model.dispose();
});
