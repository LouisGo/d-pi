import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import type { ConfigurationEvent } from "../contracts/public";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../../../platform/omp/resources/public", () => ({
  managedConfigurationRuntime: async () => ({
    binary: "/fixture/bun",
    entry: "/fixture/configuration.mjs",
  }),
}));

import { NativeConfiguration } from "./native-configuration";

function child() {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
}
it("keeps secret key off argv and rejects overlapping native credential writes", async () => {
  const process = child();
  mocks.spawn.mockReturnValue(process);
  const service = new NativeConfiguration(
    "/resources",
    () => "/project",
    {},
    () => {},
    async () => {},
  );
  const traceId = crypto.randomUUID();
  const first = service.execute({
    kind: "save-key",
    traceId,
    key: "fixture-secret",
  });
  await new Promise((r) => setImmediate(r));
  const second = await service.execute({
    kind: "save-key",
    traceId: crypto.randomUUID(),
    key: "second",
  });
  expect(second).toMatchObject({
    kind: "failed",
    code: "operation-in-progress",
  });
  expect(JSON.stringify(mocks.spawn.mock.calls)).not.toContain(
    "fixture-secret",
  );
  expect(process.stdin.read().toString()).toContain("fixture-secret");
  process.stdout.write(
    JSON.stringify({ traceId, message: { kind: "done" } }) + "\n",
  );
  process.emit("close", 0);
  expect(await first).toEqual({ kind: "done" });
});
it("correlates native login, blocks unsafe browser URL and releases a cancelled job", async () => {
  const process = child();
  mocks.spawn.mockReturnValue(process);
  const events: ConfigurationEvent[] = [];
  const open = vi.fn();
  const service = new NativeConfiguration(
    "/resources",
    () => "/project",
    {},
    (event) => events.push(event),
    open,
  );
  const traceId = crypto.randomUUID();
  const result = await service.execute({
    kind: "login",
    traceId,
  });
  if (result.kind !== "started") throw Error("not started");
  process.stdout.write(
    JSON.stringify({
      traceId,
      message: {
        kind: "challenge",
        jobId: result.jobId,
        url: "https://unsafe.invalid/login",
        instructions: "native instructions",
      },
    }) + "\n",
  );
  expect(
    await service.execute({
      kind: "open-login",
      traceId: crypto.randomUUID(),
      jobId: result.jobId,
    }),
  ).toMatchObject({ kind: "failed", code: "unsafe-login-url" });
  expect(open).not.toHaveBeenCalled();
  process.stdout.write(
    JSON.stringify({
      traceId,
      message: {
        kind: "prompt",
        jobId: result.jobId,
        message: "Paste code",
        secret: false,
      },
    }) + "\n",
  );
  expect(service.currentEvents().map((event) => event.kind)).toEqual([
    "challenge",
    "prompt",
  ]);
  await service.execute({
    kind: "cancel",
    traceId: crypto.randomUUID(),
    jobId: result.jobId,
  });
  process.emit("close", null);
  expect(events.at(-1)).toEqual({
    kind: "finished",
    jobId: result.jobId,
    result: "cancelled",
  });
  expect(service.currentEvents()).toEqual([events.at(-1)]);
  expect(process.kill).toHaveBeenCalledOnce();
});
