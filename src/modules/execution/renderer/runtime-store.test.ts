import { expect, it } from "vitest";
import { type ThreadId, ThreadIdSchema } from "../../../shared/identity";
import type { RuntimeReply, RuntimeView } from "../contracts/public";
import { RuntimeModel } from "./runtime-model";

const ready = (threadId: ThreadId, revision: number): RuntimeView => ({
  threadId,
  traceId: crypto.randomUUID(),
  configuration: { code: "runtime.configDefault" },
  revision,
  phase: "ready",
  trusted: true,
  busy: false,
  model: "fixture",
  message: { code: "runtime.readyToSend" },
});

function deliverable(): {
  model: RuntimeModel;
  deliver: (view: RuntimeView) => void;
  released: () => boolean;
} {
  let deliver: (view: RuntimeView) => void = () => {};
  let removed = false;
  const model = new RuntimeModel({
    // `bind` starts an inspect request; keeping it pending means only the
    // delivered native views can change state during the assertions.
    request: () => new Promise<RuntimeReply>(() => {}),
    subscribe: (listener) => {
      deliver = listener;
      return () => {
        removed = true;
      };
    },
  });
  return {
    model,
    deliver: (view) => {
      if (!removed) deliver(view);
    },
    released: () => removed,
  };
}

it("notifies a selected projection only when that projection changes", () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const { model, deliver } = deliverable();
  model.bind(threadId);
  const revisions: (number | undefined)[] = [];
  const busies: (boolean | undefined)[] = [];
  model.subscribeTo(
    (state) => state.view?.revision,
    () => {
      revisions.push(model.getSnapshot()?.revision);
    },
  );
  model.subscribeTo(
    (state) => state.view?.busy,
    () => {
      busies.push(model.getSnapshot()?.busy);
    },
  );
  deliver(ready(threadId, 1));
  expect(revisions).toEqual([1]);
  expect(busies).toEqual([false]);
  deliver({ ...ready(threadId, 2), busy: true });
  expect(revisions).toEqual([1, 2]);
  expect(busies).toEqual([false, true]);
  deliver({ ...ready(threadId, 2), busy: true });
  expect(revisions).toEqual([1, 2]);
  expect(busies).toEqual([false, true]);
  model.dispose();
});

it("keeps whole-state subscribers notified for every accepted view", () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const { model, deliver } = deliverable();
  model.bind(threadId);
  let changes = 0;
  model.subscribe(() => {
    changes += 1;
  });
  deliver(ready(threadId, 1));
  deliver(ready(threadId, 2));
  expect(changes).toBe(2);
  model.dispose();
});

it("ignores views from a thread that is no longer bound", () => {
  const first = ThreadIdSchema.parse(crypto.randomUUID());
  const second = ThreadIdSchema.parse(crypto.randomUUID());
  const { model, deliver } = deliverable();
  model.bind(first);
  deliver(ready(first, 3));
  const bound = model.getSnapshot();
  expect(bound?.threadId).toBe(first);
  model.bind(second);
  // Binding another thread keeps the last visible view until that thread
  // reports its own state; a stale view from the old thread must not apply.
  expect(model.getSnapshot()).toEqual(bound);
  deliver(ready(first, 4));
  expect(model.getSnapshot()).toEqual(bound);
  model.dispose();
});

it("does not publish after dispose and releases the native subscription", () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const { model, deliver, released } = deliverable();
  model.bind(threadId);
  let changes = 0;
  model.subscribe(() => {
    changes += 1;
  });
  deliver(ready(threadId, 1));
  expect(changes).toBe(1);
  model.dispose();
  expect(released()).toBe(true);
  const before = model.getSnapshot();
  deliver(ready(threadId, 2));
  expect(model.getSnapshot()).toEqual(before);
  expect(changes).toBe(1);
});

it("keeps the visible state when a superseded native reply arrives later", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  let deliver: (view: RuntimeView) => void = () => {};
  let finish: (reply: RuntimeReply) => void = () => {};
  const model = new RuntimeModel({
    request: () =>
      new Promise<RuntimeReply>((accept) => {
        finish = accept;
      }),
    subscribe: (listener) => {
      deliver = listener;
      return () => {};
    },
  });
  void model.bind(threadId);
  const requested = model.act("inspect");
  deliver(ready(threadId, 9));
  finish({ kind: "view", view: ready(threadId, 4) });
  await requested;
  expect(model.getSnapshot()?.revision).toBe(9);
  model.dispose();
});
