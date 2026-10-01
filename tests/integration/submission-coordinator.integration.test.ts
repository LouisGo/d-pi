import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { FrozenSubmissionSchema } from "../../src/modules/execution/contracts/public";
import { SubmissionCoordinator } from "../../src/modules/execution/core/public";

it("failed dispatch persistence writes nothing; duplicate dispatch writes once and late error keeps ACK", () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-send-"));
  const path = join(dir, "app.sqlite");
  const store = AppStorage.open(path);
  const lock = new DatabaseSync(path);
  try {
    const d = store.drafts.create(dir);
    store.drafts.save(d.threadId, 0, "A");
    const a = FrozenSubmissionSchema.parse({
      submissionId: randomUUID(),
      threadId: d.threadId,
      traceId: randomUUID(),
      revision: 1,
      text: "A",
      requestId: randomUUID(),
      target: {
        processInstanceId: randomUUID(),
        connectionGeneration: randomUUID(),
        configContextId: "test",
        nativeSessionRef: "managed",
      },
    });
    const writes: string[] = [];
    const c = new SubmissionCoordinator(store.submissions, {
      isCurrentTarget: () => true,
      canDispatch: () => true,
      write: (value, frame) => {
        FrozenSubmissionSchema.parse(value);
        writes.push(frame);
      },
    });
    expect(c.prepare(a).kind).toBe("receipt");
    lock.exec("BEGIN IMMEDIATE");
    expect(c.dispatch(a.submissionId)).toMatchObject({
      kind: "failed",
      code: "storage-unavailable",
    });
    expect(writes).toEqual([]);
    lock.exec("ROLLBACK");
    expect(c.dispatch(a.submissionId)).toMatchObject({
      kind: "receipt",
      receipt: { state: "dispatching" },
    });
    c.dispatch(a.submissionId);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0] ?? "")).toEqual({
      id: a.requestId,
      type: "prompt",
      message: "A",
      streamingBehavior: "followUp",
    });
    const event = {
      submissionId: a.submissionId,
      requestId: a.requestId,
      target: a.target,
    };
    expect(c.receive({ ...event, kind: "ack" })).toMatchObject({
      kind: "receipt",
      receipt: { state: "acknowledged" },
    });
    expect(c.receive({ ...event, kind: "error" })).toMatchObject({
      kind: "receipt",
      receipt: { state: "acknowledged", outcome: "failed" },
    });
    c.receive({ ...event, kind: "ack" });
    expect(store.submissions.submission(a.submissionId)?.outcome).toBe(
      "failed",
    );
    expect(store.drafts.read(d.threadId).text).toBe("");
  } finally {
    lock.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("old instances cannot ACK; a failed write becomes unknown and an encoded oversized draft is retained", () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-send-errors-"));
  const store = AppStorage.open(join(dir, "app.sqlite"));
  try {
    const d = store.drafts.create(dir);
    store.drafts.save(d.threadId, 0, "A");
    const a = FrozenSubmissionSchema.parse({
      submissionId: randomUUID(),
      threadId: d.threadId,
      traceId: randomUUID(),
      revision: 1,
      text: "A",
      requestId: randomUUID(),
      target: {
        processInstanceId: randomUUID(),
        connectionGeneration: randomUUID(),
        configContextId: "test",
        nativeSessionRef: "managed",
      },
    });
    let current = true;
    let writes = 0;
    const c = new SubmissionCoordinator(store.submissions, {
      isCurrentTarget: () => current,
      canDispatch: () => true,
      write: () => {
        writes++;
        throw Error("connection lost");
      },
    });
    c.prepare(a);
    expect(c.dispatch(a.submissionId)).toMatchObject({
      kind: "receipt",
      receipt: { state: "unknown" },
    });
    c.dispatch(a.submissionId);
    expect(writes).toBe(1);
    current = false;
    expect(
      c.receive({
        kind: "ack",
        submissionId: a.submissionId,
        requestId: a.requestId,
        target: a.target,
      }),
    ).toMatchObject({ kind: "failed", code: "stale-event" });
    expect(store.drafts.read(d.threadId).text).toBe("A");
    const large = "\\".repeat(600_000);
    store.drafts.save(d.threadId, 1, large);
    expect(
      c.prepare({
        ...a,
        submissionId: FrozenSubmissionSchema.shape.submissionId.parse(
          randomUUID(),
        ),
        revision: 2,
        text: large,
      }),
    ).toMatchObject({ kind: "failed", code: "content-too-large" });
    expect(store.drafts.read(d.threadId).text).toBe(large);
    expect(writes).toBe(1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("returns historical receipts without a native write (A12 lock)", () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-fast-return-"));
  const store = AppStorage.open(join(dir, "app.sqlite"));
  try {
    const d = store.drafts.create(dir);
    store.drafts.save(d.threadId, 0, "A");
    const target = {
      processInstanceId: randomUUID(),
      connectionGeneration: randomUUID(),
      configContextId: "test",
      nativeSessionRef: "managed",
    };
    const a = FrozenSubmissionSchema.parse({
      submissionId: randomUUID(),
      threadId: d.threadId,
      traceId: randomUUID(),
      revision: 1,
      text: "A",
      requestId: randomUUID(),
      target,
    });
    let writes = 0;
    const c = new SubmissionCoordinator(store.submissions, {
      isCurrentTarget: () => true,
      canDispatch: () => true,
      write: () => {
        writes++;
      },
    });
    expect(c.prepare(a).kind).toBe("receipt");
    expect(c.dispatch(a.submissionId)).toMatchObject({
      kind: "receipt",
      receipt: { state: "dispatching" },
    });
    expect(writes).toBe(1);
    c.receive({
      kind: "ack",
      submissionId: a.submissionId,
      requestId: a.requestId,
      target,
    });
    // Non-prepared fast return: historical read, no second native write even
    // when admission would now fail. Execution permission gates new side
    // effects, never the lookup of what already happened.
    const strict = new SubmissionCoordinator(store.submissions, {
      isCurrentTarget: () => false,
      canDispatch: () => false,
      write: () => {
        writes++;
      },
    });
    expect(strict.dispatch(a.submissionId)).toMatchObject({
      kind: "receipt",
      receipt: { state: "acknowledged" },
    });
    expect(writes).toBe(1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("reports correlated safe stages and typed failures without logging frozen text", () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-send-trace-"));
  const store = AppStorage.open(join(dir, "app.sqlite"));
  try {
    const d = store.drafts.create(dir);
    store.drafts.save(d.threadId, 0, "secret body");
    const a = FrozenSubmissionSchema.parse({
      submissionId: randomUUID(),
      threadId: d.threadId,
      traceId: randomUUID(),
      revision: 1,
      text: "secret body",
      requestId: randomUUID(),
      target: {
        processInstanceId: randomUUID(),
        connectionGeneration: randomUUID(),
        configContextId: "test",
        nativeSessionRef: "managed",
      },
    });
    const events: unknown[] = [];
    const c = new SubmissionCoordinator(
      store.submissions,
      { isCurrentTarget: () => true, canDispatch: () => true, write: () => {} },
      (event) => {
        events.push(event);
      },
    );
    c.prepare(a);
    c.dispatch(a.submissionId);
    c.receive({
      kind: "ack",
      submissionId: a.submissionId,
      requestId: a.requestId,
      target: a.target,
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          traceId: a.traceId,
          submissionId: a.submissionId,
          stage: "prepared",
        }),
        expect.objectContaining({
          traceId: a.traceId,
          submissionId: a.submissionId,
          stage: "dispatching",
        }),
        expect.objectContaining({
          traceId: a.traceId,
          submissionId: a.submissionId,
          stage: "acknowledged",
        }),
      ]),
    );
    expect(JSON.stringify(events)).not.toContain("secret body");
    expect(c.prepare({ ...a, text: "changed" })).toMatchObject({
      kind: "failed",
      code: "revision-conflict",
      error: {
        traceId: a.traceId,
        handlingOwner: "submission",
        recovery: "user_action",
      },
    });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("persists prompt evidence before ACK without consuming the draft, then preserves it across restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-prompt-result-"));
  const path = join(dir, "app.sqlite");
  let store = AppStorage.open(path);
  try {
    const draft = store.drafts.create(dir);
    store.drafts.save(draft.threadId, 0, "frozen");
    const value = FrozenSubmissionSchema.parse({
      submissionId: randomUUID(),
      threadId: draft.threadId,
      traceId: randomUUID(),
      revision: 1,
      text: "frozen",
      requestId: randomUUID(),
      target: {
        processInstanceId: randomUUID(),
        connectionGeneration: randomUUID(),
        configContextId: "fixture",
        nativeSessionRef: "native",
      },
    });
    const writes: string[] = [];
    const coordinator = new SubmissionCoordinator(store.submissions, {
      isCurrentTarget: () => true,
      canDispatch: () => true,
      write: (_value, frame) => writes.push(frame),
    });
    coordinator.prepare(value);
    coordinator.dispatch(value.submissionId);
    const identity = {
      submissionId: value.submissionId,
      requestId: value.requestId,
      target: value.target,
    };
    const terminal = {
      ...identity,
      kind: "prompt-result" as const,
      status: "completed" as const,
      agentInvoked: true,
      sessionSettled: false,
    };
    expect(coordinator.receive(terminal)).toMatchObject({
      kind: "receipt",
      receipt: {
        state: "unknown",
        outcome: "completed",
        promptResult: { status: "completed", sessionSettled: false },
      },
    });
    expect(store.drafts.read(draft.threadId).text).toBe("frozen");
    expect(
      coordinator.receive({
        ...identity,
        kind: "rejected",
        reason: "stale-target",
      }),
    ).toMatchObject({
      kind: "receipt",
      receipt: { state: "unknown", outcome: "completed" },
    });
    coordinator.receive({ ...identity, kind: "ack" });
    expect(store.drafts.read(draft.threadId).text).toBe("");
    coordinator.receive(terminal);
    expect(writes).toHaveLength(1);
    store.close();
    store = AppStorage.open(path);
    expect(store.submissions.submission(value.submissionId)).toMatchObject({
      state: "acknowledged",
      outcome: "completed",
      promptResult: {
        source: "native-prompt-result",
        agentInvoked: true,
        sessionSettled: false,
      },
      text: "frozen",
    });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
