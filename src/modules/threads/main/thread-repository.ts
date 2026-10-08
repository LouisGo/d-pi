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
  private get indexedSchema(): boolean {
    return (
      Number(this.db.prepare("PRAGMA user_version").get()?.user_version) >= 12
    );
  }
  private get contextQuery(): string {
    return this.indexedSchema
      ? "SELECT t.id AS threadId,w.id AS workingDirectoryId,w.directory,i.title,CASE WHEN i.thread_id IS NOT NULL THEN 'cli' END AS origin FROM thread t JOIN workspace w ON w.id=t.workspace_id LEFT JOIN native_session_index i ON i.thread_id=t.id"
      : "SELECT t.id AS threadId,w.id AS workingDirectoryId,w.directory,NULL AS title,NULL AS origin FROM thread t JOIN workspace w ON w.id=t.workspace_id";
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
    return this.parseContext(
      this.db.prepare(`${this.contextQuery} WHERE t.id=?`).get(id),
    );
  }
  list(): ThreadContext[] {
    return this.db
      .prepare(`${this.contextQuery} ORDER BY t.rowid DESC`)
      .all()
      .map((row) => this.parseContext(row));
  }
  private parseContext(row: unknown): ThreadContext {
    const parsed = ThreadContextSchema.extend({
      title: ThreadContextSchema.shape.title.nullable(),
      origin: ThreadContextSchema.shape.origin.nullable(),
    }).parse(row);
    const { title, origin, ...context } = parsed;
    return {
      ...context,
      ...(title !== null && title !== undefined ? { title } : {}),
      ...(origin ? { origin } : {}),
    };
  }
  select(threadId: string): void {
    this.threadContext(threadId);
    this.db
      .prepare("UPDATE desktop SET active_thread=? WHERE id=1")
      .run(threadId);
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
        this.indexedSchema
          ? "SELECT n.thread_id AS threadId,n.config_context AS configContextId,n.session_file AS sessionFile,n.session_id AS sessionId,i.history_root AS historyRoot, CASE WHEN i.thread_id IS NOT NULL THEN 'cli' END AS origin FROM native_session n LEFT JOIN native_session_index i ON i.thread_id=n.thread_id WHERE n.thread_id=?"
          : "SELECT thread_id AS threadId,config_context AS configContextId,session_file AS sessionFile,session_id AS sessionId,NULL AS historyRoot,NULL AS origin FROM native_session WHERE thread_id=?",
      )
      .get(threadId);
    if (!row) return null;
    const parsed = NativeSessionBindingSchema.extend({
      historyRoot: NativeSessionBindingSchema.shape.historyRoot.nullable(),
      origin: NativeSessionBindingSchema.shape.origin.nullable(),
    }).parse(row);
    const { historyRoot, origin, ...binding } = parsed;
    return {
      ...binding,
      ...(historyRoot ? { historyRoot } : {}),
      ...(origin ? { origin } : {}),
    };
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
  reconcileNativeSessions(
    sessions: readonly {
      directory: string;
      path: string;
      sessionId: string;
      historyRoot: string;
      title: string;
      modifiedAt: number;
      key: string;
    }[],
  ): void {
    this.database.transaction(() => {
      let newest: string | null = null;
      const bindings = new Map(
        this.db
          .prepare(
            "SELECT thread_id,session_file,session_id FROM native_session",
          )
          .all()
          .map((row) => [
            JSON.stringify([row.session_file, row.session_id]),
            row.thread_id,
          ]),
      );
      for (const session of sessions) {
        const identity = JSON.stringify([session.path, session.sessionId]);
        const existing = bindings.get(identity);
        if (typeof existing === "string") {
          this.db
            .prepare(
              "UPDATE native_session_index SET title=?,modified_at=? WHERE thread_id=? AND history_root=?",
            )
            .run(
              session.title,
              session.modifiedAt,
              existing,
              session.historyRoot,
            );
          newest ??= existing;
          continue;
        }
        this.db
          .prepare(
            "INSERT INTO workspace VALUES(?,?,'browse') ON CONFLICT(directory) DO NOTHING",
          )
          .run(randomUUID(), session.directory);
        const id = randomUUID();
        this.db
          .prepare(
            "INSERT INTO thread SELECT ?,id,0,'' FROM workspace WHERE directory=?",
          )
          .run(id, session.directory);
        this.db
          .prepare("INSERT INTO native_session VALUES(?,?,?,?)")
          .run(id, session.key, session.path, session.sessionId);
        this.db
          .prepare("INSERT INTO native_session_index VALUES(?,?,?,?)")
          .run(id, session.historyRoot, session.title, session.modifiedAt);
        bindings.set(identity, id);
        newest ??= id;
      }
      if (newest)
        this.db
          .prepare(
            "UPDATE desktop SET active_thread=? WHERE id=1 AND active_thread IS NULL",
          )
          .run(newest);
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
