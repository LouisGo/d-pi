import { constants } from "node:fs";
import { type FileHandle, open, opendir } from "node:fs/promises";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import {
  type DiagnosticFilter,
  type DiagnosticSnapshot,
  type DiagnosticWriterHealth,
} from "../../../shared/diagnostics";

import { sanitizeDiagnosticRecord } from "./metadata";

/** Sample only persisted Main evidence; neither flush nor acquire the Writer's queue.
 * Tail sampling is bounded to 12 files, 256 directory entries, 8 MiB, 20k lines,
 * 64 KiB per line and a cooperative 1.5s I/O/processing deadline. Directory
 * budget and wall clocks prevent any claim of complete newest history.
 */
export async function readDiagnosticSnapshot(
  directory: string,
  filter: DiagnosticFilter,
  writer: DiagnosticWriterHealth = { degraded: false, dropped: 0 },
): Promise<DiagnosticSnapshot> {
  const snapshot: DiagnosticSnapshot = {
    sampledAt: new Date().toISOString(),
    filter,
    records: [],
    coverage: {
      files: 0,
      bytes: 0,
      lines: 0,
      malformed: 0,
      redacted: 0,
      unreadable: 0,
      truncated: false,
    },
    writer: { ...writer },
  };
  const deadline = performance.now() + 1500;
  const names: string[] = [];
  let listing;
  try {
    listing = await opendir(directory);
  } catch {
    snapshot.coverage.unreadable++;
    return snapshot;
  }
  let entries = 0;
  try {
    while (true) {
      if (entries >= 256 || performance.now() >= deadline) {
        snapshot.coverage.truncated = true;
        break;
      }
      const entry = await listing.read();
      if (!entry) break;
      entries++;
      if (!/^main(?:-\d+)?\.jsonl$/.test(entry.name)) continue;
      names.push(entry.name);
      names.sort((a, b) =>
        a === "main.jsonl"
          ? -1
          : b === "main.jsonl"
            ? 1
            : Number(b.slice(5, -6)) - Number(a.slice(5, -6)),
      );
      if (names.length > 12) {
        names.pop();
        snapshot.coverage.truncated = true;
      }
    }
  } catch {
    snapshot.coverage.unreadable++;
  } finally {
    await listing.close().catch(() => {
      snapshot.coverage.unreadable++;
    });
  }
  const processingExhausted = () =>
    snapshot.coverage.lines >= 20000 || performance.now() >= deadline;
  const exhausted = () =>
    snapshot.coverage.bytes >= 8 * 1024 * 1024 || processingExhausted();
  for (const name of names) {
    if (exhausted()) {
      snapshot.coverage.truncated = true;
      break;
    }
    let handle: FileHandle | undefined;
    try {
      handle = await open(
        join(directory, name),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const info = await handle.stat();
      if (!info.isFile()) {
        snapshot.coverage.unreadable++;
        continue;
      }
      snapshot.coverage.files++;
      let position = info.size;
      let pending = Buffer.alloc(0);
      let oversized = false;
      let tail = true;
      const append = (segment: Buffer) => {
        if (oversized) return;
        if (pending.length + segment.length > 64 * 1024) {
          oversized = true;
          pending = Buffer.alloc(0);
        } else pending = Buffer.concat([segment, pending]);
      };
      const consume = () => {
        if (!pending.length && !oversized) return;
        snapshot.coverage.lines++;
        try {
          if (oversized) {
            snapshot.coverage.malformed++;
            snapshot.coverage.truncated = true;
            return;
          }
          const parsed = sanitizeDiagnosticRecord(
            JSON.parse(pending.toString("utf8")),
          );
          if (parsed.redacted) snapshot.coverage.redacted++;
          if (!parsed.record) {
            snapshot.coverage.malformed++;
            return;
          }
          const record = parsed.record;
          if (
            Date.parse(record.time) < Date.parse(filter.since) ||
            Date.parse(record.time) > Date.parse(filter.until) ||
            (filter.traceId && record.traceId !== filter.traceId) ||
            (filter.threadId && record.threadId !== filter.threadId) ||
            (filter.processInstanceId &&
              record.processInstanceId !== filter.processInstanceId) ||
            (filter.stage && record.stage !== filter.stage) ||
            (filter.operation && record.operation !== filter.operation)
          )
            return;
          snapshot.records.push(record);
          snapshot.records.sort(
            (a, b) => Date.parse(b.time) - Date.parse(a.time),
          );
          if (snapshot.records.length > filter.limit) {
            snapshot.records.pop();
            snapshot.coverage.truncated = true;
          }
        } catch {
          snapshot.coverage.malformed++;
        } finally {
          pending = Buffer.alloc(0);
          oversized = false;
        }
      };
      while (position > 0) {
        if (exhausted()) {
          snapshot.coverage.truncated = true;
          break;
        }
        const buffer = Buffer.alloc(
          Math.min(
            64 * 1024,
            position,
            8 * 1024 * 1024 - snapshot.coverage.bytes,
          ),
        );
        position -= buffer.length;
        const { bytesRead } = await handle.read(
          buffer,
          0,
          buffer.length,
          position,
        );
        snapshot.coverage.bytes += bytesRead;
        if (bytesRead !== buffer.length) {
          snapshot.coverage.truncated = true;
          break;
        }
        let end = bytesRead;
        for (let index = bytesRead - 1; index >= 0; index--) {
          if (processingExhausted()) {
            snapshot.coverage.truncated = true;
            break;
          }
          if (buffer[index] !== 10) continue;
          append(buffer.subarray(index + 1, end));
          if (tail) {
            // The sampled EOF must end with LF: partial Writer output is not an event.
            if (pending.length || oversized) {
              snapshot.coverage.lines++;
              snapshot.coverage.malformed++;
              snapshot.coverage.truncated = true;
            }
            pending = Buffer.alloc(0);
            oversized = false;
            tail = false;
          } else consume();
          if (
            snapshot.coverage.lines > 0 &&
            snapshot.coverage.lines % 128 === 0
          )
            await setImmediate();
          end = index;
        }
        append(buffer.subarray(0, end));
      }
      if (position === 0 && !processingExhausted()) {
        if (tail && (pending.length || oversized)) {
          snapshot.coverage.lines++;
          snapshot.coverage.malformed++;
          snapshot.coverage.truncated = true;
        } else consume();
      }
    } catch {
      snapshot.coverage.unreadable++;
    } finally {
      await handle?.close().catch(() => {
        snapshot.coverage.unreadable++;
      });
    }
  }
  return snapshot;
}
