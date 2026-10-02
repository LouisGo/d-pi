import { isDeepStrictEqual } from "node:util";
import type { AppDatabase } from "../../../../platform/main/storage/public";
import { type QueueChange, QueueChangeSchema } from "../../contracts/public";

export class QueueChangeRepository {
  constructor(private readonly database: AppDatabase) {}
  private get db() {
    return this.database.connection;
  }
  prepare(value: Omit<QueueChange, "status" | "createdAt">): void {
    this.database.transaction(() => {
      const existing = this.find(value.traceId);
      if (existing) {
        if (
          existing.threadId !== value.threadId ||
          existing.previousText !== value.previousText ||
          !!existing.previousTruncated !== !!value.previousTruncated ||
          !isDeepStrictEqual(existing.target, value.target) ||
          !isDeepStrictEqual(existing.previousImages, value.previousImages) ||
          !isDeepStrictEqual(existing.command, value.command)
        )
          throw Error("Queue change identity conflict");
        return;
      }
      const record: QueueChange = {
        traceId: value.traceId,
        threadId: value.threadId,
        target: value.target,
        command: value.command,
        previousText: value.previousText,
        ...(value.previousImages
          ? { previousImages: value.previousImages }
          : {}),
        ...(value.previousTruncated !== undefined
          ? { previousTruncated: value.previousTruncated }
          : {}),
        status: "dispatching",
        createdAt: new Date().toISOString(),
      };
      this.db
        .prepare("INSERT INTO queue_change VALUES(?,?,?)")
        .run(record.traceId, record.threadId, JSON.stringify(record));
    });
  }
  finish(traceId: string, status: "acknowledged" | "failed" | "unknown"): void {
    this.database.transaction(() => {
      const record = this.find(traceId);
      if (!record) throw Error("Unknown queue change");
      if (
        record.status === "acknowledged" ||
        record.status === "failed" ||
        record.status === status
      )
        return;
      this.write({ ...record, status });
    });
  }
  private write(record: QueueChange): void {
    const result = this.db
      .prepare("UPDATE queue_change SET record=? WHERE id=? AND thread_id=?")
      .run(JSON.stringify(record), record.traceId, record.threadId);
    if (result.changes !== 1) throw Error("Queue change persistence failed");
  }
  list(threadId: string): QueueChange[] {
    return this.db
      .prepare(
        "SELECT id,thread_id,record FROM queue_change WHERE thread_id=? ORDER BY rowid DESC",
      )
      .all(threadId)
      .map((row) => this.decode(row));
  }
  find(traceId: string): QueueChange | null {
    const row = this.db
      .prepare("SELECT id,thread_id,record FROM queue_change WHERE id=?")
      .get(traceId);
    return row ? this.decode(row) : null;
  }
  private decode(row: Record<string, unknown>): QueueChange {
    if (typeof row.record !== "string")
      throw Error("Invalid queue change record");
    const record = QueueChangeSchema.parse(JSON.parse(row.record));
    if (record.traceId !== row.id || record.threadId !== row.thread_id)
      throw Error("Queue change identity mismatch");
    return record;
  }
  recoverInterruptedChanges(): number {
    return this.database.transaction(() => {
      const rows = this.db
        .prepare(
          "SELECT id,thread_id,record FROM queue_change WHERE json_extract(record,'$.status')='dispatching' ORDER BY rowid",
        )
        .all();
      for (const row of rows)
        this.write({ ...this.decode(row), status: "unknown" });
      return rows.length;
    });
  }
}
