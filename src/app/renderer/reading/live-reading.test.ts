import { expect, it, vi } from "vitest";
import type {
  ConversationEvent,
  ConversationItem,
} from "../../../modules/conversation/contracts/public";
import { ConversationModel } from "../../../modules/conversation/core/public";
import { observeLiveReadingUpdates } from "./live-reading";

const item = (text: string, id = 1): ConversationItem => ({
  id,
  text,
  role: "assistant",
  state: "streaming",
  label: { kind: "literal", text: "OMP" },
});
function fixture() {
  let deliver: (event: ConversationEvent) => void = () => {};
  const model = new ConversationModel({
    connect: (_thread, listener) => {
      deliver = listener;
      return () => {};
    },
  });
  model.connect("a");
  deliver({
    kind: "snapshot",
    connectionGeneration: "gen-a",
    seq: 0,
    gap: false,
    items: [item("start")],
  });
  let atEnd = false;
  let listener: () => void = () => {};
  const onChange = vi.fn();
  const dispose = observeLiveReadingUpdates({
    model,
    anchor: {
      getSnapshot: () => atEnd,
      subscribe: (callback) => {
        listener = callback;
        return () => {
          listener = () => {};
        };
      },
    },
    onChange,
  });
  return {
    model,
    onChange,
    dispose,
    deliver: (event: ConversationEvent) => deliver(event),
    end: (value: boolean) => {
      atEnd = value;
      listener();
    },
  };
}
it("announces same-entity body output while away without requiring new message IDs", () => {
  const f = fixture();
  try {
    f.deliver({
      kind: "update",
      connectionGeneration: "gen-a",
      seq: 1,
      gap: false,
      droppedBefore: 0,
      item: item("start and more"),
    });
    expect(f.onChange).toHaveBeenLastCalledWith(true);
    f.end(true);
    expect(f.onChange).toHaveBeenLastCalledWith(false);
  } finally {
    f.dispose();
    f.model.dispose();
  }
});

it("ignores loading, receipt-like notices, unchanged snapshots and completion metadata, but recognizes an appended body", () => {
  const f = fixture();
  try {
    f.model.connect("a");
    f.deliver({
      kind: "snapshot",
      connectionGeneration: "gen-a",
      seq: 0,
      gap: true,
      items: [{ ...item("start"), state: "complete" }],
    });
    f.deliver({
      kind: "update",
      connectionGeneration: "gen-a",
      seq: 1,
      gap: true,
      droppedBefore: 0,
      item: {
        ...item("receipt metadata", 2),
        role: "notice",
        notice: { code: "conversation.truncated" },
      },
    });
    f.deliver({
      kind: "update",
      connectionGeneration: "gen-a",
      seq: 2,
      gap: true,
      droppedBefore: 0,
      item: item("", 3),
    });
    expect(f.onChange).toHaveBeenCalledTimes(1);
    f.deliver({
      kind: "update",
      connectionGeneration: "gen-a",
      seq: 3,
      gap: true,
      droppedBefore: 0,
      item: item("new body", 4),
    });
    expect(f.onChange).toHaveBeenLastCalledWith(true);
  } finally {
    f.dispose();
    f.model.dispose();
  }
});

it("resets the prompt baseline for a different source, a new Thread, and a newly visible reading period", () => {
  const f = fixture();
  try {
    f.deliver({
      kind: "update",
      connectionGeneration: "gen-a",
      seq: 1,
      gap: false,
      droppedBefore: 0,
      item: item("more"),
    });
    expect(f.onChange).toHaveBeenLastCalledWith(true);
    f.deliver({
      kind: "snapshot",
      connectionGeneration: "gen-b",
      seq: 0,
      gap: false,
      items: [item("different")],
    });
    expect(f.onChange).toHaveBeenLastCalledWith(false);
    f.deliver({
      kind: "update",
      connectionGeneration: "gen-b",
      seq: 1,
      gap: false,
      droppedBefore: 0,
      item: item("different more"),
    });
    expect(f.onChange).toHaveBeenLastCalledWith(true);
    f.model.connect("b");
    expect(f.onChange).toHaveBeenLastCalledWith(false);
    f.deliver({
      kind: "snapshot",
      connectionGeneration: "gen-b",
      seq: 0,
      gap: false,
      items: [item("b baseline")],
    });
    f.dispose();
    const afterDispose = f.onChange.mock.calls.length;
    f.deliver({
      kind: "update",
      connectionGeneration: "gen-b",
      seq: 1,
      gap: false,
      droppedBefore: 0,
      item: item("hidden more"),
    });
    expect(f.onChange).toHaveBeenCalledTimes(afterDispose);
    const onChange = vi.fn();
    const release = observeLiveReadingUpdates({
      model: f.model,
      anchor: { getSnapshot: () => false, subscribe: () => () => {} },
      onChange,
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(false);
    release();
  } finally {
    f.dispose();
    f.model.dispose();
  }
});

it("continues following without announcing new output and keeps updates after clear relative to the new baseline", () => {
  const f = fixture();
  try {
    f.end(true);
    f.deliver({
      kind: "update",
      connectionGeneration: "gen-a",
      seq: 1,
      gap: false,
      droppedBefore: 0,
      item: item("followed"),
    });
    expect(f.onChange).toHaveBeenCalledExactlyOnceWith(false);
    f.end(false);
    f.deliver({
      kind: "snapshot",
      connectionGeneration: "gen-a",
      seq: 1,
      gap: false,
      items: [item("followed")],
    });
    expect(f.onChange).toHaveBeenCalledTimes(1);
    f.deliver({
      kind: "update",
      connectionGeneration: "gen-a",
      seq: 2,
      gap: false,
      droppedBefore: 0,
      item: item("unfollowed more"),
    });
    expect(f.onChange).toHaveBeenLastCalledWith(true);
    f.deliver({
      kind: "snapshot",
      connectionGeneration: "gen-a",
      seq: 2,
      gap: false,
      items: [item("unfollowed more")],
    });
    expect(f.onChange).toHaveBeenCalledTimes(2);
  } finally {
    f.dispose();
    f.model.dispose();
  }
});
