import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DraftService } from "./draft-service";
import { AppStorage } from "./storage/app-storage";

function fixture(
  run: (path: string, dir: string) => void | Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-core-"));
  return Promise.resolve()
    .then(() => run(join(dir, "app.sqlite"), dir))
    .finally(() => rmSync(dir, { recursive: true, force: true }));
}
describe("real SQLite and directory service", () => {
  it("migrates existing v4 preferences to system locale without changing other settings", () =>
    fixture((path) => {
      const db = new DatabaseSync(path);
      db.exec(`
        CREATE TABLE desktop(id INTEGER PRIMARY KEY CHECK(id=1), active_thread TEXT, theme TEXT NOT NULL, density TEXT NOT NULL, send_key TEXT);
        INSERT INTO desktop VALUES(1,NULL,'dark','compact','enter-newline');
        CREATE TABLE submission(id TEXT PRIMARY KEY, receipt TEXT NOT NULL);
        PRAGMA user_version=4;
      `);
      db.close();
      const store = new AppStorage(path);
      expect(store.preferences.read()).toEqual({
        theme: "dark",
        density: "compact",
        sendKey: "enter-newline",
        locale: "system",
      });
      store.preferences.saveLocale("en-US");
      expect(
        store.preferences.save({
          theme: "dark",
          density: "compact",
          sendKey: "enter-newline",
          locale: "zh-CN",
        }),
      ).toBeUndefined();
      store.close();
      const reopened = new AppStorage(path);
      expect(reopened.preferences.read().locale).toBe("en-US");
      reopened.close();
      const migrated = new DatabaseSync(path, { readOnly: true });
      expect(migrated.prepare("PRAGMA user_version").get()?.user_version).toBe(
        5,
      );
      migrated.close();
      const backup = new DatabaseSync(`${path}.before-v5`, { readOnly: true });
      expect(backup.prepare("PRAGMA user_version").get()?.user_version).toBe(4);
      expect(
        backup
          .prepare("SELECT theme,density,send_key FROM desktop WHERE id=1")
          .get(),
      ).toEqual({
        theme: "dark",
        density: "compact",
        send_key: "enter-newline",
      });
      backup.close();
    }));
  it("migration backup includes committed WAL records while an old reader holds a snapshot", () =>
    fixture((path) => {
      const writer = new DatabaseSync(path);
      writer.exec(
        "PRAGMA journal_mode=WAL; CREATE TABLE precious(revision INTEGER, body TEXT); INSERT INTO precious VALUES(1,'old'); PRAGMA wal_checkpoint(TRUNCATE)",
      );
      const reader = new DatabaseSync(path);
      reader.exec("BEGIN");
      reader.prepare("SELECT * FROM precious").all();
      writer.exec("UPDATE precious SET revision=2,body='最新已提交正文'");
      let store: AppStorage | undefined;
      try {
        store = new AppStorage(path);
        const backup = new DatabaseSync(`${path}.before-v1`, {
          readOnly: true,
        });
        try {
          expect(
            backup.prepare("SELECT revision,body FROM precious").get(),
          ).toEqual({ revision: 2, body: "最新已提交正文" });
          expect(
            backup.prepare("PRAGMA user_version").get()?.user_version,
          ).toBe(0);
        } finally {
          backup.close();
        }
      } finally {
        reader.exec("ROLLBACK");
        reader.close();
        writer.close();
        store?.close();
      }
    }));
  it("stable identities, two threads, CAS and restart", () =>
    fixture((path) => {
      let store = new AppStorage(path);
      const a = store.drafts.create("/a");
      const b = store.drafts.create("/a");
      expect(a.threadId).not.toBe(b.threadId);
      expect(a.workspaceId).toBe(b.workspaceId);
      expect(store.drafts.save(a.threadId, 0, "a body")).toBe(1);
      expect(store.drafts.save(a.threadId, 0, "stale")).toBeNull();
      expect(store.drafts.read(b.threadId).text).toBe("");
      store.close();
      store = new AppStorage(path);
      expect(store.drafts.read(a.threadId)).toEqual({
        ...a,
        revision: 1,
        text: "a body",
      });
      expect(store.drafts.active()?.threadId).toBe(b.threadId);
      store.close();
    }));
  it("cancel/invalid directory does not associate a thread; foreign ID cannot write", () =>
    fixture(async (path, dir) => {
      const store = new AppStorage(path);
      let selected: string | null = null;
      const service = new DraftService(store, async () => selected);
      const traceId = crypto.randomUUID();
      expect(
        await service.execute({ kind: "choose-project", traceId }),
      ).toEqual({ kind: "cancelled" });
      expect(store.drafts.active()).toBeNull();
      selected = join(dir, "missing");
      expect(
        (await service.execute({ kind: "choose-project", traceId })).kind,
      ).toBe("failed");
      expect(store.drafts.active()).toBeNull();
      selected = dir;
      expect(
        (await service.execute({ kind: "choose-project", traceId })).kind,
      ).toBe("ready");
      const old = store.drafts.active();
      const newDraft = store.drafts.create(dir);
      if (!old) throw Error("missing");
      expect(
        (
          await service.execute({
            kind: "save",
            traceId,
            threadId: old.threadId,
            expectedRevision: 0,
            text: "wrong",
          })
        ).kind,
      ).toBe("failed");
      expect(store.drafts.read(newDraft.threadId).text).toBe("");
      store.close();
    }));
  it("migration failure retains original DB and rollback; future schema is not reset", () =>
    fixture((path) => {
      let db = new DatabaseSync(path);
      db.exec(
        "CREATE TABLE thread(id TEXT); INSERT INTO thread VALUES('precious')",
      );
      db.close();
      expect(() => new AppStorage(path)).toThrow();
      expect(readFileSync(`${path}.before-v1`).length).toBeGreaterThan(0);
      db = new DatabaseSync(path);
      expect(db.prepare("SELECT id FROM thread").get()?.id).toBe("precious");
      expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(0);
      expect(
        db
          .prepare("SELECT name FROM sqlite_master WHERE name='workspace'")
          .get(),
      ).toBeUndefined();
      db.exec("PRAGMA user_version=999");
      db.close();
      expect(() => new AppStorage(path)).toThrow();
      db = new DatabaseSync(path);
      expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(999);
      db.close();
    }));
  it("locked writer reports failure without overwriting draft", () =>
    fixture(async (path) => {
      const store = new AppStorage(path);
      const draft = store.drafts.create("/fixture");
      const locker = new DatabaseSync(path);
      locker.exec("BEGIN IMMEDIATE");
      const service = new DraftService(store, async () => null);
      const result = await service.execute({
        kind: "save",
        traceId: crypto.randomUUID(),
        threadId: draft.threadId,
        expectedRevision: 0,
        text: "unsaved",
      });
      expect(result.kind).toBe("failed");
      expect(store.drafts.read(draft.threadId).text).toBe("");
      locker.exec("ROLLBACK");
      locker.close();
      store.close();
    }));
});

it("overlapping project requests open one dialog and create one foreground identity", () =>
  fixture(async (path, dir) => {
    const store = new AppStorage(path);
    let finish: ((path: string) => void) | undefined;
    const service = new DraftService(
      store,
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.execute({
      kind: "choose-project",
      traceId: crypto.randomUUID(),
    });
    expect(
      (
        await service.execute({
          kind: "choose-project",
          traceId: crypto.randomUUID(),
        })
      ).kind,
    ).toBe("failed");
    finish?.(dir);
    expect((await first).kind).toBe("ready");
    const active = store.drafts.active();
    expect(
      (
        await service.execute({
          kind: "choose-project",
          traceId: crypto.randomUUID(),
        })
      ).kind,
    ).toBe("failed");
    expect(store.drafts.active()?.threadId).toBe(active?.threadId);
    store.close();
  }));
