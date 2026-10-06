import type { AppDatabase } from "../../../platform/main/storage/public";
import type { ThreadRepository } from "../../threads/main/public";
import {
  type Draft,
  type DraftConsumptionWriter,
  type DraftReader,
  DraftSchema,
} from "../contracts/public";
import { readAttachmentTokens } from "../core/public";
export class DraftRepository implements DraftReader, DraftConsumptionWriter {
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
    // workspace_id is the legacy SQLite directory key, mapped at the read boundary.
    const row = this.db
      .prepare(
        `SELECT 1 AS schemaVersion,t.id AS threadId,w.id AS workingDirectoryId,w.directory,t.revision,t.body AS text FROM thread t JOIN workspace w ON w.id=t.workspace_id WHERE t.id=?`,
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
    const save = () => {
      const previous = this.db
        .prepare("SELECT body FROM thread WHERE id=? AND revision=?")
        .get(id, expectedRevision)?.body;
      const result = this.db
        .prepare(
          "UPDATE thread SET body=?,revision=revision+1 WHERE id=? AND revision=?",
        )
        .run(text, id, expectedRevision);
      if (result.changes !== 1) return null;
      // A reference can be added and removed between maintenance passes. Keep
      // its latest durable change in the same transaction as the draft write.
      // Counts remain a scan projection; this timestamp can only delay GC.
      if (
        typeof previous === "string" &&
        previous !== text &&
        (previous.includes("[[dpi-attachment:") ||
          text.includes("[[dpi-attachment:")) &&
        this.db.prepare("PRAGMA user_version").get()?.user_version === 9
      ) {
        const ids = (body: string): Set<string> => {
          const parsed = readAttachmentTokens(body);
          if (parsed.ok) return new Set(parsed.tokens.map((token) => token.id));
          // A malformed marker keeps authority scans conservative. Still retain
          // valid references nearby when correcting that input; validate each
          // fixed-size candidate through the same token grammar.
          return new Set(
            [...body.matchAll(/\[\[dpi-attachment:[^\]]{36}\]\]/g)].flatMap(
              ([candidate]) => {
                const token = readAttachmentTokens(candidate);
                return token.ok ? token.tokens.map((item) => item.id) : [];
              },
            ),
          );
        };
        const before = ids(previous),
          after = ids(text);
        const changed = [...before]
          .filter((value) => !after.has(value))
          .concat([...after].filter((value) => !before.has(value)));
        const adopted = [...after].filter((value) => !before.has(value));
        if (adopted.length) {
          const bind =
            this.db.prepare(`UPDATE input_attachment SET payload=json_set(payload,'$.draftBoundRevision',CAST(? AS INTEGER))
            WHERE id IN (SELECT value FROM json_each(?)) AND thread_id=? AND json_valid(payload)
              AND json_extract(payload,'$.draftBoundRevision') IS NULL`);
          for (let offset = 0; offset < adopted.length; offset += 128)
            bind.run(
              expectedRevision + 1,
              JSON.stringify(adopted.slice(offset, offset + 128)),
              id,
            );
        }
        if (changed.length) {
          const update =
            this.db.prepare(`UPDATE input_content_object SET last_released_at=? WHERE digest IN (
            SELECT CASE WHEN json_valid(payload) THEN json_extract(payload,'$.attachment.inputDigest') END
            FROM input_attachment WHERE id IN (SELECT value FROM json_each(?)) AND thread_id=?
            UNION
            SELECT CASE WHEN json_valid(payload) THEN json_extract(payload,'$.derivedDigest') END
            FROM input_attachment WHERE id IN (SELECT value FROM json_each(?)) AND thread_id=?
          )`);
          const now = Date.now();
          for (let offset = 0; offset < changed.length; offset += 128) {
            const batch = JSON.stringify(changed.slice(offset, offset + 128));
            update.run(now, batch, id, batch, id);
          }
        }
      }
      return expectedRevision + 1;
    };
    return this.db.isTransaction ? save() : this.database.transaction(save);
  }

  consume(threadId: string, revision: number, submissionId: string): void {
    this.db
      .prepare("INSERT INTO draft_consumption VALUES(?,?,?)")
      .run(threadId, revision, submissionId);
  }
}
