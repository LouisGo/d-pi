import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import * as disk from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { Diagnostics } from "./diagnostics";

const context = {
  traceId: crypto.randomUUID(),
  requestId: crypto.randomUUID(),
  connectionId: crypto.randomUUID(),
  operation: "save",
  stage: "received" as const,
};
it("flood remains bounded and persisted lines retain correlation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-logs-"));
  const logger = new Diagnostics(directory);
  for (let i = 0; i < 2000; i++) logger.record(context);
  expect(logger.dropped).toBeGreaterThan(0);
  await logger.close();
  const lines = readFileSync(join(directory, "main.jsonl"), "utf8")
    .trim()
    .split("\n");
  expect(lines.length).toBeLessThanOrEqual(1000);
  expect(JSON.parse(lines[0] ?? "")).toMatchObject(context);
  expect(JSON.parse(lines[0] ?? "").build).toMatchObject({
    id: expect.any(String),
    commit: expect.any(String),
    version: expect.any(String),
  });
  rmSync(directory, { recursive: true, force: true });
});
it("preserves the new editor history operation's identity at the raw persistence boundary", async () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-history-log-"));
  const logger = new Diagnostics(directory);
  try {
    logger.record({
      ...context,
      operation: "attachments:history-update",
      threadId: crypto.randomUUID(),
    });
    await logger.close();
    expect(
      JSON.parse(readFileSync(join(directory, "main.jsonl"), "utf8")),
    ).toMatchObject({ ...context, operation: "attachments:history-update" });
  } finally {
    await logger.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it("writer failure is visible, bounded and does not reject business flow", async () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-logs-"));
  const path = join(directory, "not-directory");
  writeFileSync(path, "fixture");
  let notifications = 0;
  const logger = new Diagnostics(path, () => {
    notifications++;
  });
  logger.record(context);
  await logger.close();
  expect(logger.degraded).toBe(true);
  expect(logger.dropped).toBe(1);
  expect(notifications).toBe(1);
  rmSync(directory, { recursive: true, force: true });
});

it("filters untrusted metadata before serialization and retains trusted writer identity", async () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-logs-"));
  const logger = new Diagnostics(directory);
  const secret = "token-DO-NOT-PERSIST-/private/project?key=secret";
  const toJSON = vi.fn(() => ({ token: secret }));
  const event = {
    ...context,
    code: secret,
    causeCode: secret,
    threadId: secret,
    prompt: secret.repeat(20000),
    path: secret,
    process: secret,
    processInstanceId: secret,
    build: { token: secret },
    time: secret,
    writerGap: { secret },
    toJSON,
  };
  logger.record(event);
  await logger.close();
  const bytes = readFileSync(join(directory, "main.jsonl"), "utf8");
  expect(bytes).not.toContain(secret);
  expect(toJSON).not.toHaveBeenCalled();
  expect(JSON.parse(bytes)).toMatchObject({
    ...context,
    process: "main",
    processInstanceId: logger.processInstanceId,
    code: "unknown",
    causeCode: "unknown",
  });
  expect(JSON.parse(bytes)).not.toHaveProperty("threadId");
  rmSync(directory, { recursive: true, force: true });
});

it("recovers each failure episode and persists a bounded gap without resetting totals", async () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-recovery-"));
  let failing = true;
  const notify = vi.fn();
  const logger = new Diagnostics(directory, notify, {
    mkdir: async (...args) => {
      if (failing) throw new Error("private filesystem error");
      return disk.mkdir(...args);
    },
  });
  logger.record(context);
  await logger.flush();
  logger.record(context);
  await logger.flush();
  expect(notify).toHaveBeenCalledTimes(1);
  failing = false;
  logger.record(context);
  await logger.flush();
  expect(logger.health()).toMatchObject({ degraded: false, dropped: 2 });
  const lines = readFileSync(join(directory, "main.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(
    lines.find((line) => line.operation === "diagnostics:writer"),
  ).toMatchObject({
    stage: "completed",
    writerGap: { dropped: 2, uncertain: 0, retentionFailures: 0 },
  });
  failing = true;
  logger.record(context);
  await logger.flush();
  expect(notify).toHaveBeenCalledTimes(2);
  expect(logger.health()).toMatchObject({ degraded: true, dropped: 3 });
  await logger.close();
  rmSync(directory, { recursive: true, force: true });
});

