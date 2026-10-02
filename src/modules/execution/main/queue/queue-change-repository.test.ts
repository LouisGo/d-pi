import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { AppDatabase } from "../../../../platform/main/storage/public";
import { ThreadRepository } from "../../../threads/main/public";
import { type QueueChange, QueueChangeSchema } from "../../contracts/public";
import { QueueChangeRepository } from "./queue-change-repository";

function fixture(run: (path: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "dpi-queue-change-"));
  try {
    run(join(root, "app.sqlite"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function open(path: string) {
  const database = new AppDatabase(path);
  database.completeSchemaMigrations();
  const threads = new ThreadRepository(database);
  const first = threads.create("/fixture/first");
  const second = threads.create("/fixture/second");
  return {
    database,
    first,
    second,
    changes: new QueueChangeRepository(database),
  };
}
function value(
  threadId: QueueChange["threadId"],
): Omit<QueueChange, "status" | "createdAt"> {
  const parsed = QueueChangeSchema.parse({
    threadId,
    traceId: randomUUID(),
    status: "dispatching",
    createdAt: "2026-10-02T00:00:00.000Z",
    target: {
      processInstanceId: randomUUID(),
      connectionGeneration: randomUUID(),
      configContextId: "fixture",
      nativeSessionRef: "/native/first.jsonl",
    },
    command: {
      action: "save-edit",
      entryId: randomUUID(),
      revision: 3,
      text: "新排队正文",
    },
    previousText: "冻结旧正文",
  });
  const { status: _status, createdAt: _createdAt, ...frozen } = parsed;
  return frozen;
}

it("keeps limited queue text explicitly marked and rejects trace reuse as complete text", () =>
  fixture((path) => {
    const h = open(path);
    try {
      const prepared = { ...value(h.first.threadId), previousTruncated: true };
      h.changes.prepare(prepared);
      expect(h.changes.find(prepared.traceId)?.previousTruncated).toBe(true);
      expect(() =>
        h.changes.prepare({ ...prepared, previousTruncated: false }),
      ).toThrow("identity conflict");
    } finally {
      h.database.close();
    }
  }));

it("persists frozen queue-change identity before dispatch without creating a submission", () =>
  fixture((path) => {
    const h = open(path);
    try {
      const prepared = value(h.first.threadId);
      h.changes.prepare(prepared);
      expect(h.changes.list(h.first.threadId)).toEqual([
        { ...prepared, status: "dispatching", createdAt: expect.any(String) },
      ]);
      const reader = new DatabaseSync(path, { readOnly: true });
      try {
        const row = reader
          .prepare("SELECT record FROM queue_change WHERE id=?")
          .get(prepared.traceId);
        expect(
          typeof row?.record === "string"
            ? JSON.parse(row.record).previousText
            : null,
        ).toBe("冻结旧正文");
        expect(
          reader.prepare("SELECT COUNT(*) AS count FROM submission").get()
            ?.count,
        ).toBe(0);
      } finally {
        reader.close();
      }
    } finally {
      h.database.close();
    }
  }));

it("treats an identical trace as idempotent and rejects reuse with another Thread, native identity or frozen content", () =>
  fixture((path) => {
    const h = open(path);
    try {
      const prepared = value(h.first.threadId);
      h.changes.prepare(prepared);
      const original = h.changes.list(h.first.threadId);
      expect(() =>
        h.changes.prepare({
          ...prepared,
          target: {
            nativeSessionRef: prepared.target.nativeSessionRef,
            configContextId: prepared.target.configContextId,
            connectionGeneration: prepared.target.connectionGeneration,
            processInstanceId: prepared.target.processInstanceId,
          },
        }),
      ).not.toThrow();
      const conflicts = [
        { ...prepared, threadId: h.second.threadId },
        {
          ...prepared,
          target: { ...prepared.target, processInstanceId: randomUUID() },
        },
        {
          ...prepared,
          target: { ...prepared.target, connectionGeneration: randomUUID() },
        },
        {
          ...prepared,
          target: { ...prepared.target, configContextId: "different" },
        },
        {
          ...prepared,
          target: {
            ...prepared.target,
            nativeSessionRef: "/native/second.jsonl",
          },
        },
        { ...prepared, previousText: "不同旧正文" },
        {
          ...prepared,
          command: { ...prepared.command, entryId: randomUUID() },
        },
        { ...prepared, command: { ...prepared.command, revision: 9 } },
        {
          ...prepared,
          command: {
            action: "delete" as const,
            entryId: prepared.command.entryId,
            revision: 3,
          },
        },
        {
          ...prepared,
          command: {
            action: "save-edit" as const,
            entryId: prepared.command.entryId,
            revision: 3,
            text: "另一正文",
          },
        },
      ];
      for (const conflict of conflicts)
        expect(() => h.changes.prepare(conflict)).toThrow("identity conflict");
      expect(h.changes.list(h.first.threadId)).toEqual(original);
      expect(h.changes.list(h.second.threadId)).toEqual([]);
    } finally {
      h.database.close();
    }
  }));

it("persists confirmed results and allows late evidence to settle unknown without erasing a confirmed terminal", () =>
  fixture((path) => {
    const h = open(path);
    try {
      const first = value(h.first.threadId);
      const second = value(h.second.threadId);
      h.changes.prepare(first);
      h.changes.prepare(second);
      h.changes.finish(first.traceId, "unknown");
      expect(h.changes.list(h.first.threadId)[0]?.status).toBe("unknown");
      h.changes.finish(first.traceId, "acknowledged");
      const acknowledged = h.changes.list(h.first.threadId);
      expect(acknowledged[0]?.status).toBe("acknowledged");
      h.changes.finish(first.traceId, "failed");
      h.changes.finish(first.traceId, "unknown");
      h.changes.prepare(first);
      expect(h.changes.list(h.first.threadId)).toEqual(acknowledged);
      h.changes.finish(second.traceId, "failed");
      h.changes.finish(second.traceId, "unknown");
      h.changes.finish(second.traceId, "acknowledged");
      expect(h.changes.list(h.second.threadId)[0]?.status).toBe("failed");
      expect(() => h.changes.finish(randomUUID(), "acknowledged")).toThrow(
        "Unknown queue change",
      );
    } finally {
      h.database.close();
    }
  }));

it("recovers only dispatching changes to unknown and leaves all native identities and frozen text intact", () =>
  fixture((path) => {
    const h = open(path);
    try {
      const pending = value(h.first.threadId);
      const confirmed = value(h.second.threadId);
      const uncertain = value(h.first.threadId);
      h.changes.prepare(pending);
      h.changes.prepare(confirmed);
      h.changes.prepare(uncertain);
      h.changes.finish(confirmed.traceId, "acknowledged");
      h.changes.finish(uncertain.traceId, "unknown");
      expect(h.changes.recoverInterruptedChanges()).toBe(1);
      expect(
        h.changes
          .list(h.first.threadId)
          .find((record) => record.traceId === pending.traceId),
      ).toEqual({
        ...pending,
        status: "unknown",
        createdAt: expect.any(String),
      });
      expect(h.changes.list(h.second.threadId)[0]?.status).toBe("acknowledged");
      expect(h.changes.recoverInterruptedChanges()).toBe(0);
    } finally {
      h.database.close();
    }
  }));

it("rolls back an ACK persistence failure and does not report a confirmed result", () =>
  fixture((path) => {
    const h = open(path);
    try {
      const prepared = value(h.first.threadId);
      h.changes.prepare(prepared);
      h.database.connection.exec(
        "CREATE TRIGGER reject_ack BEFORE UPDATE ON queue_change BEGIN SELECT RAISE(ABORT,'ack write failed'); END;",
      );
      expect(() => h.changes.finish(prepared.traceId, "acknowledged")).toThrow(
        "ack write failed",
      );
      expect(h.changes.list(h.first.threadId)[0]?.status).toBe("dispatching");
      const reader = new DatabaseSync(path, { readOnly: true });
      try {
        expect(
          reader
            .prepare(
              "SELECT json_extract(record,'$.status') AS status FROM queue_change WHERE id=?",
            )
            .get(prepared.traceId)?.status,
        ).toBe("dispatching");
      } finally {
        reader.close();
      }
      h.database.connection.exec("DROP TRIGGER reject_ack");
      h.changes.finish(prepared.traceId, "acknowledged");
      expect(h.changes.list(h.first.threadId)[0]?.status).toBe("acknowledged");
    } finally {
      h.database.close();
    }
  }));

it("recovers interrupted changes in one transaction and rolls all rows back when one write fails", () =>
  fixture((path) => {
    const h = open(path);
    try {
      const first = value(h.first.threadId);
      const second = value(h.first.threadId);
      h.changes.prepare(first);
      h.changes.prepare(second);
      h.database.connection.exec(
        `CREATE TRIGGER reject_recovery BEFORE UPDATE ON queue_change WHEN NEW.id='${second.traceId}' BEGIN SELECT RAISE(ABORT,'recovery write failed'); END;`,
      );
      expect(() => h.changes.recoverInterruptedChanges()).toThrow(
        "recovery write failed",
      );
      expect(
        h.changes.list(h.first.threadId).map((record) => record.status),
      ).toEqual(["dispatching", "dispatching"]);
      h.database.connection.exec("DROP TRIGGER reject_recovery");
      expect(h.changes.recoverInterruptedChanges()).toBe(2);
    } finally {
      h.database.close();
    }
  }));

it("rejects a stored record whose Thread or trace differs from its indexed ownership", () =>
  fixture((path) => {
    const h = open(path);
    try {
      const prepared = value(h.first.threadId);
      h.changes.prepare(prepared);
      h.database.connection
        .prepare(
          "UPDATE queue_change SET record=json_set(record,'$.threadId',?) WHERE id=?",
        )
        .run(h.second.threadId, prepared.traceId);
      expect(() => h.changes.list(h.first.threadId)).toThrow(
        "identity mismatch",
      );
      expect(() => h.changes.prepare(prepared)).toThrow("identity mismatch");
      expect(h.changes.list(h.second.threadId)).toEqual([]);
    } finally {
      h.database.close();
    }
  }));

it("finds only the exact persisted trace and reports missing nonpersistent operations as absent", () =>
  fixture((path) => {
    const h = open(path);
    try {
      const first = value(h.first.threadId);
      const second = value(h.second.threadId);
      h.changes.prepare(first);
      h.changes.prepare(second);
      expect(h.changes.find(first.traceId)).toEqual({
        ...first,
        status: "dispatching",
        createdAt: expect.any(String),
      });
      expect(h.changes.find(second.traceId)?.threadId).toBe(h.second.threadId);
      expect(h.changes.find(randomUUID())).toBeNull();
    } finally {
      h.database.close();
    }
  }));

it("persists original queue image identities and rejects reuse with different original images", () =>
  fixture((path) => {
    const h = open(path);
    try {
      const prepared = {
        ...value(h.first.threadId),
        previousImages: [{ id: randomUUID(), mimeType: "image/png" }],
      };
      h.changes.prepare(prepared);
      expect(h.changes.find(prepared.traceId)?.previousImages).toEqual(
        prepared.previousImages,
      );
      expect(() =>
        h.changes.prepare({
          ...prepared,
          previousImages: [{ id: randomUUID(), mimeType: "image/png" }],
        }),
      ).toThrow("identity conflict");
      h.changes.recoverInterruptedChanges();
      expect(h.changes.find(prepared.traceId)).toMatchObject({
        status: "unknown",
        previousImages: prepared.previousImages,
      });
    } finally {
      h.database.close();
    }
  }));
