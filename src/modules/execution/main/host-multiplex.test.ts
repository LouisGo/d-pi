import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import type { HostStart } from "../contracts/public";

const mocks = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("electron", () => ({ utilityProcess: { fork: mocks.fork } }));

import { HostConnection } from "./host-connection";

it("one utility process routes two independent scopes and one scope exit leaves the other connected", async () => {
  const process = Object.assign(new EventEmitter(), {
    postMessage: vi.fn(),
    kill: vi.fn(),
  });
  mocks.fork.mockReturnValue(process);
  const start = (): HostStart => ({
    kind: "start",
    threadId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    configContextId: "fixture",
    binary: "/fixture",
    identity: { directory: "/project", device: "1", inode: "2" },
    environment: {},
    sessionDirectory: "/sessions",
  });
  const ca = start(),
    cb = start();
  const receiveA = vi.fn(),
    receiveB = vi.fn(),
    exitA = vi.fn(),
    exitB = vi.fn();
  const a = new HostConnection(receiveA, exitA),
    b = new HostConnection(receiveB, exitB);
  const pa = a.start(ca, () => {}),
    pb = b.start(cb, () => {});
  await vi.waitFor(() => expect(process.postMessage).toHaveBeenCalledTimes(2));
  const ready = (c: HostStart) => ({
    scopeId: c.processInstanceId,
    message: {
      kind: "ready",
      processInstanceId: c.processInstanceId,
      connectionGeneration: c.connectionGeneration,
      state: {
        sessionId: c.threadId,
        sessionFile: "/sessions/" + c.threadId,
        isStreaming: false,
        isCompacting: false,
        queuedMessageCount: 0,
      },
    },
  });
  process.emit("message", ready(ca));
  process.emit("message", ready(cb));
  try {
    expect(mocks.fork).toHaveBeenCalledTimes(1);
    await Promise.all([pa, pb]);
    process.emit("message", {
      scopeId: cb.processInstanceId,
      message: { kind: "failed", code: "single-native-failure" },
    });
    expect(receiveA).not.toHaveBeenCalled();
    expect(receiveB).toHaveBeenCalledTimes(1);
    const closing = a.closeIdle();
    process.emit("message", {
      scopeId: ca.processInstanceId,
      message: { kind: "scope-closed" },
    });
    await closing;
    expect(a.connected).toBe(false);
    expect(b.connected).toBe(true);
    expect(exitB).not.toHaveBeenCalled();
    b.send({ kind: "state" });
    expect(process.postMessage).toHaveBeenLastCalledWith({
      scopeId: cb.processInstanceId,
      command: { kind: "state" },
    });
  } finally {
    process.emit("exit");
    await Promise.allSettled([pa, pb]);
  }
});
