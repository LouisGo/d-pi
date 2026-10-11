import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { AppDatabase } from "../../../platform/main/storage/public";
import { AppStorage } from "./app-storage";

function fixture(run: (path: string, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-storage-init-"));
  try {
    run(join(dir, "app.sqlite"), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

it("publishes usable repositories as the only successful opening result", () => {
  fixture((path, dir) => {
    const store = AppStorage.open(path);
    try {
      const draft = store.drafts.create(dir);
      expect(store.drafts.read(draft.threadId).directory).toBe(dir);
      expect(store.preferences.read().locale).toBe("system");
    } finally {
      store.close();
    }
  });
});

it("releases the opened storage idempotently", () => {
  fixture((path) => {
    const store = AppStorage.open(path);
    store.close();
    expect(() => store.close()).not.toThrow();
    expect(() => store.preferences.read()).toThrow();
  });
});

it("publishes persistent answers only after interrupted intents are recovered without dispatch", () => {
  fixture((path, dir) => {
    const store = AppStorage.open(path);
    const threadId = store.drafts.create(dir).threadId;
    const key = {
      threadId,
      nativeSessionKey: "native",
      connectionGeneration: crypto.randomUUID(),
      requestId: "A",
    };
    const operationId = crypto.randomUUID();
    store.answerHistory.prepare(
      key,
      {
        id: "A",
        method: "input",
        title: "Question",
        status: "pending",
        expiresAt: null,
      },
      operationId,
      { kind: "value", value: "frozen" },
    );
    store.close();
    const reopened = AppStorage.open(path);
    try {
      expect(reopened.answerHistory.page(threadId).entries[0]).toMatchObject({
        kind: "answer",
        operationId,
        status: "unknown",
        answer: { value: "frozen" },
      });
      expect(
        reopened.database.connection.prepare("PRAGMA user_version").get()
          ?.user_version,
      ).toBe(17);
    } finally {
      reopened.close();
    }
  });
});

it("closes a failed migration while preserving its actual cause and original schema", () => {
  fixture((path) => {
    const prior = new DatabaseSync(path);
    prior.exec(`
      CREATE TABLE desktop(id INTEGER PRIMARY KEY, theme TEXT, density TEXT, send_key TEXT, locale TEXT);
      INSERT INTO desktop VALUES(1,'dark','compact','enter','en-US');
      CREATE TABLE submission(id TEXT PRIMARY KEY, receipt TEXT NOT NULL);
      PRAGMA user_version=4;
    `);
    prior.close();
    const close = vi.spyOn(AppDatabase.prototype, "close");
    try {
      expect(() => AppStorage.open(path)).toThrow(
        /duplicate column name: locale/,
      );
      expect(close).toHaveBeenCalledTimes(1);
      const failed = close.mock.instances[0];
      expect(failed).toMatchObject({ connection: { isOpen: false } });
      const retained = new DatabaseSync(path, { readOnly: true });
      try {
        expect(
          retained.prepare("PRAGMA user_version").get()?.user_version,
        ).toBe(4);
        expect(
          retained.prepare("SELECT theme,locale FROM desktop").get(),
        ).toEqual({
          theme: "dark",
          locale: "en-US",
        });
      } finally {
        retained.close();
      }
    } finally {
      close.mockRestore();
    }
  });
});
it("backs up the exact v16 boundary before adding answer history and keeps existing drafts", () => {
  fixture((path, dir) => {
    const old = AppStorage.open(path);
    const threadId = old.drafts.create(dir).threadId;
    old.drafts.save(threadId, 0, "precious original");
    old.database.connection.exec(
      "DROP TABLE interaction_history; PRAGMA user_version=16;",
    );
    old.close();
    const reopened = AppStorage.open(path);
    try {
      expect(reopened.drafts.read(threadId).text).toBe("precious original");
      expect(reopened.answerHistory.page(threadId).entries).toEqual([]);
      const backup = new DatabaseSync(`${path}.before-v17`, { readOnly: true });
      try {
        expect(backup.prepare("PRAGMA user_version").get()?.user_version).toBe(
          16,
        );
        expect(
          backup
            .prepare(
              "SELECT name FROM sqlite_master WHERE name='interaction_history'",
            )
            .get(),
        ).toBeUndefined();
      } finally {
        backup.close();
      }
    } finally {
      reopened.close();
    }
  });
});
