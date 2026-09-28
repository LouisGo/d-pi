import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { FrozenSubmissionSchema } from "../features/submission/contracts";
import { DraftStorage } from "./storage";

function fixture(run: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-submission-"));
  try {
    run(join(dir, "app.sqlite"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function frozen(store: DraftStorage) {
  const draft = store.create("/fixture");
  store.save(draft.threadId, 0, "A");
  return FrozenSubmissionSchema.parse({
    submissionId: randomUUID(),
    threadId: draft.threadId,
    traceId: randomUUID(),
    revision: 1,
    text: "A",
    requestId: randomUUID(),
    target: {
      processInstanceId: randomUUID(),
      connectionGeneration: randomUUID(),
      configContextId: "isolated",
      nativeSessionRef: "managed-session",
    },
  });
}
describe("persistent submission handoff", () => {
  it("ACK consumes only A without advancing the draft CAS baseline; original survives restart", () =>
    fixture((path) => {
      let store = new DraftStorage(path);
      const a = frozen(store);
      store.prepareSubmission(a);
      expect(store.dispatchSubmission(a.submissionId)).toBe(true);
      expect(store.acknowledgeSubmission(a.submissionId)).toBe(true);
      expect(store.read(a.threadId)).toMatchObject({ text: "", revision: 1 });
      store.close();
      store = new DraftStorage(path);
      try {
        expect(store.read(a.threadId)).toMatchObject({ text: "", revision: 1 });
        expect(store.submission(a.submissionId)).toMatchObject({
          text: "A",
          state: "acknowledged",
        });
        expect(store.save(a.threadId, 1, "B")).toBe(2);
        expect(store.read(a.threadId)).toMatchObject({
          text: "B",
          revision: 2,
        });
      } finally {
        store.close();
      }
    }));
});

it("ACK transaction rolls back entirely on marker failure; B saved before ACK remains recoverable", () =>
  fixture((path) => {
    const store = new DraftStorage(path);
    const a = frozen(store);
    store.prepareSubmission(a);
    store.dispatchSubmission(a.submissionId);
    const db = new DatabaseSync(path);
    db.exec(
      "CREATE TRIGGER fail_consumption BEFORE INSERT ON draft_consumption BEGIN SELECT RAISE(ABORT,'disk failure'); END",
    );
    expect(() => store.acknowledgeSubmission(a.submissionId)).toThrow();
    expect(store.submission(a.submissionId)?.state).toBe("dispatching");
    expect(store.read(a.threadId).text).toBe("A");
    db.exec("DROP TRIGGER fail_consumption");
    expect(store.save(a.threadId, 1, "B")).toBe(2);
    expect(store.acknowledgeSubmission(a.submissionId)).toBe(true);
    expect(store.acknowledgeSubmission(a.submissionId)).toBe(true);
    expect(store.read(a.threadId)).toMatchObject({ text: "B", revision: 2 });
    db.close();
    store.close();
  }));
it("restart makes dispatch uncertain while ACK survives later failure; duplicate ID cannot dispatch twice", () =>
  fixture((path) => {
    let store = new DraftStorage(path);
    const a = frozen(store);
    const prepared = store.prepareSubmission(a);
    expect(store.prepareSubmission(a)).toEqual(prepared);
    expect(() => store.prepareSubmission({ ...a, text: "forged" })).toThrow();
    expect(store.dispatchSubmission(a.submissionId)).toBe(true);
    expect(store.dispatchSubmission(a.submissionId)).toBe(false);
    store.close();
    store = new DraftStorage(path);
    try {
      expect(store.submission(a.submissionId)?.state).toBe("unknown");
      store.acknowledgeSubmission(a.submissionId);
      store.failSubmission(a.submissionId);
      expect(store.submission(a.submissionId)).toMatchObject({
        state: "acknowledged",
        outcome: "failed",
        text: "A",
      });
      expect(store.dispatchSubmission(a.submissionId)).toBe(false);
      expect(store.read(a.threadId).text).toBe("");
    } finally {
      store.close();
    }
  }));

it("execution trust survives restart for the exact workspace and can be revoked without touching drafts", () =>
  fixture((path) => {
    let store = new DraftStorage(path);
    const d = store.create("/project");
    store.save(d.threadId, 0, "draft");
    expect(store.executionGrant(d.workspaceId)).toBeNull();
    const grant = {
      workspaceId: d.workspaceId,
      directory: d.directory,
      device: "1",
      inode: "2",
    };
    store.grantExecution(grant);
    store.close();
    store = new DraftStorage(path);
    try {
      expect(store.executionGrant(d.workspaceId)).toEqual(grant);
      store.revokeExecution(d.workspaceId);
      expect(store.executionGrant(d.workspaceId)).toBeNull();
      expect(store.read(d.threadId).text).toBe("draft");
    } finally {
      store.close();
    }
  }));

it("native session binding survives restart and cannot be silently replaced", () =>
  fixture((path) => {
    let store = new DraftStorage(path);
    const draft = store.create("/project");
    const binding = {
      threadId: draft.threadId,
      configContextId: "context",
      sessionFile: "/managed/session.jsonl",
      sessionId: "native-session",
    };
    store.bindNativeSession(binding);
    store.close();
    store = new DraftStorage(path);
    try {
      expect(store.nativeSession(draft.threadId)).toEqual(binding);
      expect(() =>
        store.bindNativeSession({ ...binding, sessionId: "new-session" }),
      ).toThrow();
      expect(store.nativeSession(draft.threadId)).toEqual(binding);
    } finally {
      store.close();
    }
  }));
it("rejects a second intent for the same frozen revision", () =>
  fixture((path) => {
    const store = new DraftStorage(path);
    try {
      const a = frozen(store);
      store.prepareSubmission(a);
      expect(() =>
        store.prepareSubmission({
          ...a,
          submissionId: FrozenSubmissionSchema.shape.submissionId.parse(
            randomUUID(),
          ),
        }),
      ).toThrow();
    } finally {
      store.close();
    }
  }));
