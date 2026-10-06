import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { DiagnosticSnapshotSchema } from "../../../shared/diagnostics";
import { Diagnostics, readDiagnosticSnapshot } from "./public";

const directories: string[] = [];
const traceId = "16c0e6f1-d0b8-4147-8088-9b13c6410ff2";
const threadId = "9479dba2-b574-4611-a89f-925ba02e67aa";
const processInstanceId = "75dc76a3-f83e-49c9-84f1-8e6aad328309";
const filter = {
  since: "2026-10-06T00:00:00.000Z",
  until: "2026-10-07T00:00:00.000Z",
  limit: 500,
};
const event = {
  schemaVersion: 1,
  time: "2026-10-06T10:00:00.000Z",
  process: "main",
  processInstanceId,
  build: {
    version: "0.1.0-m2.16",
    commit: "4cf37b9",
    dirty: false,
    id: "4cf37b9a-a0123456",
  },
  traceId,
  requestId: traceId,
  connectionId: processInstanceId,
  threadId,
  operation: "submit",
  stage: "unknown",
  receiptState: "acknowledged",
  outcome: "unknown",
  code: "host-exited",
};
async function fixture(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "d-pi-reader-"));
  directories.push(directory);
  for (const [name, text] of Object.entries(files))
    await writeFile(join(directory, name), text);
  return directory;
}
const line = (value: unknown) => `${JSON.stringify(value)}\n`;
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
it("reads persisted receipt acceptance and outcome independently with scoped correlation", async () => {
  const directory = await fixture({
    "main.jsonl":
      line(event) + line({ ...event, traceId: crypto.randomUUID() }),
  });
  const snapshot = await readDiagnosticSnapshot(
    directory,
    { ...filter, traceId, threadId, processInstanceId, stage: "unknown" },
    { degraded: true, dropped: 2 },
  );
  expect(DiagnosticSnapshotSchema.safeParse(snapshot).success).toBe(true);
  expect(snapshot.records).toEqual([event]);
  expect(snapshot.writer).toEqual({ degraded: true, dropped: 2 });
  expect(snapshot.coverage).toMatchObject({
    files: 1,
    lines: 2,
    malformed: 0,
    redacted: 0,
    unreadable: 0,
    truncated: false,
  });
});
it("strips content and unsafe strings while preserving safe observation fields", async () => {
  const directory = await fixture({
    "main.jsonl": line({
      ...event,
      code: "sk-private",
      causeCode: "/private/path",
      operation: "https://private.example",
      requestId: "Bearer secret",
      build: {
        version: "secret",
        commit: "/private/path",
        dirty: false,
        id: "https://private.example",
      },
      observedAt: "preload",
      text: "business content",
      token: "secret",
    }),
  });
  const snapshot = await readDiagnosticSnapshot(directory, filter);
  expect(snapshot.records).toHaveLength(1);
  expect(snapshot.records[0]).toMatchObject({
    code: "unknown",
    causeCode: "unknown",
    operation: "unknown",
    requestId: "unknown",
    build: { version: "unknown", commit: "unknown", id: "unknown" },
    observedAt: "preload",
    receiptState: "acknowledged",
    outcome: "unknown",
  });
  expect(snapshot.coverage.redacted).toBe(1);
  expect(JSON.stringify(snapshot)).not.toMatch(
    /sk-private|private.example|private\/path|Bearer secret|business content|"token"/,
  );
});
it("returns latest persisted records across rotated files and flags the record limit", async () => {
  const newer = { ...event, time: "2026-10-06T11:00:00.000Z" };
  const directory = await fixture({
    "main.jsonl": line(event) + line(newer),
    "main-1.jsonl": line({ ...event, time: "2026-10-06T09:00:00.000Z" }),
    "unrelated.jsonl": line({ ...event, time: "2026-10-06T12:00:00.000Z" }),
  });
  const snapshot = await readDiagnosticSnapshot(directory, {
    ...filter,
    limit: 1,
  });
  expect(snapshot.records).toEqual([newer]);
  expect(snapshot.coverage).toMatchObject({
    files: 2,
    lines: 3,
    truncated: true,
  });
});
it("skips malformed, oversized and incomplete records while retaining adjacent valid evidence", async () => {
  const directory = await fixture({
    "main.jsonl":
      line(event) +
      "{bad}\n" +
      line({ ...event, text: "x".repeat(70000) }) +
      line(event) +
      JSON.stringify(event),
  });
  const snapshot = await readDiagnosticSnapshot(directory, filter);
  expect(snapshot.records).toEqual([event, event]);
  expect(snapshot.coverage).toMatchObject({
    files: 1,
    lines: 5,
    malformed: 3,
    truncated: true,
  });
});
it("caps the retained-file and scan-byte budgets and reads each file from its recent tail", async () => {
  const files: Record<string, string> = {
    "main.jsonl":
      "x".repeat(9 * 1024 * 1024) +
      "\n" +
      line({ ...event, time: "2026-10-06T23:00:00.000Z" }),
  };
  for (let i = 1; i < 18; i++) files[`main-${i}.jsonl`] = line(event);
  const snapshot = await readDiagnosticSnapshot(await fixture(files), filter);
  expect(snapshot.records[0]?.time).toBe("2026-10-06T23:00:00.000Z");
  expect(snapshot.coverage.files).toBeLessThanOrEqual(12);
  expect(snapshot.coverage.bytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  expect(snapshot.coverage.truncated).toBe(true);
});

it("refuses rotated symlinks and non-files and reports unavailable evidence without rejecting", async () => {
  const directory = await fixture({
    "main.jsonl": line(event),
    "secret.jsonl": line(event),
  });
  await symlink(
    join(directory, "secret.jsonl"),
    join(directory, "main-3.jsonl"),
  );
  await mkdir(join(directory, "main-2.jsonl"));
  const snapshot = await readDiagnosticSnapshot(directory, filter);
  expect(snapshot.records).toEqual([event]);
  expect(snapshot.coverage).toMatchObject({ files: 1, unreadable: 2 });
  const missing = await readDiagnosticSnapshot(
    join(directory, "missing"),
    filter,
  );
  expect(missing.records).toEqual([]);
  expect(missing.coverage.unreadable).toBe(1);
});
it("preserves unknown stage evidence conservatively without exporting arbitrary stage content", async () => {
  const directory = await fixture({
    "main.jsonl": line({
      ...event,
      stage: "sk-stage-secret",
      receiptState: "acknowledged",
      outcome: "failed",
      observedAt: "preload",
    }),
  });
  const snapshot = await readDiagnosticSnapshot(directory, filter);
  expect(snapshot.records).toEqual([
    { ...event, stage: "unknown", outcome: "failed", observedAt: "preload" },
  ]);
  expect(snapshot.coverage.redacted).toBe(1);
});

// Supplementary regression coverage for budget behavior already implemented above.
it("bounds directory enumeration and malformed-line scans even when no event matches", async () => {
  const files: Record<string, string> = { "main.jsonl": "{}\n".repeat(25000) };
  for (let i = 0; i < 300; i++) files[`unrelated-${i}`] = "ignored";
  const snapshot = await readDiagnosticSnapshot(await fixture(files), {
    ...filter,
    operation: "window",
  });
  expect(snapshot.records).toEqual([]);
  expect(snapshot.coverage.lines).toBeLessThanOrEqual(20000);
  expect(snapshot.coverage.truncated).toBe(true);
});
it("filters operation and time with exact boundaries and refuses corrupted identity fields", async () => {
  const directory = await fixture({
    "main.jsonl":
      line(event) +
      line({ ...event, operation: "window" }) +
      line({ ...event, processInstanceId: "/private/writer" }) +
      line({ ...event, traceId: "private-trace" }),
  });
  const snapshot = await readDiagnosticSnapshot(directory, {
    ...filter,
    since: event.time,
    until: event.time,
    operation: "window",
  });
  expect(snapshot.records).toEqual([{ ...event, operation: "window" }]);
  expect(snapshot.coverage.malformed).toBe(2);
  expect(JSON.stringify(snapshot)).not.toMatch(
    /private-writer|private-trace|private\/writer/,
  );
});
it("lets the existing Writer persist and close while a budgeted snapshot is scanning", async () => {
  const directory = await fixture({
    "main-1.jsonl": "x".repeat(9 * 1024 * 1024) + "\n",
  });
  const writer = new Diagnostics(directory);
  for (let index = 0; index < 20; index++)
    writer.record({
      traceId,
      requestId: traceId,
      connectionId: processInstanceId,
      operation: "save",
      stage: "received",
    });
  let done = false;
  const reading = readDiagnosticSnapshot(directory, filter, {
    degraded: writer.degraded,
    dropped: writer.dropped,
  }).finally(() => {
    done = true;
  });
  let persistedDuringRead = false;
  await writer.flush().then(() => {
    persistedDuringRead = !done;
  });
  const first = await reading;
  await writer.close();
  const persisted = await readDiagnosticSnapshot(directory, {
    since: "2000-01-01T00:00:00.000Z",
    until: "2100-01-01T00:00:00.000Z",
    limit: 500,
    traceId,
    processInstanceId: writer.processInstanceId,
  });
  expect(persistedDuringRead).toBe(true);
  expect(writer.degraded).toBe(false);
  expect(writer.dropped).toBe(0);
  expect(first.coverage.truncated).toBe(true);
  expect(persisted.records).toHaveLength(20);
});
it("retains the actual bounded SQLite cause code already emitted by Main", async () => {
  const directory = await fixture({
    "main.jsonl": line({
      ...event,
      stage: "failed",
      code: "storage-unavailable",
      causeCode: "ERR_SQLITE_ERROR:1",
    }),
  });
  const snapshot = await readDiagnosticSnapshot(directory, filter);
  expect(snapshot.records[0]?.causeCode).toBe("ERR_SQLITE_ERROR:1");
});
