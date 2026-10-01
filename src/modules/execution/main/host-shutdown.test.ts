import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import type { HostStart } from "../contracts/public";

const mocks = vi.hoisted(() => ({
  fork: vi.fn(),
  identity: vi.fn(),
  terminate: vi.fn(),
}));
vi.mock("electron", () => ({ utilityProcess: { fork: mocks.fork } }));
vi.mock("../../../platform/node/processes/public", () => ({
  readProcessIdentity: mocks.identity,
  terminateManagedGroup: mocks.terminate,
}));

import { HostConnection } from "./host-connection";

it("does not confirm idle close until its owned group is confirmed dead, and rejects uncertain cleanup", async () => {
  const host = Object.assign(new EventEmitter(), {
    pid: 12344,
    postMessage: vi.fn(),
    kill: vi.fn(),
  });
  mocks.fork.mockReturnValue(host);
  const native = {
    pid: 12345,
    parentPid: host.pid,
    groupId: 12345,
    birth: "fixture-birth",
    executable: "/fixture/bun",
  };
  mocks.identity.mockImplementation(async (pid: number) =>
    pid === process.pid ? { ...native, pid: process.pid } : native,
  );
  let finish: ((confirmed: boolean) => void) | undefined;
  mocks.terminate.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const command: HostStart = {
    kind: "start",
    threadId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    configContextId: "fixture",
    binary: "/fixture/bun",
    sdkEntry: "/fixture/host.mjs",
    identity: { directory: "/project", device: "1", inode: "2" },
    environment: {},
    sessionDirectory: "/sessions",
  };
  const receive = vi.fn();
  const connection = new HostConnection(receive, vi.fn());
  const started = connection.start(command, () => {});
  await vi.waitFor(() => expect(host.postMessage).toHaveBeenCalledOnce());
  const supervision = host.postMessage.mock.calls[0]?.[0].command.supervision;
  host.emit("message", {
    scopeId: command.processInstanceId,
    message: {
      kind: "native-register",
      registration: {
        ...native,
        processInstanceId: command.processInstanceId,
        token: supervision.token,
      },
    },
  });
  await vi.waitFor(() => expect(host.postMessage).toHaveBeenCalledTimes(2));
  host.emit("message", {
    scopeId: command.processInstanceId,
    message: {
      kind: "ready",
      processInstanceId: command.processInstanceId,
      connectionGeneration: command.connectionGeneration,
      state: {
        sessionId: "session",
        sessionFile: "/sessions/session",
        isStreaming: false,
        isCompacting: false,
        queuedMessageCount: 0,
      },
    },
  });
  await started;
  let settled = false;
  const closing = connection.closeIdle().finally(() => {
    settled = true;
  });
  const rejection = expect(closing).rejects.toThrow(
    "Process group shutdown unconfirmed",
  );
  host.emit("message", {
    scopeId: command.processInstanceId,
    message: { kind: "scope-closed" },
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  finish?.(false);
  await rejection;
  expect(receive).toHaveBeenCalledWith({
    kind: "interrupted",
    reason: "process-group-unconfirmed",
  });
  await expect(connection.closeIdle()).rejects.toThrow(
    "Process group shutdown unconfirmed",
  );
});
