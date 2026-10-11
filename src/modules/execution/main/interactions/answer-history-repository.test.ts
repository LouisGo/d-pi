import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { AppDatabase } from "../../../../platform/main/storage/public";
import { ThreadRepository } from "../../../threads/main/public";
import type { Interaction, RequestKey } from "../../contracts/public";
import { AnswerHistoryRepository } from "./answer-history-repository";

function fixture(run: (path: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "dpi-answer-history-"));
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
  const threadId = threads.create("/fixture").threadId;
  return {
    database,
    history: new AnswerHistoryRepository(database),
    key: {
      threadId,
      nativeSessionKey: "actual-native",
      connectionGeneration: randomUUID(),
      requestId: "A",
    } satisfies RequestKey,
  };
}
function question(id = "A"): Interaction {
  return {
    id,
    method: "input",
    title: "原始题目",
    prefill: "",
    status: "pending",
    expiresAt: null,
    requestPresence: "observed",
  };
}
const answer = { kind: "value", value: "  中文原始答案  " } as const;

it("freezes the question and answer durably before native dispatch; repeated IDs cannot change their source or content", () =>
  fixture((path) => {
    const f = open(path);
    try {
      const operationId = randomUUID();
      f.history.observeRequest(f.key, question());
      f.history.prepare(f.key, question(), operationId, answer);
      f.history.prepare(f.key, question(), operationId, answer);
      expect(() =>
        f.history.prepare(f.key, question(), operationId, {
          kind: "value",
          value: "changed",
        }),
      ).toThrow(/identity conflict/);
      expect(() =>
        f.history.prepare(
          { ...f.key, nativeSessionKey: "foreign" },
          question(),
          operationId,
          answer,
        ),
      ).toThrow(/identity conflict/);
      expect(() =>
        f.history.observeRequest(f.key, { ...question(), title: "changed" }),
      ).toThrow(/identity conflict/);
      const reader = new DatabaseSync(path, { readOnly: true });
      try {
        const rows = reader
          .prepare("SELECT record FROM interaction_history ORDER BY rowid")
          .all();
        expect(rows).toHaveLength(2);
        expect(JSON.parse(String(rows[1]!.record))).toMatchObject({
          kind: "answer",
          requestKey: f.key,
          dialog: { title: "原始题目" },
          answer,
          status: "dispatching",
        });
        expect(
          reader.prepare("SELECT COUNT(*) AS count FROM submission").get()
            ?.count,
        ).toBe(0);
      } finally {
        reader.close();
      }
    } finally {
      f.database.close();
    }
  }));

it("keeps written send evidence when native ends the request and preserves every retry as a separate frozen attempt", () =>
  fixture((path) => {
    const f = open(path);
    try {
      const rejected = randomUUID(),
        written = randomUUID();
      f.history.prepare(f.key, question(), rejected, answer);
      f.history.finish(rejected, "not-dispatched");
      f.history.prepare(f.key, question(), written, {
        kind: "value",
        value: "retry",
      });
      f.history.finish(written, "written");
      f.history.finish(written, "unknown");
      f.history.observeRequest(f.key, {
        ...question(),
        status: "cancelled",
        requestPresence: "ended",
      });
      const entries = f.history.page(f.key.threadId).entries;
      expect(entries).toHaveLength(3);
      expect(entries[0]).toMatchObject({
        kind: "answer",
        operationId: written,
        answer: { value: "retry" },
        status: "written",
      });
      expect(entries[1]).toMatchObject({
        kind: "answer",
        operationId: rejected,
        answer,
        status: "not-dispatched",
      });
      expect(entries[2]).toMatchObject({ kind: "request", presence: "ended" });
    } finally {
      f.database.close();
    }
  }));

it("recovers interrupted sends as unknown after reopening; request existence also becomes unknown without inventing cancellation", () =>
  fixture((path) => {
    const f = open(path),
      operationId = randomUUID();
    f.history.prepare(f.key, question(), operationId, answer);
    f.database.close();
    const reopened = new AppDatabase(path);
    try {
      reopened.completeSchemaMigrations();
      const history = new AnswerHistoryRepository(reopened);
      expect(history.recoverInterruptedAnswers()).toBe(1);
      const entries = history.page(f.key.threadId).entries;
      expect(entries[0]).toMatchObject({
        kind: "answer",
        status: "unknown",
        answer,
      });
      expect(entries[1]).toMatchObject({
        kind: "request",
        presence: "unknown",
      });
      expect(history.recoverInterruptedAnswers()).toBe(0);
    } finally {
      reopened.close();
    }
  }));

it("pages all App-observed history beyond the 32-request mirror without mixing Threads or native generations", () =>
  fixture((path) => {
    const f = open(path);
    try {
      for (let index = 0; index < 75; index++) {
        const key = {
          ...f.key,
          requestId: String(index),
          connectionGeneration:
            index % 2 ? randomUUID() : f.key.connectionGeneration,
        };
        f.history.prepare(key, question(key.requestId), randomUUID(), answer);
      }
      const other = new ThreadRepository(f.database).create("/other").threadId;
      f.history.prepare(
        { ...f.key, threadId: other },
        question(),
        randomUUID(),
        answer,
      );
      const entries = [];
      let cursor: number | null = null;
      do {
        const page = f.history.page(f.key.threadId, cursor);
        expect(page.entries.length).toBeLessThanOrEqual(20);
        expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(
          2 * 1024 * 1024,
        );
        entries.push(...page.entries);
        cursor = page.cursor;
      } while (cursor !== null);
      expect(entries).toHaveLength(150);
      expect(
        entries.every((entry) => entry.requestKey.threadId === f.key.threadId),
      ).toBe(true);
      expect(
        new Set(
          entries
            .filter((entry) => entry.kind === "answer")
            .map((entry) => entry.operationId),
        ).size,
      ).toBe(75);
      expect(() => f.history.page(f.key.threadId, -1)).toThrow();
    } finally {
      f.database.close();
    }
  }));

it("bounds a page by UTF-8 bytes, keeps its cursor progressing and retains complete native question text", () =>
  fixture((path) => {
    const f = open(path);
    try {
      const questions = [
        {
          id: "q",
          question: "多选",
          multi: true,
          options: Array.from({ length: 5 }, (_, index) => ({
            label: String(index),
            preview: "中".repeat(65536),
          })),
        },
      ];
      for (let index = 0; index < 4; index++) {
        const key = { ...f.key, requestId: String(index) };
        f.history.prepare(
          key,
          { ...question(key.requestId), method: "ask", questions },
          randomUUID(),
          { kind: "ask", answers: [{ id: "q", selectedOptions: [] }] },
        );
      }
      let total = 0,
        cursor: number | null = null;
      do {
        const page = f.history.page(f.key.threadId, cursor);
        expect(page.entries.length).toBeGreaterThan(0);
        expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(
          2 * 1024 * 1024,
        );
        expect(page.entries[0]?.dialog.method).toBe("ask");
        total += page.entries.length;
        cursor = page.cursor;
      } while (cursor !== null);
      expect(total).toBe(8);
    } finally {
      f.database.close();
    }
  }));
