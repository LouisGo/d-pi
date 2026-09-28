import { randomUUID } from "node:crypto";
import { renameSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  type RuntimeGrant,
  RuntimeGrantSchema,
} from "../features/runtime/admission";
import {
  type NativeBinding,
  NativeBindingSchema,
} from "../features/runtime/host-contracts";
import {
  type FrozenSubmission,
  SubmissionConflict,
  type SubmissionReceipt,
  SubmissionReceiptSchema,
} from "../features/submission/contracts";
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
      if (
        version !== 0 &&
        version !== 1 &&
        version !== 2 &&
        version !== 3 &&
        version !== 4
      )
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
      if (version === 0 || version === 1) {
        const temporary = `${path}.before-v2.${randomUUID()}.tmp`;
        try {
          this.db.prepare("VACUUM INTO ?").run(temporary);
          renameSync(temporary, `${path}.before-v2`);
        } finally {
          rmSync(temporary, { force: true });
        }
        this.transaction(() => {
          this.db.exec(`
            CREATE TABLE submission(id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES thread(id), receipt TEXT NOT NULL);
            CREATE TABLE draft_consumption(thread_id TEXT NOT NULL REFERENCES thread(id), revision INTEGER NOT NULL CHECK(revision>=0), submission_id TEXT NOT NULL REFERENCES submission(id), PRIMARY KEY(thread_id,revision));
            PRAGMA user_version=2;
          `);
        });
      }
      if (version !== 3 && version !== 4) {
        const temporary = `${path}.before-v3.${randomUUID()}.tmp`;
        try {
          this.db.prepare("VACUUM INTO ?").run(temporary);
          renameSync(temporary, `${path}.before-v3`);
        } finally {
          rmSync(temporary, { force: true });
        }
        this.transaction(() => {
          this.db.exec(`
            CREATE TABLE execution_permission(workspace_id TEXT PRIMARY KEY REFERENCES workspace(id), directory TEXT NOT NULL, device TEXT NOT NULL, inode TEXT NOT NULL);
            CREATE TABLE native_session(thread_id TEXT PRIMARY KEY REFERENCES thread(id), config_context TEXT NOT NULL, session_file TEXT NOT NULL, session_id TEXT NOT NULL);
            PRAGMA user_version=3;
          `);
        });
      }
      this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
      this.db
        .prepare(
          "UPDATE submission SET receipt=json_set(receipt,'$.state','unknown','$.outcome','unknown','$.updatedAt',?) WHERE json_extract(receipt,'$.state')='dispatching'",
        )
        .run(new Date().toISOString());
      if (version !== 4) {
        const temporary = `${path}.before-v4.${randomUUID()}.tmp`;
        try {
          this.db.prepare("VACUUM INTO ?").run(temporary);
          renameSync(temporary, `${path}.before-v4`);
        } finally {
          rmSync(temporary, { force: true });
        }
        this.transaction(() =>
          this.db.exec(
            "ALTER TABLE desktop ADD COLUMN send_key TEXT; PRAGMA user_version=4;",
          ),
        );
      }
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
    return PreferencesSchema.parse(this.preferenceRow());
  }
  private preferenceRow() {
    const row = this.db
      .prepare(
        "SELECT theme,density,send_key AS sendKey FROM desktop WHERE id=1",
      )
      .get();
    return row ? { ...row, sendKey: row.sendKey ?? undefined } : row;
  }
  setPreferences(value: Preferences): void {
    this.db
      .prepare("UPDATE desktop SET theme=?,density=?,send_key=? WHERE id=1")
      .run(value.theme, value.density, value.sendKey ?? null);
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
    const draft = DraftSchema.parse(row);
    const consumed = this.db
      .prepare(
        "SELECT submission_id FROM draft_consumption WHERE thread_id=? AND revision=?",
      )
      .get(id, draft.revision);
    return consumed
      ? DraftSchema.parse({
          ...draft,
          text: "",
          consumedBy: consumed.submission_id,
        })
      : draft;
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
  prepareSubmission(value: FrozenSubmission): SubmissionReceipt {
    return this.transaction(() => {
      const existing = this.submission(value.submissionId);
      if (existing) {
        // Identity reuse cannot replace the frozen content or route it elsewhere.
        if (
          existing.threadId !== value.threadId ||
          existing.traceId !== value.traceId ||
          existing.revision !== value.revision ||
          existing.text !== value.text ||
          existing.requestId !== value.requestId ||
          existing.target.processInstanceId !==
            value.target.processInstanceId ||
          existing.target.connectionGeneration !==
            value.target.connectionGeneration ||
          existing.target.configContextId !== value.target.configContextId ||
          existing.target.nativeSessionRef !== value.target.nativeSessionRef
        )
          throw new SubmissionConflict("Submission identity conflict");
        return existing;
      }
      const sameRevision = this.db
        .prepare(
          "SELECT id FROM submission WHERE thread_id=? AND json_extract(receipt, '$.revision')=? LIMIT 1",
        )
        .get(value.threadId, value.revision);
      if (sameRevision) throw new SubmissionConflict("Revision already frozen");
      const draft = this.read(value.threadId);
      if (
        draft.revision !== value.revision ||
        draft.text !== value.text ||
        draft.consumedBy
      )
        throw new SubmissionConflict("Submission draft revision conflict");
      const now = new Date().toISOString();
      const receipt: SubmissionReceipt = {
        ...value,
        state: "prepared",
        acknowledgedAt: null,
        outcome: "unobserved",
        createdAt: now,
        updatedAt: now,
      };
      this.db
        .prepare("INSERT INTO submission VALUES(?,?,?)")
        .run(value.submissionId, value.threadId, JSON.stringify(receipt));
      return receipt;
    });
  }
  dispatchSubmission(id: string): boolean {
    return this.transaction(() => {
      const receipt = this.submission(id);
      if (!receipt || receipt.state !== "prepared") return false;
      this.writeReceipt({ ...receipt, state: "dispatching" });
      return true;
    });
  }
  acknowledgeSubmission(id: string): boolean {
    return this.transaction(() => {
      const receipt = this.submission(id);
      if (!receipt) return false;
      if (receipt.state === "acknowledged") return true;
      if (receipt.state !== "dispatching" && receipt.state !== "unknown")
        return false;
      this.writeReceipt({
        ...receipt,
        state: "acknowledged",
        acknowledgedAt: new Date().toISOString(),
      });
      this.db
        .prepare("INSERT INTO draft_consumption VALUES(?,?,?)")
        .run(receipt.threadId, receipt.revision, receipt.submissionId);
      return true;
    });
  }
  submission(id: string): SubmissionReceipt | null {
    const row = this.db
      .prepare("SELECT receipt FROM submission WHERE id=?")
      .get(id);
    if (!row) return null;
    if (typeof row.receipt !== "string")
      throw new Error("Invalid submission receipt");
    return SubmissionReceiptSchema.parse(JSON.parse(row.receipt));
  }
  submissions(threadId: string): SubmissionReceipt[] {
    return this.db
      .prepare(
        "SELECT receipt FROM submission WHERE thread_id=? ORDER BY rowid DESC LIMIT 100",
      )
      .all(threadId)
      .map((row) =>
        SubmissionReceiptSchema.parse(JSON.parse(String(row.receipt))),
      );
  }
  private writeReceipt(receipt: SubmissionReceipt): void {
    this.db
      .prepare("UPDATE submission SET receipt=? WHERE id=?")
      .run(
        JSON.stringify({ ...receipt, updatedAt: new Date().toISOString() }),
        receipt.submissionId,
      );
  }
  unknownSubmission(id: string): void {
    this.transaction(() => {
      const receipt = this.submission(id);
      if (!receipt || receipt.state === "prepared") return;
      this.writeReceipt({
        ...receipt,
        state: receipt.state === "acknowledged" ? "acknowledged" : "unknown",
        outcome: receipt.outcome === "failed" ? "failed" : "unknown",
      });
    });
  }
  failSubmission(id: string): void {
    this.transaction(() => {
      const receipt = this.submission(id);
      if (!receipt || receipt.state === "prepared") return;
      this.writeReceipt({
        ...receipt,
        state: receipt.state === "acknowledged" ? "acknowledged" : "unknown",
        outcome: "failed",
      });
    });
  }
  nativeSession(threadId: string): NativeBinding | null {
    const row = this.db
      .prepare(
        "SELECT thread_id AS threadId,config_context AS configContextId,session_file AS sessionFile,session_id AS sessionId FROM native_session WHERE thread_id=?",
      )
      .get(threadId);
    return row ? NativeBindingSchema.parse(row) : null;
  }
  bindNativeSession(binding: NativeBinding): void {
    this.transaction(() => {
      const existing = this.nativeSession(binding.threadId);
      if (existing) {
        if (
          existing.configContextId !== binding.configContextId ||
          existing.sessionId !== binding.sessionId ||
          existing.sessionFile !== binding.sessionFile
        )
          throw new Error("Native session identity conflict");
        return;
      }
      this.db
        .prepare("INSERT INTO native_session VALUES(?,?,?,?)")
        .run(
          binding.threadId,
          binding.configContextId,
          binding.sessionFile,
          binding.sessionId,
        );
    });
  }
  executionGrant(id: string): RuntimeGrant | null {
    const row = this.db
      .prepare(
        "SELECT workspace_id AS workspaceId,directory,device,inode FROM execution_permission WHERE workspace_id=?",
      )
      .get(id);
    return row ? RuntimeGrantSchema.parse(row) : null;
  }
  grantExecution(grant: RuntimeGrant): void {
    this.transaction(() => {
      const workspace = this.db
        .prepare("SELECT directory FROM workspace WHERE id=?")
        .get(grant.workspaceId);
      if (workspace?.directory !== grant.directory)
        throw new Error("Directory identity conflict");
      this.db
        .prepare(
          "INSERT INTO execution_permission VALUES(?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET directory=excluded.directory,device=excluded.device,inode=excluded.inode",
        )
        .run(grant.workspaceId, grant.directory, grant.device, grant.inode);
    });
  }
  revokeExecution(id: string): void {
    this.db
      .prepare("DELETE FROM execution_permission WHERE workspace_id=?")
      .run(id);
  }
  close(): void {
    this.db.close();
  }
}
