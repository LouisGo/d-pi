import { isDeepStrictEqual } from "node:util";
import type { AppDatabase } from "../../../../platform/main/storage/public";
import {
  type Answer,
  type AnswerHistoryEntry,
  AnswerHistoryEntrySchema,
  type AnswerHistoryPage,
  AnswerHistoryQuerySchema,
  AnswerSendStatusSchema,
  DialogSchema,
  type Interaction,
  type RequestKey,
  RequestKeySchema,
  validAnswerFor,
} from "../../contracts/public";

type AnswerRecord = Extract<AnswerHistoryEntry, { kind: "answer" }>;
type RequestRecord = Extract<AnswerHistoryEntry, { kind: "request" }>;
const PAGE_BYTES = 2 * 1024 * 1024;
const requestId = (key: RequestKey): string =>
  `request:${JSON.stringify([key.threadId, key.nativeSessionKey, key.connectionGeneration, key.requestId])}`;
const answerId = (operationId: string): string => `answer:${operationId}`;

/** App-owned question/intent/write observations; never a native event ledger. */
export class AnswerHistoryRepository {
  constructor(private readonly database: AppDatabase) {}
  private get db() {
    return this.database.connection;
  }

  observeRequest(rawKey: RequestKey, item: Interaction): void {
    this.database.transaction(() => this.observe(rawKey, item));
  }
  private observe(rawKey: RequestKey, item: Interaction): void {
    const key = RequestKeySchema.parse(rawKey),
      dialog = DialogSchema.parse(item);
    if (dialog.id !== key.requestId)
      throw Error("Answer history identity conflict");
    const id = requestId(key),
      existing = this.find(id);
    if (
      existing &&
      (!isDeepStrictEqual(existing.requestKey, key) ||
        !isDeepStrictEqual(existing.dialog, dialog))
    )
      throw Error("Answer history identity conflict");
    const presence =
      item.requestPresence ??
      (item.status === "pending"
        ? "observed"
        : item.status === "cancelled" && !item.dismissed
          ? "ended"
          : "unknown");
    if (existing?.kind === "request") {
      if (existing.presence === presence || existing.presence === "ended")
        return;
      this.write(id, {
        ...existing,
        presence,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const now = new Date().toISOString();
      this.insert(id, {
        kind: "request",
        requestKey: key,
        dialog,
        presence,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  prepare(
    key: RequestKey,
    item: Interaction,
    operationId: string,
    answer: Answer,
    origin: "user" | "default" = "user",
  ): boolean {
    return this.database.transaction(() => {
      this.observe(key, item);
      if (!validAnswerFor(item, answer)) throw Error("Invalid native answer");
      const id = answerId(operationId),
        existing = this.find(id);
      const dialog = DialogSchema.parse(item);
      if (existing) {
        if (
          existing.kind !== "answer" ||
          !isDeepStrictEqual(existing.requestKey, key) ||
          !isDeepStrictEqual(existing.dialog, dialog) ||
          !isDeepStrictEqual(existing.answer, answer) ||
          existing.origin !== origin
        )
          throw Error("Answer history identity conflict");
        return false;
      }
      const now = new Date().toISOString();
      this.insert(id, {
        kind: "answer",
        requestKey: key,
        dialog,
        operationId,
        answer,
        origin,
        status: "dispatching",
        createdAt: now,
        updatedAt: now,
      });
      return true;
    });
  }
  finish(
    operationId: string,
    status: "written" | "not-dispatched" | "unknown",
    observedAt?: string,
    expectedKey?: RequestKey,
  ): void {
    AnswerSendStatusSchema.parse(status);
    this.database.transaction(() => {
      const id = answerId(operationId),
        entry = this.find(id);
      if (!entry || entry.kind !== "answer")
        throw Error("Unknown answer intent");
      if (expectedKey && !isDeepStrictEqual(entry.requestKey, expectedKey))
        throw Error("Answer history identity conflict");
      if (
        entry.status === "written" ||
        entry.status === "not-dispatched" ||
        entry.status === status
      )
        return;
      this.write(id, {
        ...entry,
        status,
        ...(observedAt ? { answerObservedAt: observedAt } : {}),
        updatedAt: new Date().toISOString(),
      });
    });
  }
  page(threadId: string, cursor: number | null = null): AnswerHistoryPage {
    const query = AnswerHistoryQuerySchema.parse({ threadId, cursor });
    const rows = this.db
      .prepare(
        "SELECT rowid AS position,length(CAST(record AS BLOB)) AS bytes FROM interaction_history WHERE thread_id=? AND (? IS NULL OR rowid<?) ORDER BY rowid DESC LIMIT 21",
      )
      .all(threadId, cursor, cursor);
    const entries: AnswerHistoryEntry[] = [];
    let bytes = 512,
      last: number | null = null;
    for (const row of rows) {
      if (typeof row.bytes !== "number" || typeof row.position !== "number")
        throw Error("Invalid answer history cursor");
      if (row.bytes > PAGE_BYTES - 512)
        throw Error("Answer history entry exceeds page budget");
      if (entries.length === 20 || bytes + row.bytes + 1 > PAGE_BYTES) break;
      const stored = this.db
        .prepare(
          "SELECT id,thread_id,record FROM interaction_history WHERE rowid=? AND thread_id=?",
        )
        .get(row.position, threadId);
      if (!stored) throw Error("Answer history changed while reading");
      entries.push(this.decode(stored));
      bytes += row.bytes + 1;
      last = row.position;
    }
    return {
      threadId: query.threadId,
      source: "app-observed",
      entries,
      cursor: rows.length > entries.length ? last : null,
    };
  }
  recoverInterruptedAnswers(): number {
    return this.database.transaction(() => {
      const now = new Date().toISOString();
      const interrupted = this.db
        .prepare(
          "UPDATE interaction_history SET record=json_set(record,'$.status','unknown','$.updatedAt',?) WHERE json_extract(record,'$.kind')='answer' AND json_extract(record,'$.status')='dispatching'",
        )
        .run(now);
      this.db
        .prepare(
          "UPDATE interaction_history SET record=json_set(record,'$.presence','unknown','$.updatedAt',?) WHERE json_extract(record,'$.kind')='request' AND json_extract(record,'$.presence')='observed'",
        )
        .run(now);
      return Number(interrupted.changes);
    });
  }
  disconnectScope(threadId: string, generation: string): void {
    this.database.transaction(() => {
      const now = new Date().toISOString();
      this.db
        .prepare(
          "UPDATE interaction_history SET record=json_set(record,'$.presence','unknown','$.updatedAt',?) WHERE thread_id=? AND json_extract(record,'$.requestKey.connectionGeneration')=? AND json_extract(record,'$.kind')='request' AND json_extract(record,'$.presence')='observed'",
        )
        .run(now, threadId, generation);
      this.db
        .prepare(
          "UPDATE interaction_history SET record=json_set(record,'$.status','unknown','$.updatedAt',?) WHERE thread_id=? AND json_extract(record,'$.requestKey.connectionGeneration')=? AND json_extract(record,'$.kind')='answer' AND json_extract(record,'$.status')='dispatching'",
        )
        .run(now, threadId, generation);
    });
  }
  private find(id: string): AnswerHistoryEntry | null {
    const row = this.db
      .prepare("SELECT id,thread_id,record FROM interaction_history WHERE id=?")
      .get(id);
    return row ? this.decode(row) : null;
  }
  private decode(row: Record<string, unknown>): AnswerHistoryEntry {
    if (typeof row.record !== "string")
      throw Error("Invalid answer history record");
    const entry = AnswerHistoryEntrySchema.parse(JSON.parse(row.record));
    const id =
      entry.kind === "answer"
        ? answerId(entry.operationId)
        : requestId(entry.requestKey);
    if (
      id !== row.id ||
      entry.requestKey.threadId !== row.thread_id ||
      entry.dialog.id !== entry.requestKey.requestId
    )
      throw Error("Answer history identity mismatch");
    return entry;
  }
  private insert(id: string, entry: AnswerRecord | RequestRecord): void {
    const record = JSON.stringify(AnswerHistoryEntrySchema.parse(entry));
    if (Buffer.byteLength(record) > PAGE_BYTES - 512)
      throw Error("Answer history entry exceeds page budget");
    this.db
      .prepare(
        "INSERT INTO interaction_history(id,thread_id,record) VALUES(?,?,?)",
      )
      .run(id, entry.requestKey.threadId, record);
  }
  private write(id: string, entry: AnswerHistoryEntry): void {
    const record = JSON.stringify(AnswerHistoryEntrySchema.parse(entry));
    const result = this.db
      .prepare(
        "UPDATE interaction_history SET record=? WHERE id=? AND thread_id=?",
      )
      .run(record, id, entry.requestKey.threadId);
    if (result.changes !== 1) throw Error("Answer history persistence failed");
  }
}
