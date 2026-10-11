import assert from "node:assert/strict";
import { test } from "node:test";
import { createApprovalObservation } from "../../../runtime/native-approval-observation.mjs";

function fixture() {
  const observer = createApprovalObservation();
  const handlers = new Map();
  observer.extension({ on: (name, callback) => handlers.set(name, callback) });
  const emit = (id, approved, sessionId = "parent") =>
    handlers.get(
      approved === undefined
        ? "tool_approval_requested"
        : "tool_approval_resolved",
    )({
      type:
        approved === undefined
          ? "tool_approval_requested"
          : "tool_approval_resolved",
      sessionId,
      toolCallId: id,
      toolName: "bash",
      approvalMode: "write",
      ...(approved === undefined ? {} : { approved }),
    });
  return { observer, emit };
}
test("registers public events, preserves independent concurrent identities, and flushes bounded bootstrap facts", () => {
  const f = fixture();
  assert.equal(f.emit("A"), undefined);
  f.emit("B");
  f.emit("A", false);
  f.emit("A", undefined, "child");
  const published = [];
  f.observer.setPublisher((snapshot) => published.push(snapshot));
  assert.deepEqual(
    published[0].items.map(({ nativeSessionKey, toolCallId, status }) => [
      nativeSessionKey,
      toolCallId,
      status,
    ]),
    [
      ["parent", "A", "denied"],
      ["parent", "B", "pending"],
      ["child", "A", "pending"],
    ],
  );
  assert.equal(published[0].coverage, "observed");
  assert.ok(
    published[0].items[0].resolvedAt >= published[0].items[0].requestedAt,
  );
  f.emit("B", true);
  assert.equal(published[0].items[1].status, "pending");
  assert.equal(published[1].items[1].status, "approved");
  assert.ok(published[1].items.every((item) => !("requestId" in item)));
});
test("never evicts pending facts for terminal history and makes overflow explicit", () => {
  const f = fixture();
  for (let i = 0; i < 32; i++) f.emit(`pending-${i}`);
  f.emit("overflow");
  for (let i = 0; i < 60; i++) f.emit(`finished-${i}`, false);
  const snapshot = f.observer.snapshot();
  assert.equal(snapshot.coverage, "gap");
  assert.equal(snapshot.items.length, 64);
  assert.equal(
    snapshot.items.filter((item) => item.status === "pending").length,
    32,
  );
  assert.equal(
    snapshot.items.filter((item) => item.status === "denied").length,
    32,
  );
});
test("bounds a long native reason without losing approval identity or creating a global fact gap", () => {
  const observer = createApprovalObservation();
  const handlers = new Map();
  observer.extension({ on: (name, callback) => handlers.set(name, callback) });
  handlers.get("tool_approval_requested")({
    type: "tool_approval_requested",
    sessionId: "parent",
    toolCallId: "long-reason",
    toolName: "bash",
    approvalMode: "write",
    reason: "x".repeat(5000),
  });
  const snapshot = observer.snapshot();
  assert.equal(snapshot.items[0].reason.length, 4096);
  assert.equal(snapshot.items[0].reasonTruncated, true);
  assert.equal(snapshot.coverage, "observed");
});