it("distinguishes append uncertainty from retention failures after a confirmed write", async () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-write-stages-"));
  let failAppend = true;
  let failRetention = true;
  const logger = new Diagnostics(directory, undefined, {
    appendFile: async (...args) => {
      // Partial physical writes are possible even when append rejects.
      await disk.appendFile(...args);
      if (failAppend) throw new Error("unconfirmed append");
    },
    readdir: async (...args) => {
      if (failRetention) throw new Error("retention unavailable");
      return disk.readdir(...args);
    },
  });
  logger.record(context);
  await logger.flush();
  expect(logger.health()).toMatchObject({
    dropped: 0,
    uncertain: 1,
    retentionFailures: 0,
  });
  failAppend = false;
  logger.record(context);
  await logger.flush();
  expect(logger.health()).toMatchObject({
    degraded: true,
    dropped: 0,
    uncertain: 1,
    retentionFailures: 1,
  });
  failRetention = false;
  logger.record(context);
  await logger.flush();
  expect(logger.health()).toMatchObject({
    degraded: false,
    dropped: 0,
    uncertain: 1,
    retentionFailures: 1,
  });
  await logger.close();
  rmSync(directory, { recursive: true, force: true });
});

it("rejects invalid and closed input without invoking accessors or serialization hooks", async () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-invalid-log-"));
  const logger = new Diagnostics(directory);
  const getter = vi.fn(() => {
    throw new Error("secret");
  });
  const malformed = { ...context, traceId: "invalid" };
  Object.defineProperty(malformed, "code", { get: getter });
  expect(() => logger.record(malformed)).not.toThrow();
  expect(logger.health()).toMatchObject({ rejected: 1 });
  expect(getter).not.toHaveBeenCalled();
  await logger.close();
  logger.record(context);
  expect(logger.health()).toMatchObject({ rejected: 2 });
  rmSync(directory, { recursive: true, force: true });
});

it("stops drain at the close deadline and separately reports active I/O", async () => {
  vi.useFakeTimers();
  const directory = mkdtempSync(join(tmpdir(), "d-pi-slow-log-"));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const append = vi.fn(async () => {
    await gate;
  });
  const logger = new Diagnostics(directory, undefined, { appendFile: append });
  try {
    for (let i = 0; i < 150; i++) logger.record(context);
    const active = logger.flush();
    await vi.waitFor(() => expect(append).toHaveBeenCalledTimes(1));
    const closing = logger.close();
    const sameClosing = logger.close();
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.all([closing, sameClosing]);
    expect(logger.health()).toMatchObject({
      dropped: 50,
      drainTimedOut: 1,
      inFlight: 100,
    });
    release();
    await active;
    expect(logger.health()).toMatchObject({ dropped: 50, inFlight: 0 });
    expect(append).toHaveBeenCalledTimes(1);
  } finally {
    release();
    vi.useRealTimers();
    rmSync(directory, { recursive: true, force: true });
  }
});

it("rotates confirmed data and prunes old files without changing correlation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-rotate-"));
  const current = join(directory, "main.jsonl");
  writeFileSync(current, "");
  truncateSync(current, 10 * 1024 * 1024);
  const expired = join(directory, "main-1000000000000.jsonl");
  writeFileSync(expired, "old");
  utimesSync(expired, new Date(0), new Date(0));
  const logger = new Diagnostics(directory);
  logger.record(context);
  await logger.close();
  expect(existsSync(expired)).toBe(false);
  expect(JSON.parse(readFileSync(current, "utf8"))).toMatchObject(context);
  expect(logger.health()).toMatchObject({
    degraded: false,
    dropped: 0,
    uncertain: 0,
  });
  rmSync(directory, { recursive: true, force: true });
});

it("does not recursively emit a recovery summary when that summary fails", async () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-gap-fail-"));
  let available = false;
  let attempts = 0;
  const logger = new Diagnostics(directory, undefined, {
    mkdir: async (...args) => {
      if (!available) throw new Error("failed");
      return disk.mkdir(...args);
    },
    appendFile: async (...args) => {
      attempts++;
      if (args[1].includes('"diagnostics:writer"'))
        throw new Error("summary failed");
      return disk.appendFile(...args);
    },
  });
  logger.record(context);
  await logger.flush();
  available = true;
  logger.record(context);
  await logger.flush();
  expect(attempts).toBe(2);
  expect(logger.health()).toMatchObject({
    degraded: true,
    dropped: 1,
    uncertain: 1,
  });
  await logger.close();
  expect(attempts).toBe(2);
  rmSync(directory, { recursive: true, force: true });
});
