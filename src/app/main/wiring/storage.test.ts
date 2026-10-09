import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { AppStorage } from "./app-storage";
import { DesktopCommandService } from "./desktop-command-service";

function fixture(
  run: (path: string, dir: string) => void | Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-core-"));
  return Promise.resolve()
    .then(() => run(join(dir, "app.sqlite"), dir))
    .finally(() => rmSync(dir, { recursive: true, force: true }));
}
function openStorage(path: string): AppStorage {
  const store = AppStorage.open(path);
  return store;
}
describe("real SQLite and directory service", () => {
  it("migrates existing v4 preferences to system locale without changing other settings", () =>
    fixture((path) => {
      const db = new DatabaseSync(path);
      db.exec(`
        CREATE TABLE desktop(id INTEGER PRIMARY KEY CHECK(id=1), active_thread TEXT, theme TEXT NOT NULL, density TEXT NOT NULL, send_key TEXT);
        INSERT INTO desktop VALUES(1,NULL,'dark','compact','enter-newline');
        CREATE TABLE workspace(id TEXT PRIMARY KEY,directory TEXT NOT NULL UNIQUE,execution_trust TEXT);
        CREATE TABLE thread(id TEXT PRIMARY KEY,workspace_id TEXT REFERENCES workspace(id),revision INTEGER,body TEXT);
        CREATE TABLE submission(id TEXT PRIMARY KEY,thread_id TEXT REFERENCES thread(id),receipt TEXT NOT NULL);
        CREATE TABLE draft_consumption(thread_id TEXT REFERENCES thread(id),revision INTEGER,submission_id TEXT REFERENCES submission(id));
        PRAGMA user_version=4;
      `);
      db.close();
      const store = openStorage(path);
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
      const reopened = openStorage(path);
      expect(reopened.preferences.read().locale).toBe("en-US");
      reopened.close();
      const migrated = new DatabaseSync(path, { readOnly: true });
      expect(migrated.prepare("PRAGMA user_version").get()?.user_version).toBe(
        13,
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
        store = openStorage(path);
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
  it("maps legacy SQLite directory identity while preserving native binding and draft through v7", () =>
    fixture((path) => {
      const directoryId = "cf049bd1-0015-44c8-a3d8-cfce812c7b76";
      const threadId = "8e324701-bfa8-4f6d-b989-36d3793e57aa";
      const originalText = "保留\r\n原文\r与目录";
      const db = new DatabaseSync(path);
      db.exec(`
        CREATE TABLE workspace(id TEXT PRIMARY KEY, directory TEXT NOT NULL UNIQUE, execution_trust TEXT);
        CREATE TABLE thread(id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspace(id), revision INTEGER, body TEXT);
        CREATE TABLE desktop(id INTEGER PRIMARY KEY, active_thread TEXT, theme TEXT, density TEXT, send_key TEXT, locale TEXT);
        CREATE TABLE submission(id TEXT PRIMARY KEY, thread_id TEXT, receipt TEXT);
        CREATE TABLE draft_consumption(thread_id TEXT, revision INTEGER, submission_id TEXT);
        CREATE TABLE execution_permission(workspace_id TEXT PRIMARY KEY, directory TEXT, device TEXT, inode TEXT);
        CREATE TABLE native_session(thread_id TEXT PRIMARY KEY, config_context TEXT, session_file TEXT, session_id TEXT);
        PRAGMA user_version=5;
      `);
      db.prepare("INSERT INTO workspace VALUES(?,?,'browse')").run(
        directoryId,
        "/existing",
      );
      db.prepare("INSERT INTO thread VALUES(?,?,7,?)").run(
        threadId,
        directoryId,
        originalText,
      );
      db.prepare(
        "INSERT INTO desktop VALUES(1,?,'dark','compact','enter-newline','zh-CN')",
      ).run(threadId);
      db.prepare("INSERT INTO execution_permission VALUES(?,?,?,?)").run(
        directoryId,
        "/existing",
        "device",
        "inode",
      );
      db.prepare("INSERT INTO native_session VALUES(?,?,?,?)").run(
        threadId,
        "profile",
        "/native.jsonl",
        "native-session",
      );
      db.close();
      const store = openStorage(path);
      try {
        const draft = store.drafts.active();
        expect(draft?.threadId).toBe(threadId);
        expect(draft?.text).toBe(originalText);
        expect(draft?.revision).toBe(7);
        expect(store.threads.nativeSessionBinding(threadId)).toEqual({
          threadId,
          configContextId: "profile",
          sessionFile: "/native.jsonl",
          sessionId: "native-session",
        });
        expect(draft && Reflect.get(draft, "workingDirectoryId")).toBe(
          directoryId,
        );
        expect(draft && Reflect.has(draft, "workspaceId")).toBe(false);
        expect(
          Reflect.get(
            store.threads.executionGrant(directoryId) ?? {},
            "workingDirectoryId",
          ),
        ).toBe(directoryId);
      } finally {
        store.close();
      }
      const unchanged = new DatabaseSync(path, { readOnly: true });
      try {
        expect(
          unchanged.prepare("PRAGMA user_version").get()?.user_version,
        ).toBe(14);
        expect(
          unchanged
            .prepare("SELECT workspace_id,body FROM thread WHERE id=?")
            .get(threadId),
        ).toEqual({ workspace_id: directoryId, body: originalText });
        expect(
          unchanged
            .prepare("SELECT session_id FROM native_session WHERE thread_id=?")
            .get(threadId)?.session_id,
        ).toBe("native-session");
      } finally {
        unchanged.close();
      }
    }));
  it("stable identities, two threads, CAS and restart", () =>
    fixture((path) => {
      let store = openStorage(path);
      const a = store.drafts.create("/a");
      const b = store.drafts.create("/a");
      expect(a.threadId).not.toBe(b.threadId);
      expect(a.workingDirectoryId).toBe(b.workingDirectoryId);
      expect(store.drafts.save(a.threadId, 0, "a body")).toBe(1);
      expect(store.drafts.save(a.threadId, 0, "stale")).toBeNull();
      expect(store.drafts.read(b.threadId).text).toBe("");
      store.close();
      store = openStorage(path);
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
      const store = openStorage(path);
      let selected: string | null = null;
      const service = new DesktopCommandService(store, async () => selected);
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
      expect(() => AppStorage.open(path)).toThrow();
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
      expect(() => AppStorage.open(path)).toThrow();
      db = new DatabaseSync(path);
      expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(999);
      db.close();
    }));
  it("locked writer reports failure without overwriting draft", () =>
    fixture(async (path) => {
      const store = openStorage(path);
      const draft = store.drafts.create("/fixture");
      const locker = new DatabaseSync(path);
      locker.exec("BEGIN IMMEDIATE");
      const service = new DesktopCommandService(store, async () => null);
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
    const store = openStorage(path);
    let finish: ((path: string) => void) | undefined;
    const service = new DesktopCommandService(
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
    const next = service.execute({
      kind: "choose-project",
      traceId: crypto.randomUUID(),
    });
    finish?.(dir);
    expect((await next).kind).toBe("ready");
    expect(store.drafts.active()?.threadId).not.toBe(active?.threadId);
    store.close();
  }));

it("backs up v5 before enabling typed native outcomes in v6 and reopens the new schema", () =>
  fixture((path) => {
    const original = openStorage(path);
    original.close();
    const migrated = new DatabaseSync(path, { readOnly: true });
    try {
      expect(migrated.prepare("PRAGMA user_version").get()?.user_version).toBe(
        13,
      );
    } finally {
      migrated.close();
    }
    const backup = new DatabaseSync(`${path}.before-v6`, { readOnly: true });
    try {
      expect(backup.prepare("PRAGMA user_version").get()?.user_version).toBe(5);
    } finally {
      backup.close();
    }
    openStorage(path).close();
  }));

it("a v6 backup publication failure preserves the v5 database and its draft instead of deleting it", () =>
  fixture((path) => {
    const store = openStorage(path);
    const draft = store.drafts.create("/fixture");
    store.drafts.save(draft.threadId, 0, "precious-original");
    store.close();
    const previous = new DatabaseSync(path);
    previous.exec(
      "DROP TABLE submission_presentation; DROP TABLE model_picker_preferences; DROP TABLE native_session_index; ALTER TABLE desktop DROP COLUMN notification_system; ALTER TABLE desktop DROP COLUMN notification_completion; PRAGMA user_version=5",
    );
    previous.close();
    rmSync(`${path}.before-v6`);
    mkdirSync(`${path}.before-v6`);
    expect(() => openStorage(path)).toThrow();
    const retained = new DatabaseSync(path, { readOnly: true });
    try {
      expect(retained.prepare("PRAGMA user_version").get()?.user_version).toBe(
        5,
      );
      expect(
        retained
          .prepare("SELECT body FROM thread WHERE id=?")
          .get(draft.threadId)?.body,
      ).toBe("precious-original");
    } finally {
      retained.close();
    }
  }));

it("backs up schema 9 before typed references and fences older readers without rewriting drafts", () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-reference-format-"));
  const path = join(root, "app.sqlite");
  const initial = openStorage(path);
  const draft = initial.drafts.create(root);
  initial.drafts.save(draft.threadId, 0, "old file reference remains");
  initial.close();
  const previous = new DatabaseSync(path);
  previous.exec(
    "DROP TABLE submission_presentation; DROP TABLE model_picker_preferences; DROP TABLE native_session_index; ALTER TABLE desktop DROP COLUMN notification_system; ALTER TABLE desktop DROP COLUMN notification_completion; PRAGMA user_version=9",
  );
  previous.close();
  const migrated = openStorage(path);
  try {
    expect(
      migrated.database.connection.prepare("PRAGMA user_version").get()
        ?.user_version,
    ).toBe(14);
    expect(migrated.drafts.active()?.text).toBe("old file reference remains");
    const backup = new DatabaseSync(`${path}.before-v10`, { readOnly: true });
    try {
      expect(backup.prepare("PRAGMA user_version").get()?.user_version).toBe(9);
    } finally {
      backup.close();
    }
  } finally {
    migrated.close();
    rmSync(root, { recursive: true, force: true });
  }
});
