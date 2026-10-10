import { expect, it } from "vitest";
import type { ConversationEvent, ConversationItem } from "../contracts/public";
import { ConversationModel } from "./model";

const item = (
  id: number,
  text: string,
  state: ConversationItem["state"] = "complete",
): ConversationItem => ({
  id,
  role: "assistant",
  text,
  state,
  label: { kind: "literal", text: "OMP" },
});

function connected(): {
  model: ConversationModel;
  deliver: (event: ConversationEvent) => void;
  connectionGeneration: string;
} {
  let deliver: (event: ConversationEvent) => void = () => {};
  const model = new ConversationModel({
    connect: (_thread, listener) => {
      deliver = listener;
      return () => {};
    },
  });
  model.connect("thread");
  const connectionGeneration = crypto.randomUUID();
  return { model, deliver, connectionGeneration };
}

it("notifies an entity subscriber only for the entity it selected", () => {
  const { model, deliver, connectionGeneration } = connected();
  deliver({
    kind: "snapshot",
    connectionGeneration,
    seq: 0,
    items: [item(1, "A"), item(2, "B")],
    gap: false,
  });
  let first = 0;
  let second = 0;
  const release = model.subscribeTo(
    (state) => state.itemsById.get(1),
    () => {
      first += 1;
    },
  );
  model.subscribeTo(
    (state) => state.itemsById.get(2),
    () => {
      second += 1;
    },
  );
  deliver({
    kind: "update",
    connectionGeneration,
    seq: 1,
    droppedBefore: 0,
    gap: false,
    item: item(2, "B2", "streaming"),
  });
  expect(first).toBe(0);
  expect(second).toBe(1);
  deliver({
    kind: "update",
    connectionGeneration,
    seq: 2,
    droppedBefore: 0,
    gap: false,
    item: item(1, "A2"),
  });
  expect(first).toBe(1);
  expect(second).toBe(1);
  release();
  deliver({
    kind: "update",
    connectionGeneration,
    seq: 3,
    droppedBefore: 0,
    gap: false,
    item: item(1, "A3"),
  });
  expect(first).toBe(1);
  model.dispose();
});

it("keeps whole-state subscribers unaffected by fine grained selection", () => {
  const { model, deliver, connectionGeneration } = connected();
  let changes = 0;
  const release = model.subscribe(() => {
    changes += 1;
  });
  deliver({
    kind: "snapshot",
    connectionGeneration,
    seq: 0,
    items: [item(1, "A"), item(2, "B")],
    gap: false,
  });
  expect(changes).toBe(1);
  deliver({
    kind: "update",
    connectionGeneration,
    seq: 1,
    droppedBefore: 0,
    gap: false,
    item: item(1, "A2"),
  });
  expect(changes).toBe(2);
  release();
  deliver({
    kind: "update",
    connectionGeneration,
    seq: 2,
    droppedBefore: 0,
    gap: false,
    item: item(1, "A3"),
  });
  expect(changes).toBe(2);
  model.dispose();
});

it("publishes stable native membership and independent immutable entity snapshots", () => {
  const { model, deliver, connectionGeneration } = connected();
  deliver({
    kind: "snapshot",
    connectionGeneration,
    seq: 0,
    items: [item(1, "old"), item(2, "tail", "streaming")],
    gap: false,
  });
  const before = model.stateStore.getState();
  const beforeSnapshot = model.getSnapshot();
  deliver({
    kind: "update",
    connectionGeneration,
    seq: 1,
    droppedBefore: 0,
    gap: false,
    item: item(2, "tail grows", "streaming"),
  });
  const streamed = model.stateStore.getState();
  expect(streamed.nativeIdentities).toEqual([1, 2]);
  expect(streamed.nativeIdentities).toBe(before.nativeIdentities);
  expect(streamed.itemIds).toBe(before.itemIds);
  expect(before.itemsById.get(2)?.text).toBe("tail");
  expect(beforeSnapshot?.items[1]?.text).toBe("tail");
  expect(streamed.itemsById.get(1)).toBe(before.itemsById.get(1));
  deliver({
    kind: "update",
    connectionGeneration,
    seq: 2,
    droppedBefore: 2,
    gap: true,
    item: { ...item(2, "tail grows"), nativeRecordId: "native-tail" },
  });
  const finished = model.stateStore.getState();
  expect(finished.nativeIdentities).toEqual(["native-tail"]);
  expect(finished.itemsById.get(1)).toBeUndefined();
  expect(streamed.itemsById.get(1)?.text).toBe("old");
  expect(model.getSnapshot()?.items).toEqual([
    { ...item(2, "tail grows"), nativeRecordId: "native-tail" },
  ]);
  model.dispose();
});
