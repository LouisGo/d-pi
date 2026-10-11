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

it("publishes change evidence separately from body appends and catches same-count path replacements", () => {
  const { model, deliver, connectionGeneration } = connected();
  const observed = (
    path: string,
    phase: "intent" | "result",
  ): ConversationItem => ({
    ...item(1, "", "complete"),
    role: "tool",
    tool: {
      toolCallId: "edit-1",
      name: "edit",
      lifecycle: "succeeded",
      coverage: "complete",
      truncated: false,
      observed: { start: true, end: true, result: true },
      semantic: {
        kind: "file-change",
        transportTool: "edit",
        effectiveTool: "edit",
        phase,
        partial: false,
        truncated: false,
        changes: [{ path, failed: false, snapshotsPruned: false }],
      },
    },
  });
  deliver({
    kind: "snapshot",
    connectionGeneration,
    seq: 0,
    gap: false,
    items: [observed("intent.ts", "intent")],
  });
  const before = model.stateStore.getState().changeRevision;
  deliver({
    kind: "update",
    connectionGeneration,
    seq: 1,
    gap: false,
    droppedBefore: 0,
    item: observed("a.ts", "result"),
  });
  expect(model.stateStore.getState().changeRevision).toBe(before + 1);
  deliver({
    kind: "update",
    connectionGeneration,
    seq: 2,
    gap: false,
    droppedBefore: 0,
    item: observed("b.ts", "result"),
  });
  expect(model.stateStore.getState().changeRevision).toBe(before + 2);
  const result = observed("b.ts", "result");
  const { text: _text, ...metadata } = result;
  for (let seq = 3; seq < 103; seq++)
    deliver({
      kind: "append",
      connectionGeneration,
      seq,
      gap: false,
      droppedBefore: 0,
      item: metadata,
      text: "x",
      thinking: "",
    });
  expect(model.stateStore.getState().changeRevision).toBe(before + 2);
  model.dispose();
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
it("applies only ordered same-generation appends and replaces them with an exact final", async () => {
  const { model, deliver, connectionGeneration } = connected();
  deliver({
    kind: "snapshot",
    connectionGeneration,
    seq: 0,
    gap: false,
    items: [item(1, "A", "streaming"), item(2, "B")],
  });
  const untouched = model.stateStore.getState().itemsById.get(2);
  const metadata = {
    id: 1,
    role: "assistant",
    state: "streaming",
    label: { kind: "literal", text: "OMP" },
  } as const;
  deliver({
    kind: "append",
    connectionGeneration,
    seq: 1,
    gap: false,
    droppedBefore: 0,
    item: metadata,
    text: "+new",
    thinking: "thought",
  });
  expect(model.stateStore.getState().itemsById.get(1)).toMatchObject({
    text: "A+new",
    thinking: "thought",
  });
  expect(model.stateStore.getState().itemsById.get(2)).toBe(untouched);
  deliver({
    kind: "append",
    connectionGeneration: crypto.randomUUID(),
    seq: 2,
    gap: false,
    droppedBefore: 0,
    item: metadata,
    text: "foreign",
    thinking: "",
  });
  expect(model.stateStore.getState().itemsById.get(1)?.text).toBe("A+new");
  deliver({
    kind: "update",
    connectionGeneration,
    seq: 2,
    gap: false,
    droppedBefore: 0,
    item: item(1, "final"),
    bodyMode: "final",
  });
  expect(model.stateStore.getState().itemsById.get(1)?.text).toBe("final");
  deliver({
    kind: "append",
    connectionGeneration,
    seq: 3,
    gap: false,
    droppedBefore: 0,
    item: { ...metadata, id: 100 },
    text: "no base",
    thinking: "",
  });
  expect(model.getSnapshot()?.gap).toBe(true);
  expect(model.stateStore.getState().itemsById.get(100)).toBeUndefined();
  model.dispose();
  await Promise.resolve();
});

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
