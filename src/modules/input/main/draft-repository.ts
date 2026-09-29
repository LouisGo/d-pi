import { type Draft, DraftSchema, type DraftReader } from "../contracts/public";
import type { AppDatabase } from "../../../platform/main/storage/public";
import type { ThreadRepository } from "../../workspace/main/public";
export class DraftRepository implements DraftReader {
  constructor(
    private readonly database: AppDatabase,
    private readonly threads: ThreadRepository,
  ) {}
  private get db() {
    return this.database.connection;
  }
  active(): Draft | null {
    const thread = this.threads.activeThread();
    return thread ? this.read(thread.threadId) : null;
  }
  create(directory: string): Draft {
    return this.read(this.threads.create(directory).threadId);
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
  save(id: string, expectedRevision: number, text: string): number | null {
    const result = this.db
      .prepare(
        "UPDATE thread SET body=?,revision=revision+1 WHERE id=? AND revision=?",
      )
      .run(text, id, expectedRevision);
    return result.changes === 1 ? expectedRevision + 1 : null;
  }
}
