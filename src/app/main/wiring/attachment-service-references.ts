import {
  QueueChangeSchema,
  SubmissionReceiptSchema,
} from "../../../modules/execution/contracts/public";
import { readDraftAttachmentTokens } from "../../../modules/input/core/public";
import type {
  AttachmentReferenceQuery,
  AttachmentReferenceReader,
  AttachmentReferences,
  AttachmentSource,
} from "../../../modules/input/main/public";
import type { AppStorage } from "./app-storage";
/** A bounded read projection; no execution state or original receipt is written. */
export function createAttachmentReferences(
  storage: AppStorage,
  source: (threadId: string, id: string) => AttachmentSource | null,
): AttachmentReferenceReader {
  const db = storage.database.connection;
  const version = () =>
    Number(
      db.prepare("SELECT revision FROM input_content_epoch WHERE id=1").get()
        ?.revision,
    );
  let progress:
    | {
        key: string;
        version: number;
        table: 0 | 1 | 2 | 3 | 4;
        cursor: number;
        counts: Map<string, number>;
        durable: Set<string>;
        frozen: Set<string>;
        sources: AttachmentReferences["sources"];
        sourcesTruncated: boolean;
      }
    | undefined;
  async function read(
    query: AttachmentReferenceQuery,
  ): Promise<AttachmentReferences> {
    const key = JSON.stringify(query),
      epoch = version();
    if (!progress || progress.key !== key || progress.version !== epoch)
      progress = {
        key,
        version: epoch,
        table: 0,
        cursor: 0,
        counts: new Map(),
        durable: new Set(),
        frozen: new Set(),
        sources: [],
        sourcesTruncated: false,
      };
    const state = progress,
      digests = new Set(query.digests),
      pending = new Set(
        query.attachmentIds.map((ref) => `${ref.threadId}:${ref.id}`),
      );
    let visited = 0,
      readBytes = 0;
    scan: while (
      state.table < 3 &&
      visited < 128 &&
      readBytes < 4 * 1024 * 1024
    ) {
      const table =
        state.table === 0
          ? "thread"
          : state.table === 1
            ? "submission"
            : "queue_change";
      const payload =
        state.table === 0 ? "body" : state.table === 1 ? "receipt" : "record";
      const rows = db
        .prepare(
          `SELECT rowid,id,${state.table === 0 ? "id AS thread_id" : "thread_id"},CASE WHEN length(CAST(${payload} AS BLOB))<=2097152 THEN ${payload} END AS value FROM ${table} WHERE rowid>? ${state.table === 0 ? "AND NOT EXISTS(SELECT 1 FROM draft_consumption d WHERE d.thread_id=thread.id AND d.revision=thread.revision)" : ""} ORDER BY rowid LIMIT 9`,
        )
        .all(state.cursor);
      if (!rows.length) {
        state.table = (state.table + 1) as 1 | 2 | 3;
        state.cursor = 0;
        continue;
      }
      for (const row of rows.slice(0, 8)) {
        if (visited >= 128 || readBytes >= 4 * 1024 * 1024) break;
        if (typeof row.value !== "string")
          throw Error("Attachment owner record exceeds safe size");
        const bytes = Buffer.byteLength(row.value);
        if (visited > 0 && readBytes + bytes > 4 * 1024 * 1024) break scan;
        const owned = new Map<string, Set<string>>();
        const add = (hash: string | undefined, id: string) => {
          if (!hash || !digests.has(hash)) return;
          const owners = owned.get(hash) ?? new Set<string>();
          owners.add(id);
          owned.set(hash, owners);
        };
        const attach = (threadId: string, id: string, frozen = false) => {
          if (pending.has(`${threadId}:${id}`))
            state.durable.add(`${threadId}:${id}`);
          const item = source(threadId, id);
          if (item) {
            add(item.inputDigest, id);
            add(item.derivedDigest, id);
          } else if (!frozen) throw Error("Attachment owner source is missing");
        };
        const text = (
          value: string,
          threadId: string,
          frozenIds?: Set<string>,
        ) => {
          const tokens = readDraftAttachmentTokens(value);
          if (!tokens.ok) throw Error("Attachment owner token is invalid");
          for (const token of tokens.tokens)
            attach(threadId, token.id, frozenIds?.has(token.id));
        };
        if (state.table === 0) text(row.value, String(row.thread_id));
        else if (state.table === 1) {
          const receipt = SubmissionReceiptSchema.parse(JSON.parse(row.value));
          if (
            receipt.submissionId !== row.id ||
            receipt.threadId !== row.thread_id
          )
            throw Error("Attachment receipt identity mismatch");
          text(
            receipt.text,
            receipt.threadId,
            new Set(
              receipt.content?.sources.map((item) => item.attachmentId) ?? [],
            ),
          );
          for (const item of receipt.content?.sources ?? []) {
            attach(receipt.threadId, item.attachmentId, true);
            for (const [object, hash] of [
              ["original", item.inputDigest],
              ["derived", item.derivedDigest],
            ] as const) {
              if (!hash || !digests.has(hash)) continue;
              add(hash, item.attachmentId);
              state.frozen.add(hash);
              if (
                query.reportThreadId &&
                receipt.threadId !== query.reportThreadId
              )
                continue;
              if (state.sources.length < 128)
                state.sources.push({
                  digest: hash,
                  attachmentId: item.attachmentId,
                  threadId: receipt.threadId,
                  name: item.name,
                  object,
                });
              else state.sourcesTruncated = true;
            }
          }
        } else {
          const change = QueueChangeSchema.parse(JSON.parse(row.value));
          if (change.traceId !== row.id || change.threadId !== row.thread_id)
            throw Error("Attachment queue identity mismatch");
          text(change.previousText, change.threadId);
          if (
            change.command.action === "save-edit" ||
            change.command.action === "update-edit"
          )
            text(change.command.text, change.threadId);
        }
        for (const [hash, owners] of owned)
          state.counts.set(hash, (state.counts.get(hash) ?? 0) + owners.size);
        state.cursor = Number(row.rowid);
        visited++;
        readBytes += bytes;
      }
      if (rows.length <= 8 && state.cursor === rows.at(-1)?.rowid) {
        state.table = (state.table + 1) as 1 | 2 | 3;
        state.cursor = 0;
      }
    }
    // Adoption is a durable per-source fact, even if a later draft edit removed
    // the token before this scan. Never release another same-digest source.
    while (
      state.table === 3 &&
      state.cursor < query.attachmentIds.length &&
      visited < 128
    ) {
      const ref = query.attachmentIds[state.cursor++];
      if (ref) {
        const item = source(ref.threadId, ref.id);
        if (typeof item?.draftBoundRevision === "number")
          state.durable.add(`${ref.threadId}:${ref.id}`);
      }
      visited++;
    }
    if (state.table === 3 && state.cursor === query.attachmentIds.length)
      state.table = 4;
    if (state.version !== version()) {
      progress = undefined;
      return {
        version: version(),
        complete: false,
        counts: [],
        durableAttachmentIds: [],
        frozenDigests: [],
        sources: [],
        sourcesTruncated: false,
      };
    }
    return {
      version: state.version,
      complete: state.table === 4,
      counts: [...state.counts].map(([digest, count]) => ({ digest, count })),
      durableAttachmentIds: [...state.durable],
      frozenDigests: [...state.frozen],
      sources: state.sources,
      sourcesTruncated: state.sourcesTruncated,
    };
  }
  return { read, version };
}
