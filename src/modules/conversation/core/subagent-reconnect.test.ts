import { expect, it } from "vitest";
import { ConversationModel } from "./model";

it("bounds consecutive incomplete reconnects and lets an explicit reconnect try again", async () => {
  let connects = 0;
  const generation = crypto.randomUUID();
  const model = new ConversationModel({
    connect: (_thread, listener) => {
      connects++;
      listener({
        kind: "snapshot",
        connectionGeneration: generation,
        seq: 0,
        gap: false,
        items: [],
      });
      listener({
        kind: "update",
        connectionGeneration: generation,
        seq: 2,
        gap: false,
        droppedBefore: 0,
        item: {
          id: 1,
          role: "assistant",
          text: "gap",
          state: "complete",
          label: { kind: "literal", text: "OMP" },
        },
      });
      return () => {};
    },
  });
  try {
    model.connect("thread");
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(connects).toBe(4);
    expect(model.stateStore.getState().resyncExhausted).toBe(true);
    expect(model.getSnapshot()?.gap).toBe(true);
    model.connect("thread");
    expect(connects).toBe(5);
  } finally {
    model.dispose();
  }
});
