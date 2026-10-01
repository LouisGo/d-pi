import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import {
  type ConfigurationEvent,
  ConfigurationScopeSchema,
} from "../contracts/public";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), resources: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../../../platform/omp/resources/public", () => ({
  managedConfigurationRuntime: async () => {
    await mocks.resources();
    return { binary: "/fixture/bun", entry: "/fixture/configuration.mjs" };
  },
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
function threadScope() {
  const value = ConfigurationScopeSchema.parse({
    kind: "thread",
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
  });
  if (value.kind !== "thread") throw Error("missing thread");
  return value;
}
const application = { kind: "application" } as const;
const source = { directory: "/native", profile: null, cwd: "/probe" };
const threads = {
  threadContext: () => {
    throw Error("No thread");
  },
};
function frame(
  process: ReturnType<typeof child>,
  traceId: string,
  message: unknown,
) {
  process.stdout.write(JSON.stringify({ traceId, message }) + "\n");
}
it("records unreadable credentials as an unknown result with bounded cause codes", async () => {
  const process = child();
  mocks.spawn.mockReturnValue(process);
  const record = vi.fn();
  const service = new NativeConfiguration(
    "/resources",
    threads,
    "/probe",
    {},
    () => {},
    async () => {},
    record,
  );
  const traceId = crypto.randomUUID();
  const pending = service.execute({
    kind: "snapshot",
    scope: application,
    traceId,
  });
  await new Promise((resolve) => setImmediate(resolve));
  frame(process, traceId, {
    kind: "snapshot",
    scope: application,
    traceId,
    source,
    models: [],
    defaultModel: null,
    openaiAuthenticated: null,
    deepseekAuthenticated: null,
    catalogError: true,
    coverage: "partial",
    issues: ["credentials-unavailable"],
  });
  process.emit("close", 0);
  expect(await pending).toMatchObject({
    kind: "snapshot",
    coverage: "partial",
  });
  expect(record.mock.calls.at(-1)?.[0]).toMatchObject({
    stage: "unknown",
    code: "configuration-partial",
    causeCode: "credentials-unavailable",
    traceId,
  });
});
it("keeps secret key off argv and rejects overlapping native credential writes", async () => {
  const process = child();
  mocks.spawn.mockReturnValue(process);
  const service = new NativeConfiguration(
    "/resources",
    threads,
    "/probe",
    {},
    () => {},
    async () => {},
  );
  const traceId = crypto.randomUUID();
  const first = service.execute({
    kind: "save-key",
    scope: application,
    traceId,
    key: "fixture-secret",
  });
  await new Promise((r) => setImmediate(r));
  expect(
    await service.execute({
      kind: "save-key",
      scope: application,
      traceId: crypto.randomUUID(),
      key: "second",
    }),
  ).toMatchObject({ kind: "failed", code: "operation-in-progress" });
  expect(JSON.stringify(mocks.spawn.mock.calls)).not.toContain(
    "fixture-secret",
  );
  expect(process.stdin.read().toString()).toContain("fixture-secret");
  frame(process, traceId, {
    kind: "done",
    scope: application,
    traceId,
    source,
  });
  process.emit("close", 0);
  expect(await first).toMatchObject({
    kind: "done",
    scope: application,
    traceId,
    source,
  });
});
it("keeps the old job cancellation outlet after its Thread disappears, and retains browser challenge before a prompt", async () => {
  const a = threadScope();
  let exists = true;
  const reader = {
    threadContext: () => {
      if (!exists) throw Error("deleted");
      return { ...a, directory: "/A" };
    },
  };
  const process = child();
  mocks.spawn.mockReturnValue(process);
  const events: ConfigurationEvent[] = [];
  const open = vi.fn();
  const service = new NativeConfiguration(
    "/resources",
    reader,
    "/probe",
    {},
    (e) => events.push(e),
    open,
  );
  const traceId = crypto.randomUUID();
  const result = await service.execute({ kind: "login", scope: a, traceId });
  if (result.kind !== "started") throw Error("not started");
  const identity = {
    scope: a,
    traceId,
    source: { ...source, cwd: "/A" },
    jobId: result.jobId,
  };
  frame(process, traceId, {
    ...identity,
    kind: "challenge",
    url: "https://unsafe.invalid/login",
    instructions: "native instructions",
  });
  expect(
    await service.execute({
      kind: "open-login",
      traceId: crypto.randomUUID(),
      jobId: result.jobId,
    }),
  ).toMatchObject({ kind: "failed", code: "unsafe-login-url", scope: a });
  expect(open).not.toHaveBeenCalled();
  frame(process, traceId, {
    ...identity,
    kind: "prompt",
    message: "Paste code",
    secret: false,
  });
  expect(service.currentEvents().map((event) => event.kind)).toEqual([
    "challenge",
    "prompt",
  ]);
  exists = false;
  expect(
    await service.execute({
      kind: "cancel",
      traceId: crypto.randomUUID(),
      jobId: result.jobId,
    }),
  ).toMatchObject({ kind: "done", scope: a });
  process.emit("close", null);
  expect(events.at(-1)).toMatchObject({
    ...identity,
    kind: "finished",
    result: "cancelled",
  });
  expect(process.kill).toHaveBeenCalledOnce();
});
it.each(["deleted", "reassociated"])(
  "rejects an %s target after resource wait without falling back to the active Thread",
  async (change) => {
    let release!: () => void;
    mocks.resources.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const scope = threadScope();
    let changed = false;
    const reader = {
      threadContext: () => {
        if (changed && change === "deleted") throw Error("missing");
        return {
          ...scope,
          workingDirectoryId: changed
            ? threadScope().workingDirectoryId
            : scope.workingDirectoryId,
          directory: "/A",
        };
      },
    };
    const service = new NativeConfiguration(
      "/resources",
      reader,
      "/probe",
      {},
      () => {},
      async () => {},
    );
    const calls = mocks.spawn.mock.calls.length;
    const pending = service.execute({
      kind: "snapshot",
      scope,
      traceId: crypto.randomUUID(),
    });
    await new Promise((r) => setImmediate(r));
    changed = true;
    release();
    expect(await pending).toMatchObject({
      kind: "failed",
      code: "stale-target",
      scope,
    });
    expect(mocks.spawn.mock.calls.length).toBe(calls);
  },
);
it("uses the fixed application probe and refuses a child reply with another cwd", async () => {
  const process = child();
  mocks.spawn.mockReturnValue(process);
  const service = new NativeConfiguration(
    "/resources",
    threads,
    "/probe",
    {},
    () => {},
    async () => {},
  );
  const traceId = crypto.randomUUID();
  const pending = service.execute({
    kind: "snapshot",
    scope: application,
    traceId,
  });
  await new Promise((r) => setImmediate(r));
  expect(mocks.spawn.mock.calls.at(-1)?.[2].cwd).toBe("/probe");
  frame(process, traceId, {
    kind: "snapshot",
    scope: application,
    traceId,
    source: { ...source, cwd: "/other" },
    models: [],
    defaultModel: "other",
    openaiAuthenticated: false,
    deepseekAuthenticated: false,
    catalogError: false,
    coverage: "complete",
    issues: [],
  });
  process.emit("close", 0);
  expect(await pending).toMatchObject({
    kind: "failed",
    code: "configuration-unavailable",
    scope: application,
  });
});
it("records stale-target when the original Thread disappears before the snapshot completes", async () => {
  const scope = threadScope();
  let exists = true;
  const record = vi.fn();
  const process = child();
  mocks.spawn.mockReturnValue(process);
  const service = new NativeConfiguration(
    "/resources",
    {
      threadContext: () => {
        if (!exists) throw Error("deleted");
        return { ...scope, directory: "/A" };
      },
    },
    "/probe",
    {},
    () => {},
    async () => {},
    record,
  );
  const traceId = crypto.randomUUID();
  const pending = service.execute({ kind: "snapshot", scope, traceId });
  await new Promise((resolve) => setImmediate(resolve));
  frame(process, traceId, {
    kind: "snapshot",
    scope,
    traceId,
    source: { ...source, cwd: "/A" },
    models: [],
    defaultModel: "A",
    openaiAuthenticated: false,
    deepseekAuthenticated: false,
    catalogError: false,
    coverage: "complete",
    issues: [],
  });
  exists = false;
  process.emit("close", 0);
  expect(await pending).toMatchObject({
    kind: "failed",
    code: "stale-target",
    scope,
    traceId,
  });
  expect(record.mock.calls.at(-1)?.[0]).toMatchObject({
    stage: "failed",
    code: "stale-target",
    traceId,
  });
});
