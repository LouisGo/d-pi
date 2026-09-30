import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import {
  type FrozenSubmission,
  FrozenSubmissionSchema,
  type SubmissionRejectionReason,
  SubmissionRejectionReasonSchema,
} from "../../src/modules/execution/contracts/public";
import { SubmissionCoordinator } from "../../src/modules/execution/core/public";

function fixture(run: (path: string, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-reason-"));
  try {
    run(join(dir, "app.sqlite"), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function prepared(
  threadId: string,
  requestId = randomUUID(),
): FrozenSubmission {
  return FrozenSubmissionSchema.parse({
    submissionId: randomUUID(),
    threadId,
    traceId: randomUUID(),
    revision: 1,
    text: "queued work",
    requestId,
    target: {
      processInstanceId: randomUUID(),
      connectionGeneration: randomUUID(),
      configContextId: "test",
      nativeSessionRef: "managed",
    },
  });
}

// The Host already knows *why* it refused a dispatch. If that reason stops at
// the wire schema, every refusal reaches the user as the same "rejected" and
// the distinction the Host computed is wasted.
it.each(SubmissionRejectionReasonSchema.options)(
  "persists the native refusal cause %s on the receipt",
  (reason: SubmissionRejectionReason) => {
    fixture((path, dir) => {
      const store = AppStorage.open(path);
      try {
        const draft = store.drafts.create(dir);
        store.drafts.save(draft.threadId, 0, "queued work");
        const value = prepared(draft.threadId);
        const coordinator = new SubmissionCoordinator(store.submissions, {
          isCurrentTarget: () => true,
          canDispatch: () => true,
          write: () => {},
        });
        expect(coordinator.prepare(value).kind).toBe("receipt");
        expect(coordinator.dispatch(value.submissionId).kind).toBe("receipt");

        const result = coordinator.receive({
          kind: "rejected",
          submissionId: value.submissionId,
          requestId: value.requestId,
          target: value.target,
          reason,
        });

        expect(result).toMatchObject({
          kind: "receipt",
          receipt: { state: "rejected", rejectionReason: reason },
        });
        expect(store.submissions.submission(value.submissionId)).toMatchObject({
          state: "rejected",
          rejectionReason: reason,
        });
      } finally {
        store.close();
      }
    });
  },
);

it("keeps a rejection without a reported cause valid", () => {
  fixture((path, dir) => {
    const store = AppStorage.open(path);
    try {
      const draft = store.drafts.create(dir);
      store.drafts.save(draft.threadId, 0, "queued work");
      const value = prepared(draft.threadId);
      const coordinator = new SubmissionCoordinator(store.submissions, {
        isCurrentTarget: () => true,
        canDispatch: () => true,
        write: () => {},
      });
      coordinator.prepare(value);
      coordinator.dispatch(value.submissionId);
      coordinator.receive({
        kind: "rejected",
        submissionId: value.submissionId,
        requestId: value.requestId,
        target: value.target,
      });
      const receipt = store.submissions.submission(value.submissionId);
      expect(receipt?.state).toBe("rejected");
      expect(receipt?.rejectionReason).toBeUndefined();
    } finally {
      store.close();
    }
  });
});

it("does not carry a stale reason onto an acknowledgement", () => {
  fixture((path, dir) => {
    const store = AppStorage.open(path);
    try {
      const draft = store.drafts.create(dir);
      store.drafts.save(draft.threadId, 0, "queued work");
      const value = prepared(draft.threadId);
      const coordinator = new SubmissionCoordinator(store.submissions, {
        isCurrentTarget: () => true,
        canDispatch: () => true,
        write: () => {},
      });
      coordinator.prepare(value);
      coordinator.dispatch(value.submissionId);
      coordinator.receive({
        kind: "rejected",
        submissionId: value.submissionId,
        requestId: value.requestId,
        target: value.target,
        reason: "paused",
      });
      coordinator.receive({
        kind: "ack",
        submissionId: value.submissionId,
        requestId: value.requestId,
        target: value.target,
      });
      expect(store.submissions.submission(value.submissionId)).toMatchObject({
        state: "rejected",
        rejectionReason: "paused",
      });
    } finally {
      store.close();
    }
  });
});

it("keeps a rejected receipt terminal so its cause cannot go stale", () => {
  fixture((path, dir) => {
    const store = AppStorage.open(path);
    try {
      const draft = store.drafts.create(dir);
      store.drafts.save(draft.threadId, 0, "queued work");
      const value = prepared(draft.threadId);
      const coordinator = new SubmissionCoordinator(store.submissions, {
        isCurrentTarget: () => true,
        canDispatch: () => true,
        write: () => {},
      });
      coordinator.prepare(value);
      coordinator.dispatch(value.submissionId);
      coordinator.receive({
        kind: "rejected",
        submissionId: value.submissionId,
        requestId: value.requestId,
        target: value.target,
        reason: "native-unavailable",
      });
      // Later events are later evidence about a decision already made, so the
      // first proven cause stands rather than being rewritten or dropped.
      for (const kind of ["disconnected", "ack", "error"] as const)
        coordinator.receive({
          kind,
          submissionId: value.submissionId,
          requestId: value.requestId,
          target: value.target,
        });
      expect(store.submissions.submission(value.submissionId)).toMatchObject({
        state: "rejected",
        rejectionReason: "native-unavailable",
      });
    } finally {
      store.close();
    }
  });
});
