import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import {
  FrozenSubmissionSchema,
  QueueChangeSchema,
} from "../../src/modules/execution/contracts/public";

it("reopens queue edits as unknown without replacing original submission text or confirmed queue changes", () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-queue-reopen-"));
  const path = join(root, "app.sqlite");
  const store = AppStorage.open(path);
  try {
    const draft = store.drafts.create("/fixture");
    const frozen = FrozenSubmissionSchema.parse({
      threadId: draft.threadId,
      submissionId: randomUUID(),
      traceId: randomUUID(),
      requestId: randomUUID(),
      revision: draft.revision,
      text: "原始已发送正文",
      origin: "free",
      target: {
        processInstanceId: randomUUID(),
        connectionGeneration: randomUUID(),
        configContextId: "fixture",
        nativeSessionRef: "/native/original.jsonl",
      },
    });
    store.submissions.prepareSubmission(frozen);
    store.submissions.dispatchSubmission(frozen.submissionId);
    store.submissions.acknowledgeSubmission(frozen.submissionId);
    store.submissions.observePromptResult(frozen.submissionId, {
      source: "native-local-response",
      status: "completed",
      agentInvoked: false,
    });
    const original = store.submissions.submission(frozen.submissionId);
    const edit = QueueChangeSchema.parse({
      traceId: randomUUID(),
      threadId: draft.threadId,
      target: frozen.target,
      command: {
        action: "save-edit",
        entryId: randomUUID(),
        revision: 5,
        text: "最新排队正文",
      },
      previousText: frozen.text,
      status: "dispatching",
      createdAt: "unused",
    });
    const { status: _status, createdAt: _createdAt, ...pending } = edit;
    store.queueChanges.prepare(pending);
    const acknowledged = { ...pending, traceId: randomUUID() };
    store.queueChanges.prepare(acknowledged);
    store.queueChanges.finish(acknowledged.traceId, "acknowledged");
    store.close();
    const reopened = AppStorage.open(path);
    try {
      expect(
        reopened.queueChanges
          .list(draft.threadId)
          .find((record) => record.traceId === pending.traceId),
      ).toEqual({
        ...pending,
        status: "unknown",
        createdAt: expect.any(String),
      });
      expect(
        reopened.queueChanges
          .list(draft.threadId)
          .find((record) => record.traceId === acknowledged.traceId)?.status,
      ).toBe("acknowledged");
      expect(reopened.submissions.submission(frozen.submissionId)).toEqual(
        original,
      );
      expect(reopened.queueChanges.recoverInterruptedChanges()).toBe(0);
      const other = reopened.drafts.create("/other");
      expect(reopened.queueChanges.list(other.threadId)).toEqual([]);
    } finally {
      reopened.close();
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
