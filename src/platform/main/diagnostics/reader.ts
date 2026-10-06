import { constants } from "node:fs";
import { type FileHandle, open, opendir } from "node:fs/promises";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  type DiagnosticFilter,
  DiagnosticOperationSchema,
  DiagnosticRecordSchema,
  type DiagnosticSnapshot,
  DiagnosticStageSchema,
} from "../../../shared/diagnostics";

// Only codes emitted by application-owned metadata contracts pass through.
// A syntactically code-like secret is still an unknown code, never copied.
const stages = new Set<string>(DiagnosticStageSchema.options);
const operations = new Set<string>(DiagnosticOperationSchema.options);
const codes = new Set([
  "read-unavailable",
  "export-unavailable",
  "source-changed",
  "cancelled",
  "unknown",
  "host-exited",
  "spawn",
  "protocol",
  "exit",
  "write",
  "state-unavailable",
  "active-work",
  "runtime-unavailable",
  "cache-full",
  "correlation-expired",
  "native-error",
  "queue-full",
  "not-ready",
  "content-too-large",
  "unknown-submission",
  "stale-event",
  "revision-conflict",
  "unsupported-native-command",
  "content-not-ready",
  "image-unsupported",
  "storage-unavailable",
  "transport-unavailable",
  "invalid-reply",
  "invalid-request",
  "locale-save-failed",
  "attachment-operation-unavailable",
  "directory-unavailable",
  "invalid-token",
  "attachment-not-found",
  "source-too-large",
  "submission-too-large",
  "transport-too-large",
  "storage-full",
  "content-corrupt",
  "content-missing",
  "unsupported-format",
  "invalid-image",
  "image-decoder-unavailable",
  "pdf-conversion-unavailable",
  "pdf-conversion-failed",
  "pdf-coverage-gap",
  "pdf-too-many-pages",
  "reference-unavailable",
  "reference-denied",
  "not-git",
  "git-unavailable",
  "unmerged",
  "configuration-unavailable",
  "configuration-partial",
  "stale-target",
  "operation-in-progress",
  "authentication-failed",
  "authentication-rejected",
  "authentication-network",
  "authentication-provider-unavailable",
  "operation-timed-out",
  "invalid-job",
  "unsafe-login-url",
  "credentials-unavailable",
  "settings-unavailable",
  "models-unavailable",
  "history-catalog-partial",
  "missing",
  "denied",
  "invalid",
  "failed",
  "outside-project",
  "not-file",
  "too-large",
  "invalid-encoding",
  "changed",
  "binary",
  "unsupported",
  "not-directory",
  "symlink",
  "not-found",
  "busy",
  "resource-missing",
  "resource-invalid",
  "clean-exit",
  "abnormal-exit",
  "killed",
  "crashed",
  "oom",
  "launch-failed",
  "integrity-failure",
  "ENOENT",
  "EACCES",
  "EPERM",
  "EIO",
  "ENOSPC",
  "EROFS",
  "SQLITE_BUSY",
  "SQLITE_FULL",
  "SQLITE_CORRUPT",
  "SQLITE_NOTADB",
  "SQLITE_CANTOPEN",
]);
const reasons = new Set([
  "watchdog-owner-changed",
  "watchdog-owner-missing",
  "watchdog-main-changed",
  "watchdog-main-missing",
  "permit-timeout",
  "permit-rejected",
  "stdin-eof",
  "bootstrap-error",
  "sdk-exit",
]);
const signals = new Set([
  "SIGABRT",
  "SIGALRM",
  "SIGBUS",
  "SIGFPE",
  "SIGHUP",
  "SIGILL",
  "SIGINT",
  "SIGKILL",
  "SIGPIPE",
  "SIGQUIT",
  "SIGSEGV",
  "SIGTERM",
  "SIGTRAP",
  "SIGUSR1",
  "SIGUSR2",
]);
const fields = new Set<string>(DiagnosticRecordSchema.keyof().options);
const object = z.record(z.string(), z.unknown());
const uuid = z.uuid();
function sanitize(raw: unknown) {
  const input = object.safeParse(raw);
  if (!input.success) return { record: undefined, redacted: false };
  const original = input.data;
  const candidate: Record<string, unknown> = Object.fromEntries(
    Object.entries(original).filter(([key]) => fields.has(key)),
  );
  for (const key of ["requestId", "connectionId"]) {
    if (!uuid.safeParse(candidate[key]).success) candidate[key] = "unknown";
  }
  for (const [key, known] of [
    ["stage", stages],
    ["operation", operations],
    ["code", codes],
    ["causeCode", codes],
    ["exitSignal", signals],
    ["terminationReason", reasons],
  ] as const) {
    if (
      candidate[key] !== undefined &&
      candidate[key] !== null &&
      (typeof candidate[key] !== "string" || !known.has(candidate[key]))
    )
      candidate[key] = "unknown";
  }
  const build = object.safeParse(original.build);
  if (build.success) {
    const value = build.data;
    candidate.build = {
      version:
        typeof value.version === "string" &&
        /^(?:source|\d{1,3}\.\d{1,3}\.\d{1,3}(?:-m[12]\.\d{1,3})?)$/.test(
          value.version,
        )
          ? value.version
          : "unknown",
      commit:
        typeof value.commit === "string" &&
        /^(?:unbundled|unknown|[a-f0-9]{7,40})$/.test(value.commit)
          ? value.commit
          : "unknown",
      id:
        typeof value.id === "string" &&
        /^(?:unbundled|unknown|[a-f0-9]{8}(?:-dirty)?-[a-f0-9]{8})$/.test(
          value.id,
        )
          ? value.id
          : "unknown",
      dirty: value.dirty,
    };
  }
  for (const key of [
    "threadId",
    "submissionId",
    "nativeProcessInstanceId",
    "errorId",
  ]) {
    if (candidate[key] !== undefined && !uuid.safeParse(candidate[key]).success)
      delete candidate[key];
  }
  if (candidate.observedAt !== undefined && candidate.observedAt !== "preload")
    delete candidate.observedAt;
  const parsed = DiagnosticRecordSchema.safeParse(candidate);
  return {
    record: parsed.success ? parsed.data : undefined,
    redacted: !isDeepStrictEqual(original, candidate),
  };
}

/** Sample only persisted Main evidence; neither flush nor acquire the Writer's queue.
 * Tail sampling is bounded to 12 files, 256 directory entries, 8 MiB, 20k lines,
 * 64 KiB per line and a cooperative 1.5s I/O/processing deadline. Directory
 * budget and wall clocks prevent any claim of complete newest history.
 */
export async function readDiagnosticSnapshot(
  directory: string,
  filter: DiagnosticFilter,
  writer = { degraded: false, dropped: 0 },
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
          const parsed = sanitize(JSON.parse(pending.toString("utf8")));
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
