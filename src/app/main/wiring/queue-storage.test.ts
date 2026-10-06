import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { FrozenSubmissionSchema } from "../../../modules/execution/contracts/public";
import { AppStorage } from "./app-storage";

it("publishes the queue change schema with a recoverable before-v7 backup", () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-queue-storage-"));
  const path = join(root, "app.sqlite");
  try {
    const store = AppStorage.open(path);
    store.close();
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(11);
      expect(
        db
          .prepare("SELECT name FROM sqlite_master WHERE name='queue_change'")
          .get(),
      ).toBeDefined();
    } finally {
      db.close();
    }
    const backup = new DatabaseSync(`${path}.before-v7`, { readOnly: true });
    try {
      expect(backup.prepare("PRAGMA user_version").get()?.user_version).toBe(6);
      expect(
        backup
          .prepare("SELECT name FROM sqlite_master WHERE name='queue_change'")
          .get(),
      ).toBeUndefined();
    } finally {
      backup.close();
    }
    AppStorage.open(path).close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("normalizes existing v6 dispatch and ACK receipts before publishing the before-v7 backup", () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-queue-v6-upgrade-"));
  const path = join(root, "app.sqlite");
  const initial = AppStorage.open(path);
  try {
    const stage = (text: string) => {
      const draft = initial.drafts.create("/fixture");
      initial.drafts.save(draft.threadId, 0, text);
      const receipt = FrozenSubmissionSchema.parse({
        submissionId: randomUUID(),
        threadId: draft.threadId,
        traceId: randomUUID(),
        revision: 1,
        text,
        requestId: randomUUID(),
        target: {
          processInstanceId: randomUUID(),
          connectionGeneration: randomUUID(),
          configContextId: "v6-fixture",
          nativeSessionRef: `/native/${draft.threadId}.jsonl`,
        },
      });
      initial.submissions.prepareSubmission(receipt);
      initial.submissions.dispatchSubmission(receipt.submissionId);
      return receipt;
    };
    const dispatch = stage("未决原文");
    const ack = stage("已确认原文");
    initial.submissions.acknowledgeSubmission(ack.submissionId);
    const originalAck = initial.submissions.submission(ack.submissionId);
    initial.close();
    // v6 has the same App metadata and receipt format, without queue_change.
    // Recreate that exact schema boundary from the actual storage implementation.
    const v6 = new DatabaseSync(path);
    try {
      for (const trigger of v6
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'input_epoch_%'",
        )
        .all()) {
        v6.exec(`DROP TRIGGER "${String(trigger.name).replaceAll('"', '""')}"`);
      }
      v6.exec(
        "DROP TABLE input_content_epoch; DROP TABLE input_content_object; DROP TABLE input_attachment; DROP TABLE queue_change; ALTER TABLE desktop DROP COLUMN notification_system; ALTER TABLE desktop DROP COLUMN notification_completion; PRAGMA user_version=6;",
      );
      expect(
        v6
          .prepare(
            "SELECT json_extract(receipt,'$.state') AS state FROM submission WHERE id=?",
          )
          .get(dispatch.submissionId)?.state,
      ).toBe("dispatching");
    } finally {
      v6.close();
    }
    rmSync(`${path}.before-v7`);
    const upgraded = AppStorage.open(path);
    try {
      const recoveredDispatch = upgraded.submissions.submission(
        dispatch.submissionId,
      );
      const recoveredAck = upgraded.submissions.submission(ack.submissionId);
      expect(recoveredDispatch).toMatchObject({
        state: "unknown",
        outcome: "unknown",
        text: dispatch.text,
        target: dispatch.target,
      });
      expect(recoveredAck).toMatchObject({
        state: "acknowledged",
        outcome: "unknown",
        text: ack.text,
        acknowledgedAt: originalAck?.acknowledgedAt,
        target: ack.target,
      });
      expect(upgraded.drafts.read(dispatch.threadId)).toMatchObject({
        text: dispatch.text,
        revision: 1,
      });
      expect(upgraded.drafts.read(ack.threadId)).toMatchObject({
        text: "",
        consumedBy: ack.submissionId,
        revision: 1,
      });
      const backup = new DatabaseSync(`${path}.before-v7`, { readOnly: true });
      try {
        expect(backup.prepare("PRAGMA user_version").get()?.user_version).toBe(
          6,
        );
        expect(
          backup
            .prepare("SELECT name FROM sqlite_master WHERE name='queue_change'")
            .get(),
        ).toBeUndefined();
        for (const receipt of [recoveredDispatch, recoveredAck]) {
          const record = backup
            .prepare("SELECT receipt FROM submission WHERE id=?")
            .get(receipt?.submissionId ?? "");
          expect(
            typeof record?.receipt === "string"
              ? JSON.parse(record.receipt)
              : null,
          ).toEqual(receipt);
        }
        expect(
          backup
            .prepare(
              "SELECT submission_id FROM draft_consumption WHERE thread_id=? AND revision=1",
            )
            .get(ack.threadId)?.submission_id,
        ).toBe(ack.submissionId);
      } finally {
        backup.close();
      }
      expect(upgraded.queueChanges.list(dispatch.threadId)).toEqual([]);
    } finally {
      upgraded.close();
    }
    const current = new DatabaseSync(path, { readOnly: true });
    try {
      expect(current.prepare("PRAGMA user_version").get()?.user_version).toBe(
        11,
      );
    } finally {
      current.close();
    }
  } finally {
    initial.close();
    rmSync(root, { recursive: true, force: true });
  }
});
