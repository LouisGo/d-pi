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
it("bounds navigation snapshot processes and drains queued reads with their original scope and trace", async () => {
  const children = [child(), child(), child(), child()];
  mocks.spawn.mockClear();
  for (const process of children) mocks.spawn.mockReturnValueOnce(process);
  const scopes = [threadScope(), threadScope(), threadScope(), threadScope()];
  const traces = scopes.map(() => crypto.randomUUID());
  const service = new NativeConfiguration(
    "/resources",
    {
      threadContext: (threadId: string) => {
        const scope = scopes.find(
          (scope) => scope.kind === "thread" && scope.threadId === threadId,
        );
        if (!scope) throw Error("missing");
        return { ...scope, directory: `/project/${threadId}` };
      },
    },
    "/probe",
    {},
    () => {},
    async () => {},
  );
  const reads = scopes.map((scope, index) =>
    service.execute({ kind: "snapshot", scope, traceId: traces[index] ?? "" }),
  );
  try {
    await new Promise((resolve) => setImmediate(resolve));
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    for (const [index, scope] of scopes.entries()) {
      if (scope.kind !== "thread") throw Error("missing thread");
      const process = children[index];
      if (!process) throw Error("missing child");
      frame(process, traces[index] ?? "", {
        kind: "snapshot",
        scope,
        traceId: traces[index],
        source: { ...source, cwd: `/project/${scope.threadId}` },
        models: [],
        defaultModel: null,
        openaiAuthenticated: false,
        deepseekAuthenticated: false,
        catalogError: false,
        coverage: "complete",
        issues: [],
      });
      process.emit("close", 0);
      expect(await reads[index]).toMatchObject({
        kind: "snapshot",
        scope,
        traceId: traces[index],
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(mocks.spawn).toHaveBeenCalledTimes(Math.min(index + 2, 4));
    }
  } finally {
    service.dispose();
    for (const process of children) process.emit("close", 0);
    await Promise.all(reads);
  }
});
it("revalidates a queued Thread before spawning and cancels waiting reads on disposal", async () => {
  const process = child();
  mocks.spawn.mockClear().mockReturnValue(process);
  const scope = threadScope();
  let exists = true;
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
  );
  const first = service.execute({
    kind: "snapshot",
    scope: application,
    traceId: crypto.randomUUID(),
  });
  const traceId = crypto.randomUUID();
  const waiting = service.execute({ kind: "snapshot", scope, traceId });
  await new Promise((resolve) => setImmediate(resolve));
  exists = false;
  process.emit("close", 0);
  await first;
  expect(await waiting).toMatchObject({
    kind: "failed",
    code: "stale-target",
    scope,
    traceId,
  });
  expect(mocks.spawn).toHaveBeenCalledOnce();
  const active = service.execute({
    kind: "snapshot",
    scope: application,
    traceId: crypto.randomUUID(),
  });
  const queued = service.execute({
    kind: "snapshot",
    scope: application,
    traceId,
  });
  await new Promise((resolve) => setImmediate(resolve));
  service.dispose();
  expect(await queued).toMatchObject({
    kind: "failed",
    code: "configuration-unavailable",
    traceId,
  });
  process.emit("close", null);
  await active;
  expect(mocks.spawn).toHaveBeenCalledTimes(2);
});

it("limits pending navigation reads and expires them without starting more processes", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const process = child();
  mocks.spawn.mockClear().mockReturnValue(process);
  const service = new NativeConfiguration(
    "/resources",
    threads,
    "/probe",
    {},
    () => {},
    async () => {},
  );
  const command = () => ({
    kind: "snapshot" as const,
    scope: application,
    traceId: crypto.randomUUID(),
  });
  const active = service.execute(command());
  const commands = Array.from({ length: 8 }, command);
  const pending = commands.map((command) => service.execute(command));
  try {
    expect(await service.execute(command())).toMatchObject({
      kind: "failed",
      code: "operation-in-progress",
    });
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(20000);
    for (const [index, read] of pending.entries())
      expect(await read).toMatchObject({
        kind: "failed",
        code: "operation-timed-out",
        traceId: commands[index]?.traceId,
      });
    expect(mocks.spawn).toHaveBeenCalledOnce();
    process.emit("close", null);
    await active;
  } finally {
    service.dispose();
    process.emit("close", null);
    vi.useRealTimers();
  }
});
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
    url: "http://unsafe.invalid/login",
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

it("reports the one-shot credential timeout without claiming rejection or repeating the operation", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
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
  try {
    const pending = service.execute({
      kind: "save-key",
      scope: application,
      traceId,
      key: "fixture-secret",
    });
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(20000);
    expect(process.kill).toHaveBeenCalledOnce();
    process.emit("close", null);
    expect(await pending).toMatchObject({
      kind: "failed",
      code: "operation-timed-out",
      traceId,
    });
    expect(record.mock.calls.at(-1)?.[0]).toMatchObject({
      code: "operation-timed-out",
      traceId,
    });
  } finally {
    service.dispose();
    vi.useRealTimers();
  }
});

it("carries the native provider id and opens only that job's challenge including loopback launch URLs", async () => {
  const process = child();
  mocks.spawn.mockReturnValue(process);
  const open = vi.fn(async () => {});
  const service = new NativeConfiguration(
    "/resources",
    threads,
    "/probe",
    {},
    () => {},
    open,
  );
  const traceId = crypto.randomUUID();
  try {
    const started = await service.execute({
      kind: "login",
      scope: application,
      traceId,
      providerId: "anthropic",
    });
    if (started.kind !== "started") throw Error("not started");
    expect(process.stdin.read()?.toString()).toContain(
      '"providerId":"anthropic"',
    );
    frame(process, traceId, {
      kind: "challenge",
      jobId: started.jobId,
      scope: application,
      traceId,
      source,
      url: "https://claude.ai/oauth/authorize",
      instructions: "Sign in",
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(
      await service.execute({
        kind: "open-login",
        jobId: started.jobId,
        traceId: crypto.randomUUID(),
      }),
    ).toMatchObject({ kind: "done" });
    expect(open).toHaveBeenCalledWith("https://claude.ai/oauth/authorize");
    frame(process, traceId, {
      kind: "challenge",
      jobId: started.jobId,
      scope: application,
      traceId,
      source,
      url: "https://claude.ai/oauth/authorize",
      launchUrl: "http://127.0.0.1:9911/launch",
      instructions: "Sign in",
    });
    await new Promise((resolve) => setImmediate(resolve));
    await service.execute({
      kind: "open-login",
      jobId: started.jobId,
      traceId: crypto.randomUUID(),
    });
    expect(open).toHaveBeenLastCalledWith("http://127.0.0.1:9911/launch");
  } finally {
    service.dispose();
    process.emit("close", 0);
  }
});
