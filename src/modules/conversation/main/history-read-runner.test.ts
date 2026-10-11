import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { HistoryReadRunner } from "./history-read-runner";

it("supervises image reads with their own schema and holds cancellation until exit", async () => {
  const worker = Object.assign(new EventEmitter(), {
    terminate: vi.fn(async () => 1),
  });
  const runner = new HistoryReadRunner(new URL("file:///fixture-worker.js"), {
    maxActive: 1,
    spawn: () => worker,
  });
  const threadId = crypto.randomUUID();
  const task = {
    operationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    root: "/fixture",
    binding: {
      threadId,
      configContextId: "fixture",
      sessionId: "session",
      sessionFile: "/fixture/session.jsonl",
    },
    cursor: { threadId, source: "version", offset: 1 },
    recordId: "record",
    index: 0,
  };
  const pending = runner.image(task).catch((error: unknown) => error);
  worker.emit("message", {
    kind: "image",
    dataUrl: "data:image/png;base64,YQ==",
  });
  expect(runner.snapshot().active).toBe(1);
  worker.emit("exit", 0);
  expect(await pending).toEqual({
    kind: "image",
    dataUrl: "data:image/png;base64,YQ==",
  });
  const wrong = runner.image(task).catch((error: unknown) => error);
  worker.emit("message", { kind: "catalog", sessions: [], partial: false });
  worker.emit("exit", 0);
  expect(await wrong).toMatchObject({ code: "malformed-output" });
  const controller = new AbortController();
  const stopped = runner
    .image(task, controller.signal)
    .catch((error: unknown) => error);
  controller.abort();
  expect(runner.snapshot().active).toBe(1);
  worker.emit("exit", 1);
  expect(await stopped).toMatchObject({ name: "AbortError" });
  expect(runner.snapshot().active).toBe(0);
});

it("keeps the worker permit after cancellation until actual exit and then admits another read", async () => {
  const worker = Object.assign(new EventEmitter(), {
    terminate: vi.fn(async () => 1),
  });
  const spawn = vi.fn(() => worker);
  const runner = new HistoryReadRunner(new URL("file:///fixture-worker.js"), {
    maxActive: 1,
    spawn,
  });
  const controller = new AbortController();
  const task = {
    operationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    root: "/fixture",
    binding: {
      threadId: crypto.randomUUID(),
      configContextId: "fixture",
      sessionId: "session",
      sessionFile: "/fixture/session.jsonl",
    },
    cursor: null,
  };
  const pending = runner
    .read(task, controller.signal)
    .catch((error: unknown) => error);
  expect(runner.snapshot().active).toBe(1);
  controller.abort();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(runner.snapshot().active).toBe(1);
  await expect(runner.read(task)).rejects.toMatchObject({ code: "busy" });
  worker.emit("exit", 1);
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(runner.snapshot().active).toBe(0);
  const next = runner.read(task);
  worker.emit("message", { kind: "unavailable", reason: "missing" });
  // A payload is not proof of cleanup.
  expect(runner.snapshot().active).toBe(1);
  worker.emit("exit", 0);
  await expect(next).resolves.toEqual({
    kind: "unavailable",
    reason: "missing",
  });
  await runner.close();
  await expect(runner.read(task)).rejects.toMatchObject({
    code: "owner-released",
  });
});

it("holds close until every worker exits and rejects malformed replies after finalization", async () => {
  const worker = Object.assign(new EventEmitter(), {
    terminate: vi.fn(async () => 1),
  });
  const runner = new HistoryReadRunner(new URL("file:///fixture-worker.js"), {
    spawn: () => worker,
  });
  const task = {
    operationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    root: "/fixture",
    binding: {
      threadId: crypto.randomUUID(),
      configContextId: "fixture",
      sessionId: "session",
      sessionFile: "/fixture/session.jsonl",
    },
    cursor: null,
  };
  const pending = runner.read(task).catch((error: unknown) => error);
  worker.emit("message", { arbitrary: "not a history page" });
  worker.emit("exit", 0);
  expect(await pending).toMatchObject({ code: "malformed-output" });
  const stopped = runner.read(task).catch((error: unknown) => error);
  let closed = false;
  const close = runner.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  worker.emit("exit", 1);
  await close;
  expect(await stopped).toMatchObject({ name: "AbortError" });
});

it("keeps a timed-out read slot until physical worker exit", async () => {
  vi.useFakeTimers();
  const worker = Object.assign(new EventEmitter(), {
    terminate: vi.fn(async () => 1),
  });
  const runner = new HistoryReadRunner(new URL("file:///fixture-worker.js"), {
    maxActive: 1,
    timeoutMs: 10,
    spawn: () => worker,
  });
  const task = {
    operationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    root: "/fixture",
    binding: {
      threadId: crypto.randomUUID(),
      configContextId: "fixture",
      sessionId: "session",
      sessionFile: "/fixture/session.jsonl",
    },
    cursor: null,
  };
  const pending = runner.read(task).catch((error: unknown) => error);
  try {
    await vi.advanceTimersByTimeAsync(11);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(runner.snapshot().active).toBe(1);
    await expect(runner.read(task)).rejects.toMatchObject({ code: "busy" });
    worker.emit("exit", 1);
    expect(await pending).toMatchObject({ code: "timeout" });
    expect(runner.snapshot().active).toBe(0);
  } finally {
    worker.emit("exit", 1);
    await runner.close();
    vi.useRealTimers();
  }
});
