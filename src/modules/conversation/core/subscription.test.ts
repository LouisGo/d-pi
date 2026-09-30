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
  generation: string;
} {
  let deliver: (event: ConversationEvent) => void = () => {};
  const model = new ConversationModel({
    connect: (_thread, listener) => {
      deliver = listener;
      return () => {};
    },
  });
  model.connect("thread");
  const generation = crypto.randomUUID();
  return { model, deliver, generation };
}

it("notifies an entity subscriber only for the entity it selected", () => {
  const { model, deliver, generation } = connected();
  deliver({
    kind: "snapshot",
    generation,
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
    generation,
    seq: 1,
    droppedBefore: 0,
    gap: false,
    item: item(2, "B2", "streaming"),
  });
  expect(first).toBe(0);
  expect(second).toBe(1);
  deliver({
    kind: "update",
    generation,
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
    generation,
    seq: 3,
    droppedBefore: 0,
    gap: false,
    item: item(1, "A3"),
  });
  expect(first).toBe(1);
  model.dispose();
});

it("keeps whole-state subscribers unaffected by fine grained selection", () => {
  const { model, deliver, generation } = connected();
  let changes = 0;
  const release = model.subscribe(() => {
    changes += 1;
  });
  deliver({
    kind: "snapshot",
    generation,
    seq: 0,
    items: [item(1, "A"), item(2, "B")],
    gap: false,
  });
  expect(changes).toBe(1);
  deliver({
    kind: "update",
    generation,
    seq: 1,
    droppedBefore: 0,
    gap: false,
    item: item(1, "A2"),
  });
  expect(changes).toBe(2);
  release();
  deliver({
    kind: "update",
    generation,
    seq: 2,
    droppedBefore: 0,
    gap: false,
    item: item(1, "A3"),
  });
  expect(changes).toBe(2);
  model.dispose();
});
