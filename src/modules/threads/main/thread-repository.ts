import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppDatabase } from "../../../platform/main/storage/public";
import {
  type ExecutionGrant,
  ExecutionGrantSchema,
  type NativeSessionBinding,
  NativeSessionBindingSchema,
  type ProjectContext,
  ProjectContextSchema,
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
    if (
      Number(this.db.prepare("PRAGMA user_version").get()?.user_version) >= 16
    )
      return "SELECT t.id AS threadId,w.id AS workingDirectoryId,w.directory,COALESCE(m.title,i.title) AS title,CASE WHEN i.thread_id IS NOT NULL THEN 'cli' END AS origin,m.completed,m.parent_thread_id AS parentThreadId FROM thread t JOIN workspace w ON w.id=t.workspace_id LEFT JOIN native_session_index i ON i.thread_id=t.id LEFT JOIN thread_management m ON m.thread_id=t.id";
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
  listProjects(): ProjectContext[] {
    return this.db
      .prepare(
        "SELECT id AS workingDirectoryId,directory FROM workspace ORDER BY rowid ASC",
      )
      .all()
      .map((row) => ProjectContextSchema.parse(row));
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
    }).parse(
      typeof row === "object" && row !== null && "completed" in row
        ? (() => {
            const { completed, ...rest } = row;
            const parentThreadId =
              "parentThreadId" in rest ? rest.parentThreadId : undefined;
            return {
              ...rest,
              completed: completed === 1,
              parentThreadId:
                typeof parentThreadId === "string" ? parentThreadId : undefined,
            };
          })()
        : row,
    );
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
        if (
          this.db
            .prepare(
              "SELECT thread_id FROM thread_management WHERE native_file=? AND native_id=? AND deletion='deleted'",
            )
            .get(session.path, session.sessionId)
        )
          continue;
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
  beginFork(id: string, parentId: string, binding: NativeSessionBinding): void {
    this.threadContext(parentId);
    this.db
      .prepare(
        "INSERT INTO thread_management(thread_id,parent_thread_id,fork_pending,native_file,native_id) VALUES(?,?,1,?,?)",
      )
      .run(id, parentId, binding.sessionFile, binding.sessionId);
  }
  forgetUnadoptedFork(id: string): void {
    this.db
      .prepare(
        "DELETE FROM thread_management WHERE thread_id=? AND fork_pending=1",
      )
      .run(id);
  }
  pendingForks(): {
    threadId: string;
    parentThreadId: string;
    sessionFile: string;
    sessionId: string;
  }[] {
    return z
      .array(
        z.strictObject({
          threadId: z.string(),
          parentThreadId: z.string(),
          sessionFile: z.string(),
          sessionId: z.string(),
        }),
      )
      .parse(
        this.db
          .prepare(
            "SELECT thread_id AS threadId,parent_thread_id AS parentThreadId,native_file AS sessionFile,native_id AS sessionId FROM thread_management WHERE fork_pending=1",
          )
          .all(),
      );
  }
  createFork(
    directory: string,
    id: string,
    parentId: string,
    binding: NativeSessionBinding,
  ): ThreadContext {
    return this.database.transaction(() => {
      const parent = this.threadContext(parentId);
      if (parent.directory !== directory)
        throw Error("Fork directory mismatch");
      this.db
        .prepare("INSERT INTO thread VALUES(?,?,0,'')")
        .run(id, parent.workingDirectoryId);
      const native = NativeSessionBindingSchema.parse(binding);
      if (native.threadId !== id) throw Error("Fork binding mismatch");
      this.db
        .prepare("INSERT INTO native_session VALUES(?,?,?,?)")
        .run(id, native.configContextId, native.sessionFile, native.sessionId);
      this.setParent(id, parentId);
      this.db
        .prepare(
          "UPDATE thread_management SET fork_pending=0,native_file=NULL,native_id=NULL WHERE thread_id=?",
        )
        .run(id);
      this.select(id);
      return this.threadContext(id);
    });
  }
  rename(id: string, title: string): void {
    this.threadContext(id);
    this.db
      .prepare(
        "INSERT INTO thread_management(thread_id,title) VALUES(?,?) ON CONFLICT(thread_id) DO UPDATE SET title=excluded.title",
      )
      .run(id, title);
  }
  complete(id: string, value: boolean): void {
    this.threadContext(id);
    this.db
      .prepare(
        "INSERT INTO thread_management(thread_id,completed) VALUES(?,?) ON CONFLICT(thread_id) DO UPDATE SET completed=excluded.completed",
      )
      .run(id, Number(value));
  }
  setParent(id: string, parentId: string): void {
    this.threadContext(id);
    this.threadContext(parentId);
    this.db
      .prepare(
        "INSERT INTO thread_management(thread_id,parent_thread_id) VALUES(?,?) ON CONFLICT(thread_id) DO UPDATE SET parent_thread_id=excluded.parent_thread_id",
      )
      .run(id, parentId);
  }
  deletionPending(id: string): boolean {
    return (
      this.db
        .prepare("SELECT deletion FROM thread_management WHERE thread_id=?")
        .get(id)?.deletion === "pending"
    );
  }
  beginDeletion(id: string): void {
    this.threadContext(id);
    const binding = this.nativeSessionBinding(id);
    this.db
      .prepare(
        "INSERT INTO thread_management(thread_id,deletion,native_file,native_id) VALUES(?,'pending',?,?) ON CONFLICT(thread_id) DO UPDATE SET deletion='pending',native_file=excluded.native_file,native_id=excluded.native_id",
      )
      .run(id, binding?.sessionFile ?? null, binding?.sessionId ?? null);
  }
  finishDeletion(id: string): void {
    this.database.transaction(() => {
      if (!this.deletionPending(id)) throw Error("Missing deletion intent");
      this.db
        .prepare("UPDATE desktop SET active_thread=NULL WHERE active_thread=?")
        .run(id);
      this.db
        .prepare("DELETE FROM draft_consumption WHERE thread_id=?")
        .run(id);
      this.db.prepare("DELETE FROM queue_change WHERE thread_id=?").run(id);
      this.db.prepare("DELETE FROM submission WHERE thread_id=?").run(id);
      this.db.prepare("DELETE FROM input_attachment WHERE thread_id=?").run(id);
      this.db
        .prepare("DELETE FROM native_session_index WHERE thread_id=?")
        .run(id);
      this.db.prepare("DELETE FROM native_session WHERE thread_id=?").run(id);
      this.db.prepare("DELETE FROM thread WHERE id=?").run(id);
      this.db
        .prepare(
          "UPDATE thread_management SET title=NULL,completed=0,parent_thread_id=NULL,deletion='deleted' WHERE thread_id=?",
        )
        .run(id);
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
