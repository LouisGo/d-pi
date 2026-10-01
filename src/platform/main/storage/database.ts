import { randomUUID } from "node:crypto";
import { renameSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
export class AppDatabase {
  readonly connection: DatabaseSync;
  private readonly path: string;
  private readonly originalVersion: number;
  constructor(path: string) {
    this.path = path;
    this.connection = new DatabaseSync(path);
    try {
      this.connection.exec(
        "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=250; PRAGMA synchronous=FULL;",
      );
      const version = this.connection
        .prepare("PRAGMA user_version")
        .get()?.user_version;
      if (typeof version !== "number")
        throw new Error("Missing schema version");
      this.originalVersion = version;
      if (
        version !== 0 &&
        version !== 1 &&
        version !== 2 &&
        version !== 3 &&
        version !== 4 &&
        version !== 5 &&
        version !== 6
      )
        throw new Error("Unsupported schema version");
      if (version === 0) {
        // SQLite snapshots include committed WAL pages even with old readers.
        // Publish only a completed backup; an interrupted attempt cannot replace it.
        const temporary = `${path}.before-v1.${randomUUID()}.tmp`;
        try {
          this.connection.prepare("VACUUM INTO ?").run(temporary);
          renameSync(temporary, `${path}.before-v1`);
        } finally {
          rmSync(temporary, { force: true });
        }
        this.transaction(() => {
          this.connection.exec(`
            CREATE TABLE workspace(id TEXT PRIMARY KEY, directory TEXT NOT NULL UNIQUE, execution_trust TEXT NOT NULL CHECK(execution_trust='browse'));
            CREATE TABLE thread(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), revision INTEGER NOT NULL CHECK(revision>=0), body TEXT NOT NULL);
            CREATE TABLE desktop(id INTEGER PRIMARY KEY CHECK(id=1), active_thread TEXT REFERENCES thread(id), theme TEXT NOT NULL, density TEXT NOT NULL);
            INSERT INTO desktop VALUES(1,NULL,'light','normal');
            PRAGMA user_version=1;
          `);
        });
      }
      if (version === 0 || version === 1) {
        const temporary = `${path}.before-v2.${randomUUID()}.tmp`;
        try {
          this.connection.prepare("VACUUM INTO ?").run(temporary);
          renameSync(temporary, `${path}.before-v2`);
        } finally {
          rmSync(temporary, { force: true });
        }
        this.transaction(() => {
          this.connection.exec(`
            CREATE TABLE submission(id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES thread(id), receipt TEXT NOT NULL);
            CREATE TABLE draft_consumption(thread_id TEXT NOT NULL REFERENCES thread(id), revision INTEGER NOT NULL CHECK(revision>=0), submission_id TEXT NOT NULL REFERENCES submission(id), PRIMARY KEY(thread_id,revision));
            PRAGMA user_version=2;
          `);
        });
      }
      if (version !== 3 && version !== 4 && version !== 5 && version !== 6) {
        const temporary = `${path}.before-v3.${randomUUID()}.tmp`;
        try {
          this.connection.prepare("VACUUM INTO ?").run(temporary);
          renameSync(temporary, `${path}.before-v3`);
        } finally {
          rmSync(temporary, { force: true });
        }
        this.transaction(() => {
          this.connection.exec(`
            CREATE TABLE execution_permission(workspace_id TEXT PRIMARY KEY REFERENCES workspace(id), directory TEXT NOT NULL, device TEXT NOT NULL, inode TEXT NOT NULL);
            CREATE TABLE native_session(thread_id TEXT PRIMARY KEY REFERENCES thread(id), config_context TEXT NOT NULL, session_file TEXT NOT NULL, session_id TEXT NOT NULL);
            PRAGMA user_version=3;
          `);
        });
      }
      this.connection.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    } catch (error) {
      this.connection.close();
      throw error;
    }
  }
  /**
   * Complete the post-recovery schema steps. AppStorage calls this only after
   * execution has explicitly normalized interrupted receipts, preserving the
   * historical open -> v3 -> WAL -> recovery -> v4/v5/v6 -> publish order.
   */
  completeSchemaMigrations(): void {
    if (
      this.originalVersion !== 4 &&
      this.originalVersion !== 5 &&
      this.originalVersion !== 6
    ) {
      const temporary = `${this.path}.before-v4.${randomUUID()}.tmp`;
      try {
        this.connection.prepare("VACUUM INTO ?").run(temporary);
        renameSync(temporary, `${this.path}.before-v4`);
      } finally {
        rmSync(temporary, { force: true });
      }
      this.transaction(() =>
        this.connection.exec(
          "ALTER TABLE desktop ADD COLUMN send_key TEXT; PRAGMA user_version=4;",
        ),
      );
    }
    if (this.originalVersion !== 5 && this.originalVersion !== 6) {
      const temporary = `${this.path}.before-v5.${randomUUID()}.tmp`;
      try {
        this.connection.prepare("VACUUM INTO ?").run(temporary);
        renameSync(temporary, `${this.path}.before-v5`);
      } finally {
        rmSync(temporary, { force: true });
      }
      this.transaction(() =>
        this.connection.exec(
          "ALTER TABLE desktop ADD COLUMN locale TEXT NOT NULL DEFAULT 'system' CHECK(locale IN ('system','en-US','zh-CN')); PRAGMA user_version=5;",
        ),
      );
    }
    if (this.originalVersion !== 6) {
      const temporary = `${this.path}.before-v6.${randomUUID()}.tmp`;
      try {
        this.connection.prepare("VACUUM INTO ?").run(temporary);
        renameSync(temporary, `${this.path}.before-v6`);
      } finally {
        rmSync(temporary, { force: true });
      }
      // Receipts remain the finite App-owned fact; no native event/history ledger.
      // The version guard prevents an older App silently dropping new outcomes.
      this.transaction(() => this.connection.exec("PRAGMA user_version=6;"));
    }
  }
  transaction<T>(body: () => T): T {
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const value = body();
      this.connection.exec("COMMIT");
      return value;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }
  close(): void {
    this.connection.close();
  }
}
