import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { FrozenSubmissionSchema } from "../../../modules/execution/contracts/public";
import { AppDatabase } from "../../../platform/main/storage/public";
import { AppStorage } from "./app-storage";

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

it("an explicit retry retains frozen identity without inheriting the source refusal cause", () =>
  fixture((path) => {
    const store = openStorage(path);
    try {
      const original = frozen(store);
      store.submissions.prepareSubmission(original);
      store.submissions.rejectSubmission(original.submissionId, "paused");
      const source = store.submissions.submission(original.submissionId);
      if (!source) throw Error("missing original receipt");
      const retry = store.submissions.prepareSubmission({
        ...source,
        submissionId: FrozenSubmissionSchema.shape.submissionId.parse(
          randomUUID(),
        ),
        requestId: randomUUID(),
        retryOf: source.submissionId,
      });
      expect(retry.rejectionReason).toBeUndefined();
      expect(retry).toMatchObject({
        state: "prepared",
        acknowledgedAt: null,
        outcome: "unobserved",
        text: "A",
        retryOf: original.submissionId,
      });
      store.submissions.dispatchSubmission(retry.submissionId);
      store.submissions.acknowledgeSubmission(retry.submissionId);
      expect(store.submissions.submission(retry.submissionId)).toMatchObject({
        state: "acknowledged",
      });
      expect(store.submissions.submission(original.submissionId)).toMatchObject(
        {
          state: "rejected",
          rejectionReason: "paused",
          text: "A",
        },
      );
      expect(store.drafts.read(original.threadId).text).toBe("A");
    } finally {
      store.close();
    }
  }));

it("rejects malformed interrupted facts and rolls recovery back before closing", () =>
  fixture((path) => {
    const store = openStorage(path);
    const valid = frozen(store);
    const malformed = frozen(store);
    for (const value of [valid, malformed]) {
      store.submissions.prepareSubmission(value);
      store.submissions.dispatchSubmission(value.submissionId);
    }
    store.close();
    const corrupt = new DatabaseSync(path);
    corrupt
      .prepare(
        "UPDATE submission SET receipt=json_set(receipt,'$.acknowledgedAt','unexpected-ack') WHERE id=?",
      )
      .run(malformed.submissionId);
    corrupt.close();

    const close = vi.spyOn(AppDatabase.prototype, "close");
    let unexpected: AppStorage | undefined;
    try {
      expect(() => {
        unexpected = AppStorage.open(path);
      }).toThrow();
      expect(close).toHaveBeenCalledTimes(1);
      expect(close.mock.instances[0]).toMatchObject({
        connection: { isOpen: false },
      });
      const retained = new DatabaseSync(path, { readOnly: true });
      try {
        expect(
          retained
            .prepare(
              "SELECT json_extract(receipt,'$.state') AS state FROM submission ORDER BY rowid",
            )
            .all(),
        ).toEqual([{ state: "dispatching" }, { state: "dispatching" }]);
        expect(
          retained
            .prepare(
              "SELECT json_extract(receipt,'$.acknowledgedAt') AS time FROM submission WHERE id=?",
            )
            .get(malformed.submissionId),
        ).toEqual({ time: "unexpected-ack" });
      } finally {
        retained.close();
      }
    } finally {
      unexpected?.close();
      close.mockRestore();
    }
  }));

it("retains failed execution evidence across restart and keeps ACK and refusal terminal", () =>
  fixture((path) => {
    let store = openStorage(path);
    try {
      const submitted = frozen(store);
      store.submissions.prepareSubmission(submitted);
      store.submissions.dispatchSubmission(submitted.submissionId);
      store.submissions.failSubmission(submitted.submissionId);
      store.submissions.unknownSubmission(submitted.submissionId);

      const refused = frozen(store);
      store.submissions.prepareSubmission(refused);
      store.submissions.rejectSubmission(refused.submissionId, "paused");
      store.close();
      store = openStorage(path);
      expect(
        store.submissions.submission(submitted.submissionId),
      ).toMatchObject({
        state: "unknown",
        outcome: "failed",
        acknowledgedAt: null,
      });
      expect(
        store.submissions.acknowledgeSubmission(submitted.submissionId),
      ).toBe(true);
      const acknowledged = store.submissions.submission(submitted.submissionId);
      expect(acknowledged).toMatchObject({
        state: "acknowledged",
        outcome: "failed",
      });
      expect(acknowledged?.acknowledgedAt).toEqual(expect.any(String));
      store.submissions.rejectSubmission(
        submitted.submissionId,
        "native-unavailable",
      );
      store.submissions.unknownSubmission(submitted.submissionId);
      expect(
        store.submissions.acknowledgeSubmission(submitted.submissionId),
      ).toBe(true);
      expect(
        store.submissions.submission(submitted.submissionId),
      ).toMatchObject({
        state: "acknowledged",
        outcome: "failed",
        acknowledgedAt: acknowledged?.acknowledgedAt,
      });

      store.submissions.rejectSubmission(
        refused.submissionId,
        "native-unavailable",
      );
      store.submissions.failSubmission(refused.submissionId);
      store.submissions.unknownSubmission(refused.submissionId);
      expect(
        store.submissions.acknowledgeSubmission(refused.submissionId),
      ).toBe(false);
      expect(store.submissions.submission(refused.submissionId)).toMatchObject({
        state: "rejected",
        outcome: "unobserved",
        acknowledgedAt: null,
        rejectionReason: "paused",
      });
    } finally {
      store.close();
    }
  }));

it("restart retains ACK and consumed revision while reporting an unobserved native result unknown", () =>
  fixture((path) => {
    let store = openStorage(path);
    const value = frozen(store);
    store.submissions.prepareSubmission(value);
    store.submissions.dispatchSubmission(value.submissionId);
    store.submissions.acknowledgeSubmission(value.submissionId);
    const acknowledgedAt = store.submissions.submission(
      value.submissionId,
    )?.acknowledgedAt;
    store.close();
    store = openStorage(path);
    try {
      expect(store.submissions.submission(value.submissionId)).toMatchObject({
        state: "acknowledged",
        outcome: "unknown",
        acknowledgedAt,
        text: "A",
      });
      expect(store.drafts.read(value.threadId)).toMatchObject({
        text: "",
        consumedBy: value.submissionId,
      });
    } finally {
      store.close();
    }
  }));
