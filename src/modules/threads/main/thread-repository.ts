import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../../../platform/main/storage/public";
import {
  type ExecutionGrant,
  ExecutionGrantSchema,
  type NativeSessionBinding,
  NativeSessionBindingSchema,
  type ThreadContext,
  ThreadContextSchema,
  type ThreadReader,
} from "../contracts/public";
// Legacy SQLite workspace/workspace_id store shared working-directory identity.
// Alias only at this repository boundary; the physical v1-v5 format stays valid.
export class ThreadRepository implements ThreadReader {
  constructor(private readonly database: AppDatabase) {}
  private get db() {
    return this.database.connection;
  }
  activeThread(): ThreadContext | null {
    const row = this.db
      .prepare("SELECT active_thread FROM desktop WHERE id=1")
      .get();
    if (!row) throw Error("Missing desktop metadata");
    if (row.active_thread === null) return null;
    if (typeof row.active_thread !== "string")
      throw Error("Invalid active thread");
    return this.threadContext(row.active_thread);
  }
  threadContext(id: string): ThreadContext {
    return ThreadContextSchema.parse(
      this.db
        .prepare(
          "SELECT t.id AS threadId,w.id AS workingDirectoryId,w.directory FROM thread t JOIN workspace w ON w.id=t.workspace_id WHERE t.id=?",
        )
        .get(id),
    );
  }
  create(directory: string): ThreadContext {
    return this.database.transaction(() => {
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
      return this.threadContext(id);
    });
  }
  nativeSessionBinding(threadId: string): NativeSessionBinding | null {
    const row = this.db
      .prepare(
        "SELECT thread_id AS threadId,config_context AS configContextId,session_file AS sessionFile,session_id AS sessionId FROM native_session WHERE thread_id=?",
      )
      .get(threadId);
    return row ? NativeSessionBindingSchema.parse(row) : null;
  }
  bindNativeSession(binding: NativeSessionBinding): void {
    this.database.transaction(() => {
      const existing = this.nativeSessionBinding(binding.threadId);
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
  executionGrant(id: string): ExecutionGrant | null {
    const row = this.db
      .prepare(
        "SELECT workspace_id AS workingDirectoryId,directory,device,inode FROM execution_permission WHERE workspace_id=?",
      )
      .get(id);
    return row ? ExecutionGrantSchema.parse(row) : null;
  }
  grantExecution(grant: ExecutionGrant): void {
    this.database.transaction(() => {
      const workingDirectory = this.db
        .prepare("SELECT directory FROM workspace WHERE id=?")
        .get(grant.workingDirectoryId);
      if (workingDirectory?.directory !== grant.directory)
        throw new Error("Directory identity conflict");
      this.db
        .prepare(
          "INSERT INTO execution_permission VALUES(?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET directory=excluded.directory,device=excluded.device,inode=excluded.inode",
        )
        .run(
          grant.workingDirectoryId,
          grant.directory,
          grant.device,
          grant.inode,
        );
    });
  }
  revokeExecution(id: string): void {
    this.db
      .prepare("DELETE FROM execution_permission WHERE workspace_id=?")
      .run(id);
  }
}
