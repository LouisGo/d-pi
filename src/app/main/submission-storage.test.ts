import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { FrozenSubmissionSchema } from "../../modules/execution/contracts/public";
import { SubmissionRepository } from "../../modules/execution/main/public";
import { DraftRepository } from "../../modules/input/main/public";
import { ThreadRepository } from "../../modules/threads/main/public";
import { AppDatabase } from "../../platform/main/storage/public";
import { AppStorage } from "./wiring/app-storage";

function fixture(run: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-submission-"));
  try {
    run(join(dir, "app.sqlite"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function openStorage(path: string): AppStorage {
  return AppStorage.open(path);
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
/**
 * Leave the file exactly as an interrupted run does: schema at v3 with WAL, a
 * committed draft, and one dispatch that was written but never resolved. Only
 * the storage layer is used to build it, then the receipt is put back to the
 * pre-initialization shape, because recovery is the step under test.
 */
function stageInterruptedRun(path: string): string {
  const database = new AppDatabase(path);
  const drafts = new DraftRepository(database, new ThreadRepository(database));
  const draft = drafts.create("/fixture");
  drafts.save(draft.threadId, 0, "A");
  const submissionId = randomUUID();
  database.connection
    .prepare("INSERT INTO submission(id, thread_id, receipt) VALUES(?,?,?)")
    .run(
      submissionId,
      draft.threadId,
      JSON.stringify({
        submissionId,
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
        state: "dispatching",
        acknowledgedAt: null,
        outcome: "unobserved",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
  database.close();
  return submissionId;
}

function receiptState(path: string, submissionId: string): unknown {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return (
      database
        .prepare(
          "SELECT json_extract(receipt,'$.state') AS state FROM submission WHERE id=?",
        )
        .get(submissionId) as { state?: unknown } | undefined
    )?.state;
  } finally {
    database.close();
  }
}

describe("persistent submission handoff", () => {
  it("recovers interrupted receipts before v4/v5 backups and returns a ready store", () =>
    fixture((path) => {
      const submissionId = stageInterruptedRun(path);
      expect(receiptState(path, submissionId)).toBe("dispatching");
      const store = AppStorage.open(path);
      try {
        expect(store.submissions.submission(submissionId)).toMatchObject({
          state: "unknown",
          outcome: "unknown",
          text: "A",
        });
        for (const [suffix, version] of [
          ["before-v4", 3],
          ["before-v5", 4],
        ] as const) {
          const backup = new DatabaseSync(`${path}.${suffix}`, {
            readOnly: true,
          });
          try {
            expect(
              backup.prepare("PRAGMA user_version").get()?.user_version,
            ).toBe(version);
            expect(
              backup.prepare("PRAGMA journal_mode").get()?.journal_mode,
            ).toBe("delete");
            expect(
              backup
                .prepare(
                  "SELECT json_extract(receipt,'$.state') AS state FROM submission WHERE id=?",
                )
                .get(submissionId),
            ).toEqual({ state: "unknown" });
          } finally {
            backup.close();
          }
        }
        const ready = new DatabaseSync(path, { readOnly: true });
        try {
          expect(ready.prepare("PRAGMA user_version").get()?.user_version).toBe(
            6,
          );
          expect(ready.prepare("PRAGMA journal_mode").get()?.journal_mode).toBe(
            "wal",
          );
        } finally {
          ready.close();
        }
      } finally {
        store.close();
      }
    }));

  it("closes failed execution recovery without publishing or starting later migrations", () =>
    fixture((path) => {
      const submissionId = stageInterruptedRun(path);
      const failure = new Error("execution recovery failed");
      const recover = vi
        .spyOn(SubmissionRepository.prototype, "recoverInterruptedSubmissions")
        .mockImplementation(() => {
          throw failure;
        });
      const close = vi.spyOn(AppDatabase.prototype, "close");
      try {
        expect(() => AppStorage.open(path)).toThrow(failure);
        expect(close).toHaveBeenCalledTimes(1);
        expect(close.mock.instances[0]).toMatchObject({
          connection: { isOpen: false },
        });
        expect(receiptState(path, submissionId)).toBe("dispatching");
        const retained = new DatabaseSync(path, { readOnly: true });
        try {
          expect(
            retained.prepare("PRAGMA user_version").get()?.user_version,
          ).toBe(3);
        } finally {
          retained.close();
        }
      } finally {
        close.mockRestore();
        recover.mockRestore();
      }
    }));

  it("leaves interrupted receipts untouched when only the platform database is opened", () =>
    fixture((path) => {
      const submissionId = stageInterruptedRun(path);
      const database = new AppDatabase(path);
      try {
        expect(receiptState(path, submissionId)).toBe("dispatching");
      } finally {
        database.close();
      }
      const store = AppStorage.open(path);
      try {
        expect(store.submissions.submission(submissionId)?.state).toBe(
          "unknown",
        );
      } finally {
        store.close();
      }
    }));

  it("ACK consumes only A without advancing the draft CAS baseline; original survives restart", () =>
    fixture((path) => {
      let store = openStorage(path);
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
      store = openStorage(path);
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

  it("delegates draft consumption through the input writer boundary", () =>
    fixture((path) => {
      const store = openStorage(path);
      const value = frozen(store);
      store.submissions.prepareSubmission(value);
      store.submissions.dispatchSubmission(value.submissionId);
      const consume = vi.spyOn(store.drafts, "consume");

      expect(store.submissions.acknowledgeSubmission(value.submissionId)).toBe(
        true,
      );
      expect(consume).toHaveBeenCalledWith(
        value.threadId,
        value.revision,
        value.submissionId,
      );
      store.close();
    }));
});

it("ACK transaction rolls back entirely on marker failure; B saved before ACK remains recoverable", () =>
  fixture((path) => {
    const store = openStorage(path);
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
    let store = openStorage(path);
    const a = frozen(store);
    const prepared = store.submissions.prepareSubmission(a);
    expect(store.submissions.prepareSubmission(a)).toEqual(prepared);
    expect(() =>
      store.submissions.prepareSubmission({ ...a, text: "forged" }),
    ).toThrow();
    expect(store.submissions.dispatchSubmission(a.submissionId)).toBe(true);
    expect(store.submissions.dispatchSubmission(a.submissionId)).toBe(false);
    store.close();
    store = openStorage(path);
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

it("execution trust survives restart for the exact working directory and can be revoked without touching drafts", () =>
  fixture((path) => {
    let store = openStorage(path);
    const d = store.drafts.create("/project");
    store.drafts.save(d.threadId, 0, "draft");
    expect(store.threads.executionGrant(d.workingDirectoryId)).toBeNull();
    const grant = {
      workingDirectoryId: d.workingDirectoryId,
      directory: d.directory,
      device: "1",
      inode: "2",
    };
    store.threads.grantExecution(grant);
    store.close();
    store = openStorage(path);
    try {
      expect(store.threads.executionGrant(d.workingDirectoryId)).toEqual(grant);
      store.threads.revokeExecution(d.workingDirectoryId);
      expect(store.threads.executionGrant(d.workingDirectoryId)).toBeNull();
      expect(store.drafts.read(d.threadId).text).toBe("draft");
    } finally {
      store.close();
    }
  }));

it("native session binding survives restart and cannot be silently replaced", () =>
  fixture((path) => {
    let store = openStorage(path);
    const draft = store.drafts.create("/project");
    const binding = {
      threadId: draft.threadId,
      configContextId: "context",
      sessionFile: "/managed/session.jsonl",
      sessionId: "native-session",
    };
    store.threads.bindNativeSession(binding);
    store.close();
    store = openStorage(path);
    try {
      expect(store.threads.nativeSessionBinding(draft.threadId)).toEqual(
        binding,
      );
      expect(() =>
        store.threads.bindNativeSession({
          ...binding,
          sessionId: "new-session",
        }),
      ).toThrow();
      expect(store.threads.nativeSessionBinding(draft.threadId)).toEqual(
        binding,
      );
    } finally {
      store.close();
    }
  }));
it("rejects a second intent for the same frozen revision", () =>
  fixture((path) => {
    const store = openStorage(path);
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
it("an explicit resend retains source identity and never consumes the newer draft", () =>
  fixture((path) => {
    const store = openStorage(path);
    try {
      const original = frozen(store);
      store.submissions.prepareSubmission(original);
      store.submissions.dispatchSubmission(original.submissionId);
      store.submissions.unknownSubmission(original.submissionId);
      store.drafts.save(original.threadId, 1, "B");
      const retry = FrozenSubmissionSchema.parse({
        ...original,
        submissionId: randomUUID(),
        requestId: randomUUID(),
        traceId: randomUUID(),
        retryOf: original.submissionId,
      });
      store.submissions.prepareSubmission(retry);
      store.submissions.dispatchSubmission(retry.submissionId);
      store.submissions.acknowledgeSubmission(retry.submissionId);
      expect(store.drafts.read(original.threadId).text).toBe("B");
      expect(store.submissions.submission(original.submissionId)?.state).toBe(
        "unknown",
      );
      expect(store.submissions.submission(retry.submissionId)?.retryOf).toBe(
        original.submissionId,
      );
    } finally {
      store.close();
    }
  }));

it("free-text follow-ups bypass the draft gates and never consume the editor", () =>
  fixture((path) => {
    const store = openStorage(path);
    try {
      const draft = store.drafts.create("/fixture");
      store.drafts.save(draft.threadId, 0, "editor content");
      const free = (text: string) =>
        FrozenSubmissionSchema.parse({
          submissionId: randomUUID(),
          threadId: draft.threadId,
          traceId: randomUUID(),
          revision: 0,
          text,
          delivery: "steer",
          origin: "free",
          requestId: randomUUID(),
          target: {
            processInstanceId: randomUUID(),
            connectionGeneration: randomUUID(),
            configContextId: "isolated",
            nativeSessionRef: "managed-session",
          },
        });
      // First and second free texts share revision 0 but carry unique IDs:
      // neither the draft-content gate nor the same-revision gate applies.
      const first = free("late answer one");
      const second = free("late answer two");
      expect(store.submissions.prepareSubmission(first).state).toBe("prepared");
      expect(store.submissions.prepareSubmission(second).state).toBe(
        "prepared",
      );
      expect(store.submissions.dispatchSubmission(first.submissionId)).toBe(
        true,
      );
      expect(store.submissions.acknowledgeSubmission(first.submissionId)).toBe(
        true,
      );
      // ACK of a free-text receipt leaves the editor draft untouched.
      expect(store.drafts.read(draft.threadId)).toMatchObject({
        text: "editor content",
        revision: 1,
      });
      // The draft lane itself still enforces its own gates.
      expect(() =>
        store.submissions.prepareSubmission({
          ...first,
          submissionId: FrozenSubmissionSchema.shape.submissionId.parse(
            randomUUID(),
          ),
          origin: "draft",
        }),
      ).toThrow();
    } finally {
      store.close();
    }
  }));

it("non-dispatched receipts cannot consume a draft and remain terminal across restart", () =>
  fixture((path) => {
    let store = openStorage(path);
    try {
      const a = frozen(store);
      store.submissions.prepareSubmission(a);
      expect(store.submissions.acknowledgeSubmission(a.submissionId)).toBe(
        false,
      );
      store.submissions.rejectSubmission(a.submissionId);
      store.submissions.unknownSubmission(a.submissionId);
      expect(store.submissions.acknowledgeSubmission(a.submissionId)).toBe(
        false,
      );
      store.close();
      store = openStorage(path);
      expect(store.submissions.submission(a.submissionId)).toMatchObject({
        state: "rejected",
        outcome: "unobserved",
      });
      expect(store.drafts.read(a.threadId).text).toBe("A");
      const b = {
        ...a,
        submissionId: FrozenSubmissionSchema.shape.submissionId.parse(
          randomUUID(),
        ),
        requestId: randomUUID(),
      };
      store.submissions.prepareSubmission(b);
      store.submissions.dispatchSubmission(b.submissionId);
      expect(store.submissions.acknowledgeSubmission(b.submissionId)).toBe(
        true,
      );
      expect(store.drafts.read(a.threadId).text).toBe("");
    } finally {
      store.close();
    }
  }));
