import assert from "node:assert/strict";
import test from "node:test";
import { NativeQueueManager } from "../../runtime/native-queue.mjs";
import { ConsumptionGate } from "../../src/platform/omp/consumption-gate.ts";

const user = (text) => ({
  role: "user",
  content: [{ type: "text", text }],
  timestamp: 1,
});
function fixture(steering = [], followUp = [], prepareQueuedMessages) {
  const listeners = new Set();
  const agent = {
    prepareQueuedMessages,
    peekSteeringQueue: () => steering,
    peekFollowUpQueue: () => followUp,
    onQueueChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replaceQueue: (kind, messages) => {
      if (kind === "steering") steering = [...messages];
      else followUp = [...messages];
      for (const listener of listeners) listener();
    },
  };
  const session = { agent, runModeExitTeardown: async (fn) => fn() };
  return {
    agent,
    session,
    queue: new NativeQueueManager(session, {
      gate: new ConsumptionGate(),
      isCompanion: (message) =>
        message.role === "custom" &&
        message.display === false &&
        message.attribution === "user",
    }),
  };
}

test("native object identities distinguish duplicate text and survive reorder; hidden messages are not editable entries", () => {
  const first = user("same"),
    second = user("same");
  const hidden = {
    role: "custom",
    attribution: "user",
    display: false,
    customType: "image-attachment",
  };
  const f = fixture([], [hidden, first, second]);
  const before = f.queue.snapshot();
  assert.equal(before.items.length, 2);
  assert.notEqual(before.items[0].id, before.items[1].id);
  f.agent.replaceQueue("followUp", [second, hidden, first]);
  const after = f.queue.snapshot();
  assert.deepEqual(
    after.items.map((entry) => entry.id),
    before.items.map((entry) => entry.id).reverse(),
  );
  assert.ok(after.revision > before.revision);
});

test("editing waits at native delivery, lets earlier messages proceed, and cancellation resumes original content", async () => {
  const earlier = user("earlier"),
    editing = user("original"),
    later = user("later");
  const f = fixture([], [earlier, editing, later]);
  const start = f.queue.snapshot();
  const state = await f.queue.execute({
    action: "begin-edit",
    entryId: start.items[1].id,
    revision: start.revision,
  });
  assert.equal(state.items[1].editing, true);
  await f.agent.prepareQueuedMessages([earlier], new AbortController().signal);
  let delivered = false;
  const waiting = f.agent
    .prepareQueuedMessages([editing], new AbortController().signal)
    .then(() => {
      delivered = true;
    });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(delivered, false);
  await f.queue.execute({
    action: "cancel-edit",
    entryId: state.items[1].id,
    revision: state.revision,
  });
  await waiting;
  assert.equal(delivered, true);
  assert.equal(f.agent.peekFollowUpQueue()[1], editing);
});

test("draft is owned outside the view and save replaces only its pending native entry", async () => {
  const original = user("old"),
    sibling = user("other");
  const f = fixture([], [original, sibling]);
  let state = f.queue.snapshot();
  const entryId = state.items[0].id;
  state = await f.queue.execute({
    action: "begin-edit",
    entryId,
    revision: state.revision,
  });
  state = await f.queue.execute({
    action: "update-edit",
    entryId,
    revision: state.revision,
    text: "new",
  });
  assert.deepEqual(f.queue.snapshot().editing, { entryId, draftText: "new" });
  assert.equal(f.agent.peekFollowUpQueue()[0], original);
  state = await f.queue.execute({
    action: "save-edit",
    entryId,
    revision: state.revision,
  });
  assert.equal(state.editing, null);
  assert.equal(state.items[0].text, "new");
  assert.equal(state.items[0].id, entryId);
  assert.equal(f.agent.peekFollowUpQueue()[1], sibling);
});

