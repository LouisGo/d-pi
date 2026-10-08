import assert from "node:assert/strict";
import test from "node:test";
import { createReadingSession } from "../../runtime/reading-session.mjs";

function fixture() {
  const branch = [],
    listeners = new Set();
  let flushes = 0;
  const session = {
    sessionManager: {
      getBranch: () => branch,
      getSessionId: () => "session",
      getSessionFile: () => "/original.jsonl",
      getLeafId: () => branch.at(-1)?.id,
      flush: async () => {
        flushes++;
      },
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  const reading = createReadingSession(session);
  return {
    session,
    reading,
    branch,
    flushes: () => flushes,
    emit: (e) => {
      for (const l of listeners) l(e);
    },
  };
}
test("associates only the persisted original object after queued persistence and preserves event order without mutating native content", async () => {
  const f = fixture(),
    frames = [],
    message = { role: "assistant", content: "same" };
  f.reading.session.subscribe((event) => frames.push(event));
  Promise.resolve().then(() =>
    f.branch.push({ type: "message", id: "real-id", message }),
  );
  f.emit({ type: "message_end", message });
  f.emit({
    type: "message_start",
    message: { role: "assistant", content: [] },
  });
  await f.reading.flushEvents();
  assert.equal(frames[0].message.dPiRecordId, "real-id");
  assert.equal(frames[1].type, "message_start");
  assert.equal(message.dPiRecordId, undefined);
  f.emit({ type: "message_end", message: { ...message } });
  await f.reading.flushEvents();
  assert.equal(frames.at(-1).message.dPiRecordId, undefined);
  assert.equal(frames.at(-1).message.dPiIdentityUnknown, true);
});
test("pages branch entries with exact native IDs, identity-bound cursors and bounded whole-message payloads", () => {
  const f = fixture();
  for (let n = 0; n < 105; n++)
    f.branch.push({
      type: "message",
      id: `m-${n}`,
      message: { role: "user", content: `body-${n}` },
    });
  const first = f.reading.page({ limit: 100 });
  assert.equal(first.messages.length, 100);
  assert.equal(first.messages[0].dPiRecordId, "m-0");
  assert.equal(first.messages[0].dPiRestored, true);
  f.branch.push({
    type: "message",
    id: "new",
    message: { role: "user", content: "new" },
  });
  assert.throws(
    () => f.reading.page({ cursor: first.nextCursor }),
    /reading-source-changed/,
  );
  f.branch.pop();
  const second = f.reading.page({ limit: 100, cursor: first.nextCursor });
  assert.equal(second.messages.length, 5);
  assert.throws(() => f.reading.page({}), /reading-phase-closed/);
  const big = fixture();
  big.branch.push({
    type: "message",
    id: "big",
    message: { role: "assistant", content: "x".repeat(2 * 1024 * 1024) },
  });
  const page = big.reading.page({ limit: 100 });
  assert.equal(page.messages[0].content.length, 2 * 1024 * 1024);
  assert.equal(page.messages.length, 1);
});

test("cold reading refuses changing sessions and is permanently closed before prompt admission", () => {
  const f = fixture();
  f.session.isStreaming = true;
  assert.throws(() => f.reading.page({}), /reading-session-busy/);
  f.session.isStreaming = false;
  f.session.hasPendingAsyncWork = () => true;
  assert.throws(() => f.reading.page({}), /reading-session-busy/);
  f.session.hasPendingAsyncWork = () => false;
  f.session.hasAdmittedSubmission = true;
  assert.throws(() => f.reading.page({}), /reading-session-busy/);
  f.session.hasAdmittedSubmission = false;
  f.reading.closeSnapshot();
  assert.throws(() => f.reading.page({}), /reading-phase-closed/);
  const normal = createReadingSession(f.session, { coldResume: false });
  assert.throws(() => normal.page({}), /reading-phase-closed/);
});

test("dispose drains accepted end/settled frames and preserves the original native disposal failure", async () => {
  for (const failing of [false, true]) {
    const f = fixture(),
      frames = [],
      failure = Error("native-persistence-failed");
    const message = { role: "assistant", content: "last message" };
    f.branch.push({ type: "message", id: "last-native-id", message });
    f.session.dispose = async () => {
      f.emit({ type: "session_shutdown" });
      if (failing) throw failure;
    };
    f.reading.session.subscribe((event) => frames.push(event));
    f.emit({ type: "message_end", message });
    f.emit({ type: "session_settled" });
    if (failing)
      await assert.rejects(
        f.reading.session.dispose(),
        (error) => error === failure,
      );
    else await f.reading.session.dispose();
    assert.deepEqual(
      frames.map((frame) => frame.type),
      ["message_end", "session_settled", "session_shutdown"],
    );
    assert.equal(frames[0].message.dPiRecordId, "last-native-id");
  }
});
