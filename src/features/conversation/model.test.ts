import { expect, it } from "vitest";
import type { ConversationEvent } from "./contracts";
import { ConversationModel } from "./model";

it("resynchronizes sequence gaps and ignores events from the detached port", async () => {
  const callbacks: ((event: ConversationEvent) => void)[] = [];
  const model = new ConversationModel({
    connect: (_thread, cb) => {
      callbacks.push(cb);
      return () => {};
    },
  });
  const generation = crypto.randomUUID();
  model.connect("thread");
  const snapshot = {
    kind: "snapshot",
    generation,
    seq: 0,
    items: [],
    gap: false,
  } as const;
  callbacks[0]?.({ ...snapshot, items: [] });
  callbacks[0]?.({
    kind: "update",
    generation,
    seq: 2,
    droppedBefore: 0,
    gap: false,
    item: {
      id: 1,
      role: "assistant",
      text: "B",
      state: "complete",
      label: "OMP",
    },
  });
  expect(model.getSnapshot()?.gap).toBe(true);
  await Promise.resolve();
  expect(callbacks).toHaveLength(2);
  callbacks[1]?.({
    kind: "update",
    generation,
    seq: 1,
    droppedBefore: 0,
    gap: false,
    item: {
      id: 2,
      role: "assistant",
      text: "pending",
      state: "streaming",
      label: "OMP",
    },
  });
  await Promise.resolve();
  expect(model.getSnapshot()?.seq).toBe(0);
  callbacks[1]?.({ ...snapshot, seq: 2, items: [] });
  callbacks[0]?.({ ...snapshot, seq: 99, items: [] });
  expect(model.getSnapshot()?.seq).toBe(2);
  model.dispose();
});
