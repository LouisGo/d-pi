import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  DiagnosticOperationSchema,
  DiagnosticRecordSchema,
  DiagnosticStageSchema,
} from "../../../shared/diagnostics";

// Only codes emitted by application-owned metadata contracts pass through.
// A syntactically code-like secret is still an unknown code, never copied.
const stages = new Set<string>(DiagnosticStageSchema.options);
const operations = new Set<string>(DiagnosticOperationSchema.options);
const codes = new Set([
  "native-spawn",
  "native-protocol",
  "native-write",
  "native-timeout",
  "native-interrupted",
  "native-unavailable",
  "native-request-limit",
  "native-input-budget",
  "timeout",
  "io",
  "process-spawn",
  "process-exit",
  "output-read",
  "malformed-output",
  "foreign-thread",
  "invalid-source",
  "duplicate-operation",
  "owner-released",
  "read-unavailable",
  "export-unavailable",
  "notification-unavailable",
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
  "recovery-occupied",
  "recovery-owner-unknown",
  "recovery-shutdown-unconfirmed",
  "recovery-lease-unavailable",
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
  "clipboard-invalid",
  "clipboard-expired",
  "clipboard-busy",
  "clipboard-failed",
  "editor-history-limit",
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
  "ERR_SQLITE_ERROR",
  "SQLITE_BUSY",
  "SQLITE_FULL",
  "SQLITE_CORRUPT",
  "SQLITE_NOTADB",
  "SQLITE_CANTOPEN",
]);
function knownCode(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (codes.has(value)) return true;
  const numbered = /^([A-Z][A-Z0-9_]{0,63}):(-?\d{1,16})$/.exec(value);
  return (
    !!numbered &&
    codes.has(numbered[1] ?? "") &&
    Number.isSafeInteger(Number(numbered[2]))
  );
}
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
export function sanitizeDiagnosticRecord(raw: unknown, compareOriginal = true) {
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
      (key === "code" || key === "causeCode"
        ? !knownCode(candidate[key])
        : typeof candidate[key] !== "string" || !known.has(candidate[key]))
    )
      candidate[key] = "unknown";
  }
  const build = object.safeParse(original.build);
  if (build.success) {
    const value = build.data;
    candidate.build = {
      version:
        typeof value.version === "string" &&
        /^(?:source|\d{1,3}\.\d{1,3}\.\d{1,3}(?:-(?:m[12]|workbench)\.\d{1,3})?)$/.test(
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
    redacted: compareOriginal && !isDeepStrictEqual(original, candidate),
  };
}
