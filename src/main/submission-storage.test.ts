import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { FrozenSubmissionSchema } from "../features/submission/contracts";
import { AppStorage } from "./storage/app-storage";

function fixture(run: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-submission-"));
  try {
    run(join(dir, "app.sqlite"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function frozen(store: AppStorage) {
  const draft = store.drafts.create("/fixture");
  store.drafts.save(draft.threadId, 0, "A");
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
      let store = new AppStorage(path);
      const a = frozen(store);
      store.submissions.prepareSubmission(a);
      expect(store.submissions.dispatchSubmission(a.submissionId)).toBe(true);
      expect(store.submissions.acknowledgeSubmission(a.submissionId)).toBe(
        true,
      );
      expect(store.drafts.read(a.threadId)).toMatchObject({
        text: "",
        revision: 1,
      });
      store.close();
      store = new AppStorage(path);
      try {
        expect(store.drafts.read(a.threadId)).toMatchObject({
          text: "",
          revision: 1,
        });
        expect(store.submissions.submission(a.submissionId)).toMatchObject({
          text: "A",
          state: "acknowledged",
        });
        expect(store.drafts.save(a.threadId, 1, "B")).toBe(2);
        expect(store.drafts.read(a.threadId)).toMatchObject({
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
    const store = new AppStorage(path);
    const a = frozen(store);
    store.submissions.prepareSubmission(a);
    store.submissions.dispatchSubmission(a.submissionId);
    const db = new DatabaseSync(path);
    db.exec(
      "CREATE TRIGGER fail_consumption BEFORE INSERT ON draft_consumption BEGIN SELECT RAISE(ABORT,'disk failure'); END",
    );
    expect(() =>
      store.submissions.acknowledgeSubmission(a.submissionId),
    ).toThrow();
    expect(store.submissions.submission(a.submissionId)?.state).toBe(
      "dispatching",
    );
    expect(store.drafts.read(a.threadId).text).toBe("A");
    db.exec("DROP TRIGGER fail_consumption");
    expect(store.drafts.save(a.threadId, 1, "B")).toBe(2);
    expect(store.submissions.acknowledgeSubmission(a.submissionId)).toBe(true);
    expect(store.submissions.acknowledgeSubmission(a.submissionId)).toBe(true);
    expect(store.drafts.read(a.threadId)).toMatchObject({
      text: "B",
      revision: 2,
    });
    db.close();
    store.close();
  }));
it("restart makes dispatch uncertain while ACK survives later failure; duplicate ID cannot dispatch twice", () =>
  fixture((path) => {
    let store = new AppStorage(path);
    const a = frozen(store);
    const prepared = store.submissions.prepareSubmission(a);
    expect(store.submissions.prepareSubmission(a)).toEqual(prepared);
    expect(() =>
      store.submissions.prepareSubmission({ ...a, text: "forged" }),
    ).toThrow();
    expect(store.submissions.dispatchSubmission(a.submissionId)).toBe(true);
    expect(store.submissions.dispatchSubmission(a.submissionId)).toBe(false);
    store.close();
    store = new AppStorage(path);
    try {
      expect(store.submissions.submission(a.submissionId)?.state).toBe(
        "unknown",
      );
      store.submissions.acknowledgeSubmission(a.submissionId);
      store.submissions.failSubmission(a.submissionId);
      expect(store.submissions.submission(a.submissionId)).toMatchObject({
        state: "acknowledged",
        outcome: "failed",
        text: "A",
      });
      expect(store.submissions.dispatchSubmission(a.submissionId)).toBe(false);
      expect(store.drafts.read(a.threadId).text).toBe("");
    } finally {
      store.close();
    }
  }));

it("execution trust survives restart for the exact workspace and can be revoked without touching drafts", () =>
  fixture((path) => {
    let store = new AppStorage(path);
    const d = store.drafts.create("/project");
    store.drafts.save(d.threadId, 0, "draft");
    expect(store.threads.executionGrant(d.workspaceId)).toBeNull();
    const grant = {
      workspaceId: d.workspaceId,
      directory: d.directory,
      device: "1",
      inode: "2",
    };
    store.threads.grantExecution(grant);
    store.close();
    store = new AppStorage(path);
    try {
      expect(store.threads.executionGrant(d.workspaceId)).toEqual(grant);
      store.threads.revokeExecution(d.workspaceId);
      expect(store.threads.executionGrant(d.workspaceId)).toBeNull();
      expect(store.drafts.read(d.threadId).text).toBe("draft");
    } finally {
      store.close();
    }
  }));

it("native session binding survives restart and cannot be silently replaced", () =>
  fixture((path) => {
    let store = new AppStorage(path);
    const draft = store.drafts.create("/project");
    const binding = {
      threadId: draft.threadId,
      configContextId: "context",
      sessionFile: "/managed/session.jsonl",
      sessionId: "native-session",
    };
    store.threads.bindNativeSession(binding);
    store.close();
    store = new AppStorage(path);
    try {
      expect(store.threads.nativeSession(draft.threadId)).toEqual(binding);
      expect(() =>
        store.threads.bindNativeSession({
          ...binding,
          sessionId: "new-session",
        }),
      ).toThrow();
      expect(store.threads.nativeSession(draft.threadId)).toEqual(binding);
    } finally {
      store.close();
    }
  }));
it("rejects a second intent for the same frozen revision", () =>
  fixture((path) => {
    const store = new AppStorage(path);
    try {
      const a = frozen(store);
      store.submissions.prepareSubmission(a);
      expect(() =>
        store.submissions.prepareSubmission({
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
