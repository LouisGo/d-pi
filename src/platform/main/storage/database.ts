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
        version !== 6 &&
        version !== 7 &&
        version !== 8 &&
        version !== 9 &&
        version !== 10 &&
        version !== 11 &&
        version !== 12 &&
        version !== 13 &&
        version !== 14 &&
        version !== 15 &&
        version !== 16
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
      if (
        version !== 3 &&
        version !== 4 &&
        version !== 5 &&
        version !== 6 &&
        version !== 7 &&
        version !== 8 &&
        version !== 9 &&
        version !== 10 &&
        version !== 11 &&
        version !== 12 &&
        version !== 13 &&
        version !== 14 &&
        version !== 15 &&
        version !== 16
      ) {
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
      this.originalVersion !== 6 &&
      this.originalVersion !== 7 &&
      this.originalVersion !== 8 &&
      this.originalVersion !== 9 &&
      this.originalVersion !== 10 &&
      this.originalVersion !== 11 &&
      this.originalVersion !== 12 &&
      this.originalVersion !== 13 &&
      this.originalVersion !== 14 &&
      this.originalVersion !== 15 &&
      this.originalVersion !== 16
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
    if (
      this.originalVersion !== 5 &&
      this.originalVersion !== 6 &&
      this.originalVersion !== 7 &&
      this.originalVersion !== 8 &&
      this.originalVersion !== 9 &&
      this.originalVersion !== 10 &&
      this.originalVersion !== 11 &&
      this.originalVersion !== 12 &&
      this.originalVersion !== 13 &&
      this.originalVersion !== 14 &&
      this.originalVersion !== 15 &&
      this.originalVersion !== 16
    ) {
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
    if (
      this.originalVersion !== 6 &&
      this.originalVersion !== 7 &&
      this.originalVersion !== 8 &&
      this.originalVersion !== 9 &&
      this.originalVersion !== 10 &&
      this.originalVersion !== 11 &&
      this.originalVersion !== 12 &&
      this.originalVersion !== 13 &&
      this.originalVersion !== 14 &&
      this.originalVersion !== 15 &&
      this.originalVersion !== 16
    ) {
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
    if (
      this.originalVersion !== 7 &&
      this.originalVersion !== 8 &&
      this.originalVersion !== 9 &&
      this.originalVersion !== 10 &&
      this.originalVersion !== 11 &&
      this.originalVersion !== 12 &&
      this.originalVersion !== 13 &&
      this.originalVersion !== 14 &&
      this.originalVersion !== 15 &&
      this.originalVersion !== 16
    ) {
      const temporary = `${this.path}.before-v7.${randomUUID()}.tmp`;
      try {
        this.connection.prepare("VACUUM INTO ?").run(temporary);
        renameSync(temporary, `${this.path}.before-v7`);
      } finally {
        rmSync(temporary, { force: true });
      }
      this.transaction(() =>
        this.connection.exec(`
        CREATE TABLE queue_change(id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES thread(id), record TEXT NOT NULL);
        PRAGMA user_version=7;
      `),
      );
    }
    this.migrateAttachments();
    this.migrateContentLifecycle();
    this.migrateReferenceKinds();
    this.migrateNotificationPreferences();
    this.migrateNativeSessionIndex();
    this.migrateModelPickerPreferences();
    this.migrateSubmissionPresentationIndex();
    this.migrateSidebarPreferences();
    this.migrateThreadManagement();
  }
  private migrateAttachments(): void {
    if (this.originalVersion >= 8) return;
    const temporary = `${this.path}.before-v8.${randomUUID()}.tmp`;
    try {
      this.connection.prepare("VACUUM INTO ?").run(temporary);
      renameSync(temporary, `${this.path}.before-v8`);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.transaction(() =>
      this.connection.exec(`
      CREATE TABLE input_attachment(id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES thread(id), payload TEXT NOT NULL);
      PRAGMA user_version=8;
    `),
    );
  }

  private migrateContentLifecycle(): void {
    if (this.originalVersion >= 9) return;
    const temporary = `${this.path}.before-v9.${randomUUID()}.tmp`;
    try {
      this.connection.prepare("VACUUM INTO ?").run(temporary);
      renameSync(temporary, `${this.path}.before-v9`);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.transaction(() =>
      this.connection.exec(`
      CREATE TABLE input_content_object(
        digest TEXT PRIMARY KEY,
        byte_length INTEGER NOT NULL CHECK(byte_length>=0),
        reference_count INTEGER NOT NULL DEFAULT 0 CHECK(reference_count>=0),
        last_released_at INTEGER,
        state TEXT NOT NULL DEFAULT 'available' CHECK(state IN ('available','deleting','deleted')),
        problem TEXT CHECK(problem IN ('content-missing','content-corrupt','storage-unavailable')),
        checked_at INTEGER
      );
      CREATE INDEX input_attachment_original_digest ON input_attachment(CASE WHEN json_valid(payload) THEN json_extract(payload,'$.attachment.inputDigest') END);
      CREATE INDEX input_attachment_derived_digest ON input_attachment(CASE WHEN json_valid(payload) THEN json_extract(payload,'$.derivedDigest') END);
      CREATE TABLE input_content_epoch(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,manifest_revision INTEGER NOT NULL);
      INSERT INTO input_content_epoch VALUES(1,0,0);
      ${[
        "thread",
        "draft_consumption",
        "submission",
        "queue_change",
        "input_attachment",
      ]
        .flatMap((table) =>
          ["INSERT", "UPDATE", "DELETE"].map(
            (operation) =>
              `CREATE TRIGGER input_epoch_${table}_${operation.toLowerCase()} AFTER ${operation} ON ${table} BEGIN UPDATE input_content_epoch SET revision=revision+1${table === "input_attachment" ? ",manifest_revision=manifest_revision+1" : ""} WHERE id=1; END;`,
          ),
        )
        .join("\n")}
      PRAGMA user_version=9;
    `),
    );
  }

  private migrateReferenceKinds(): void {
    if (this.originalVersion >= 10) return;
    const temporary = `${this.path}.before-v10.${randomUUID()}.tmp`;
    try {
      this.connection.prepare("VACUUM INTO ?").run(temporary);
      renameSync(temporary, `${this.path}.before-v10`);
    } finally {
      rmSync(temporary, { force: true });
    }
    // Typed reference metadata changes persisted JSON contracts. Fence old
    // strict readers before writing it; legacy records remain valid as files.
    this.transaction(() => this.connection.exec("PRAGMA user_version=10;"));
  }

  private migrateNotificationPreferences(): void {
    if (this.originalVersion >= 11) return;
    const temporary = `${this.path}.before-v11.${randomUUID()}.tmp`;
    try {
      this.connection.prepare("VACUUM INTO ?").run(temporary);
      renameSync(temporary, `${this.path}.before-v11`);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.transaction(() =>
      this.connection.exec(`
      ALTER TABLE desktop ADD COLUMN notification_system INTEGER NOT NULL DEFAULT 0 CHECK(notification_system IN (0,1));
      ALTER TABLE desktop ADD COLUMN notification_completion INTEGER NOT NULL DEFAULT 0 CHECK(notification_completion IN (0,1));
      PRAGMA user_version=11;
    `),
    );
  }

  private migrateNativeSessionIndex(): void {
    if (this.originalVersion >= 12) return;
    const temporary = `${this.path}.before-v12.${randomUUID()}.tmp`;
    try {
      this.connection.prepare("VACUUM INTO ?").run(temporary);
      renameSync(temporary, `${this.path}.before-v12`);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.transaction(() =>
      this.connection.exec(`
      CREATE TABLE native_session_index(
        thread_id TEXT PRIMARY KEY REFERENCES thread(id),
        history_root TEXT NOT NULL,
        title TEXT NOT NULL,
        modified_at REAL NOT NULL
      );
      PRAGMA user_version=12;
    `),
    );
  }

  private migrateModelPickerPreferences(): void {
    if (this.originalVersion >= 13) return;
    const temporary = `${this.path}.before-v13.${randomUUID()}.tmp`;
    try {
      this.connection.prepare("VACUUM INTO ?").run(temporary);
      renameSync(temporary, `${this.path}.before-v13`);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.transaction(() =>
      this.connection.exec(`
      CREATE TABLE model_picker_preferences(
        id INTEGER PRIMARY KEY CHECK(id=1),
        payload TEXT NOT NULL CHECK(json_valid(payload))
      );
      PRAGMA user_version=13;
    `),
    );
  }

  private migrateSubmissionPresentationIndex(): void {
    if (this.originalVersion >= 14) return;
    const temporary = `${this.path}.before-v14.${randomUUID()}.tmp`;
    try {
      this.connection.prepare("VACUUM INTO ?").run(temporary);
      renameSync(temporary, `${this.path}.before-v14`);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.transaction(() =>
      this.connection.exec(`
      CREATE TABLE submission_presentation(
        submission_id TEXT PRIMARY KEY REFERENCES submission(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL,
        native_session_ref TEXT NOT NULL,
        config_context_id TEXT NOT NULL,
        message_digest TEXT CHECK(message_digest IS NULL OR length(message_digest)=64)
      );
      CREATE INDEX submission_presentation_lookup ON submission_presentation(
        thread_id, native_session_ref, config_context_id, message_digest
      );
      PRAGMA user_version=14;
    `),
    );
  }

  private migrateSidebarPreferences(): void {
    if (this.originalVersion >= 15) return;
    const temporary = `${this.path}.before-v15.${randomUUID()}.tmp`;
    try {
      this.connection.prepare("VACUUM INTO ?").run(temporary);
      renameSync(temporary, `${this.path}.before-v15`);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.transaction(() =>
      this.connection.exec(`
      CREATE TABLE sidebar_preferences(
        id INTEGER PRIMARY KEY CHECK(id=1),
        revision INTEGER NOT NULL CHECK(revision>=0),
        payload TEXT NOT NULL CHECK(json_valid(payload))
      );
      PRAGMA user_version=15;
    `),
    );
  }

  private migrateThreadManagement(): void {
    if (this.originalVersion >= 16) return;
    const temporary = `${this.path}.before-v16.${randomUUID()}.tmp`;
    try {
      this.connection.prepare("VACUUM INTO ?").run(temporary);
      renameSync(temporary, `${this.path}.before-v16`);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.transaction(() =>
      this.connection.exec(`
      CREATE TABLE thread_management(
        thread_id TEXT PRIMARY KEY,
        title TEXT,
        completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
        parent_thread_id TEXT,
        fork_pending INTEGER NOT NULL DEFAULT 0 CHECK(fork_pending IN (0,1)),
        deletion TEXT CHECK(deletion IN ('pending','deleted')),
        native_file TEXT,
        native_id TEXT
      );
      PRAGMA user_version=16;
    `),
    );
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
