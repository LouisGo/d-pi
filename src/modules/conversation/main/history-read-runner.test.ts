import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { HistoryReadRunner } from "./history-read-runner";

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
