import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { HostStart } from "../../contracts/public";

const mocks = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("electron", () => ({ utilityProcess: { fork: mocks.fork } }));

import { HostConnection } from "./host-connection";

afterEach(() => vi.useRealTimers());

async function connected(autoReady = true, existing?: HostConnection) {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-host-operation-"));
  const host = Object.assign(new EventEmitter(), {
    postMessage: vi.fn(),
    kill: vi.fn(),
  });
  mocks.fork.mockReturnValue(host);
  const command: HostStart = {
    kind: "start",
    threadId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    configContextId: "fixture",
    binary: "/fixture",
    identity: { directory: "/project", device: "1", inode: "2" },
    environment: {},
    sessionDirectory: directory,
  };
  const connection = existing ?? new HostConnection(vi.fn(), vi.fn());
  const onReady = vi.fn();
  const started = connection.start(command, onReady);
  await vi.waitFor(() => expect(host.postMessage).toHaveBeenCalledOnce());
  const emit = (message: unknown) =>
    host.emit("message", { scopeId: command.processInstanceId, message });
  const ready = () =>
    emit({
      kind: "ready",
      processInstanceId: command.processInstanceId,
      connectionGeneration: command.connectionGeneration,
      state: {
        sessionId: command.threadId,
        sessionFile: join(directory, "session"),
        isStreaming: false,
        isCompacting: false,
        queuedMessageCount: 0,
      },
    });
  if (autoReady) {
    ready();
    await started;
  }
  const operation = () => ({
    kind: "state" as const,
    traceId: crypto.randomUUID(),
    connectionGeneration: command.connectionGeneration,
  });
  return {
    connection,
    host,
    emit,
    operation,
    ready,
    onReady,
    started,
    async dispose() {
      host.emit("exit", 0);
      await connection.closeIdle();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

it("releases operation correlations after success and synchronous send failure", async () => {
  const fixture = await connected();
  // Correlation lifetime is the resource contract under test; no public test API.
  const waiters = Reflect.get(fixture.connection, "operationWaiters");
  try {
    for (let index = 0; index < 3; index++) {
      const command = fixture.operation();
      const pending = fixture.connection.operation(command);
      fixture.emit({
        kind: "operation-result",
        traceId: command.traceId,
        connectionGeneration: command.connectionGeneration,
        operation: "inspect",
        status: "acknowledged",
      });
      await expect(pending).resolves.toMatchObject({ status: "acknowledged" });
      expect(waiters.size).toBe(0);
    }
    fixture.host.postMessage.mockImplementationOnce(() => {
      throw Error("Transport unavailable");
    });
    await expect(
      fixture.connection.operation(fixture.operation()),
    ).resolves.toMatchObject({
      status: "unknown",
    });
    expect(waiters.size).toBe(0);
  } finally {
    await fixture.dispose();
  }
});

it("times out startup once and ignores late ready without claiming process shutdown", async () => {
  vi.useFakeTimers();
  const fixture = await connected(false);
  const rejection = expect(fixture.started).rejects.toThrow(
    "Host startup timeout",
  );
  try {
    await vi.advanceTimersByTimeAsync(35000);
    await rejection;
    expect(fixture.connection.connected).toBe(true);
    expect(fixture.host.postMessage).toHaveBeenCalledTimes(2);
    fixture.ready();
    expect(fixture.onReady).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await fixture.dispose();
  }
});

it("preserves identity checks, expires only the wait and never replays a late operation", async () => {
  const fixture = await connected();
  vi.useFakeTimers();
  try {
    const command = fixture.operation();
    const pending = fixture.connection.operation(command);
    const result = {
      kind: "operation-result",
      traceId: command.traceId,
      connectionGeneration: command.connectionGeneration,
      operation: "inspect",
      status: "acknowledged",
    };
    fixture.emit({ ...result, connectionGeneration: crypto.randomUUID() });
    fixture.emit({ ...result, operation: "stop" });
    expect(Reflect.get(fixture.connection, "operationWaiters").size).toBe(1);
    await vi.advanceTimersByTimeAsync(12000);
    await expect(pending).resolves.toMatchObject({ status: "unknown" });
    expect(Reflect.get(fixture.connection, "operationWaiters").size).toBe(0);
    fixture.emit(result);
    expect(fixture.host.postMessage).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await fixture.dispose();
  }
});

it("ends an in-flight operation on disconnect without waiting for its deadline", async () => {
  const fixture = await connected();
  vi.useFakeTimers();
  try {
    const pending = fixture.connection.operation(fixture.operation());
    fixture.emit({ kind: "interrupted", reason: "fixture" });
    await expect(pending).resolves.toMatchObject({ status: "unknown" });
    expect(Reflect.get(fixture.connection, "operationWaiters").size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(fixture.host.postMessage).toHaveBeenCalledTimes(2);
  } finally {
    await fixture.dispose();
  }
});

it("uses a fresh wait owner when the same connection starts another generation", async () => {
  const first = await connected();
  const interrupted = first.connection.operation(first.operation());
  await first.dispose();
  await expect(interrupted).resolves.toMatchObject({ status: "unknown" });
  const next = await connected(true, first.connection);
  try {
    const command = next.operation();
    const pending = next.connection.operation(command);
    next.emit({
      kind: "operation-result",
      traceId: command.traceId,
      connectionGeneration: command.connectionGeneration,
      operation: "inspect",
      status: "acknowledged",
    });
    await expect(pending).resolves.toMatchObject({ status: "acknowledged" });
    expect(Reflect.get(next.connection, "operationWaiters").size).toBe(0);
  } finally {
    await next.dispose();
  }
});

it("clears a timed-out close wait while leaving physical cleanup unconfirmed", async () => {
  const fixture = await connected();
  vi.useFakeTimers();
  try {
    const closing = fixture.connection.closeIdle();
    const rejection = expect(closing).rejects.toThrow(
      "Idle close not confirmed",
    );
    await vi.advanceTimersByTimeAsync(5000);
    await rejection;
    expect(fixture.connection.connected).toBe(true);
    expect(Reflect.get(fixture.connection, "closeListeners").size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(fixture.host.postMessage).toHaveBeenCalledTimes(2);
  } finally {
    await fixture.dispose();
  }
});

it("releases the close listener and deadline when close dispatch fails synchronously", async () => {
  const fixture = await connected();
  vi.useFakeTimers();
  try {
    fixture.host.postMessage.mockImplementationOnce(() => {
      throw Error("Close transport failed");
    });
    await expect(fixture.connection.closeIdle()).rejects.toThrow(
      "Close transport failed",
    );
    expect(Reflect.get(fixture.connection, "closeListeners").size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await fixture.dispose();
  }
});
