import { randomUUID } from "node:crypto";
import { renameSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  type Draft,
  DraftSchema,
  type Preferences,
  PreferencesSchema,
} from "../shared/contracts";

export class DraftStorage {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    try {
      this.db.exec(
        "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=250; PRAGMA synchronous=FULL;",
      );
      const version = this.db
        .prepare("PRAGMA user_version")
        .get()?.user_version;
      if (version !== 0 && version !== 1)
        throw new Error("Unsupported schema version");
      if (version === 0) {
        // SQLite snapshots include committed WAL pages even with old readers.
        // Publish only a completed backup; an interrupted attempt cannot replace it.
        const temporary = `${path}.before-v1.${randomUUID()}.tmp`;
        try {
          this.db.prepare("VACUUM INTO ?").run(temporary);
          renameSync(temporary, `${path}.before-v1`);
        } finally {
          rmSync(temporary, { force: true });
        }
        this.transaction(() => {
          this.db.exec(`
            CREATE TABLE workspace(id TEXT PRIMARY KEY, directory TEXT NOT NULL UNIQUE, execution_trust TEXT NOT NULL CHECK(execution_trust='browse'));
            CREATE TABLE thread(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), revision INTEGER NOT NULL CHECK(revision>=0), body TEXT NOT NULL);
            CREATE TABLE desktop(id INTEGER PRIMARY KEY CHECK(id=1), active_thread TEXT REFERENCES thread(id), theme TEXT NOT NULL, density TEXT NOT NULL);
            INSERT INTO desktop VALUES(1,NULL,'light','normal');
            PRAGMA user_version=1;
          `);
        });
      }
      this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  private transaction<T>(body: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = body();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  preferences(): Preferences {
    return PreferencesSchema.parse(
      this.db.prepare("SELECT theme,density FROM desktop WHERE id=1").get(),
    );
  }
  setPreferences(value: Preferences): void {
    this.db
      .prepare("UPDATE desktop SET theme=?,density=? WHERE id=1")
      .run(value.theme, value.density);
  }
  active(): Draft | null {
    const row = this.db
      .prepare("SELECT active_thread FROM desktop WHERE id=1")
      .get();
    if (!row) throw new Error("Missing desktop metadata");
    if (row.active_thread === null) return null;
    if (typeof row.active_thread !== "string")
      throw new Error("Invalid active thread");
    return this.read(row.active_thread);
  }
  read(id: string): Draft {
    const row = this.db
      .prepare(
        `SELECT 1 AS schemaVersion,t.id AS threadId,w.id AS workspaceId,w.directory,t.revision,t.body AS text FROM thread t JOIN workspace w ON w.id=t.workspace_id WHERE t.id=?`,
      )
      .get(id);
    return DraftSchema.parse(row);
  }
  create(directory: string): Draft {
    return this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO workspace VALUES(?,?,'browse') ON CONFLICT(directory) DO NOTHING",
        )
        .run(randomUUID(), directory);
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO thread SELECT ?,id,0,? FROM workspace WHERE directory=?",
        )
        .run(id, "", directory);
      this.db.prepare("UPDATE desktop SET active_thread=? WHERE id=1").run(id);
      return this.read(id);
    });
  }
  save(id: string, expectedRevision: number, text: string): number | null {
    const result = this.db
      .prepare(
        "UPDATE thread SET body=?,revision=revision+1 WHERE id=? AND revision=?",
      )
      .run(text, id, expectedRevision);
    return result.changes === 1 ? expectedRevision + 1 : null;
  }
  close(): void {
    this.db.close();
  }
}