test("native reorder and delete keep hidden companions with their owner and reject stale/consumed entries", async () => {
  const a = user("A"),
    b = user("B"),
    c = user("C");
  const companion = {
    role: "custom",
    attribution: "user",
    display: false,
    customType: "image-attachment",
  };
  const internal = {
    role: "custom",
    attribution: "agent",
    display: false,
    customType: "plan",
  };
  const f = fixture([], [a, internal, companion, b, c]);
  const before = f.queue.snapshot(),
    bId = before.items[1].id;
  const moved = await f.queue.execute({
    action: "move",
    entryId: bId,
    revision: before.revision,
    toIndex: 0,
  });
  assert.deepEqual(f.agent.peekFollowUpQueue(), [companion, b, a, internal, c]);
  await assert.rejects(
    f.queue.execute({
      action: "delete",
      entryId: bId,
      revision: before.revision,
    }),
    { code: "stale-revision" },
  );
  const removed = await f.queue.execute({
    action: "delete",
    entryId: bId,
    revision: moved.revision,
  });
  assert.deepEqual(f.agent.peekFollowUpQueue(), [a, internal, c]);
  await assert.rejects(
    f.queue.execute({
      action: "begin-edit",
      entryId: bId,
      revision: removed.revision,
    }),
    { code: "entry-consumed" },
  );
});

test("snapshot is bounded without truncating native contents and oversize entries cannot enter edit", async () => {
  const original = user("汉".repeat(100000));
  const f = fixture(
    [],
    [original, ...Array.from({ length: 140 }, () => user("x".repeat(10000)))],
  );
  const state = f.queue.snapshot();
  assert.equal(state.coverage, "limited");
  assert.equal(state.items[0].truncated, true);
  assert.equal(state.items[0].editable, false);
  assert.equal(state.hiddenCount, 13);
  assert.ok(Buffer.byteLength(JSON.stringify(state)) <= 524288);
  assert.equal(f.agent.peekFollowUpQueue()[0].content[0].text.length, 100000);
  await assert.rejects(
    f.queue.execute({
      action: "begin-edit",
      entryId: state.items[0].id,
      revision: state.revision,
    }),
    { code: "unsupported-content" },
  );
});

test("edit racing awaited SDK preparation still blocks delivery; abort does not discard the saved draft", async () => {
  const message = user("original");
  let releasePreparation;
  const staged = { commit: () => [] };
  const f = fixture(
    [],
    [message],
    () =>
      new Promise((resolve) => {
        releasePreparation = () => resolve(staged);
      }),
  );
  const controller = new AbortController();
  const delivery = f.agent.prepareQueuedMessages([message], controller.signal);
  await new Promise((resolve) => setImmediate(resolve));
  let state = f.queue.snapshot();
  const entryId = state.items[0].id;
  state = await f.queue.execute({
    action: "begin-edit",
    entryId,
    revision: state.revision,
  });
  state = await f.queue.execute({
    action: "update-edit",
    entryId,
    revision: state.revision,
    text: "draft after await",
  });
  releasePreparation();
  let committed = false;
  const pending = delivery.then(() => {
    committed = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(committed, false);
  controller.abort(new DOMException("stop", "AbortError"));
  await assert.rejects(pending, { name: "AbortError" });
  assert.deepEqual(f.queue.snapshot().editing, {
    entryId,
    draftText: "draft after await",
  });
  assert.equal(f.agent.peekFollowUpQueue()[0], message);
});

test("empty draft can survive view replacement but cannot be saved and lock stays active", async () => {
  const f = fixture([], [user("original")]);
  let state = f.queue.snapshot();
  const entryId = state.items[0].id;
  state = await f.queue.execute({
    action: "begin-edit",
    entryId,
    revision: state.revision,
  });
  state = await f.queue.execute({
    action: "update-edit",
    entryId,
    revision: state.revision,
    text: "",
  });
  assert.equal(state.editing.draftText, "");
  await assert.rejects(
    f.queue.execute({ action: "save-edit", entryId, revision: state.revision }),
    { code: "invalid-content" },
  );
  assert.equal(f.queue.snapshot().items[0].editing, true);
  assert.equal(f.queue.snapshot().items[0].text, "original");
});
