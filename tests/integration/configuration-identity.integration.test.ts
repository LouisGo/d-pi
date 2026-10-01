import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import {
  ConfigurationCommandSchema,
  ConfigurationReplySchema,
  type ConfigurationScope,
  ConfigurationScopeSchema,
} from "../../src/modules/configuration/contracts/public";
import { configurationSnapshotQuery } from "../../src/modules/configuration/renderer/public";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), resources: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../../src/platform/omp/resources/public", () => ({
  managedConfigurationRuntime: async () => {
    await mocks.resources();
    return { binary: "/fixture/bun", entry: "/fixture/configuration.mjs" };
  },
}));

import { NativeConfiguration } from "../../src/modules/configuration/main/public";

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
it("keeps A's query, cwd, default model and source together across a resource wait and switch to B", async () => {
  let release!: () => void;
  mocks.resources.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const a = threadScope();
  const b = threadScope();
  let active: ConfigurationScope = a;
  const reader = {
    threadContext: (id: string) => ({
      ...(id === a.threadId ? a : b),
      directory: id === a.threadId ? "/A" : "/B",
    }),
  };
  const process = child();
  mocks.spawn.mockReturnValue(process);
  const environment = { OMP_PROFILE: "first" };
  const service = new NativeConfiguration(
    "/resources",
    reader,
    "/probe",
    environment,
    () => {},
    async () => {},
  );
  const client = new QueryClient();
  const bridge = {
    request: async (raw: Parameters<NativeConfiguration["execute"]>[0]) =>
      ConfigurationReplySchema.parse(
        await service.execute(ConfigurationCommandSchema.parse(raw)),
      ),
    subscribe: () => () => {},
  };
  try {
    const pending = client.fetchQuery(configurationSnapshotQuery(bridge, a));
    await new Promise((r) => setImmediate(r));
    active = b;
    environment.OMP_PROFILE = "second";
    release();
    await new Promise((r) => setImmediate(r));
    expect(active).toEqual(b);
    expect(mocks.spawn.mock.calls.at(-1)?.[2].cwd).toBe("/A");
    const request = JSON.parse(process.stdin.read().toString());
    frame(process, request.traceId, {
      kind: "snapshot",
      scope: a,
      traceId: request.traceId,
      source: { ...source, cwd: "/A" },
      models: [],
      defaultModel: "A",
      openaiAuthenticated: false,
      deepseekAuthenticated: false,
      catalogError: false,
      coverage: "complete",
      issues: [],
    });
    process.emit("close", 0);
    expect(await pending).toMatchObject({
      kind: "snapshot",
      scope: a,
      defaultModel: "A",
      source: { cwd: "/A" },
    });
    expect(client.getQueryData(["configuration", b])).toBeUndefined();
    expect(mocks.spawn.mock.calls.at(-1)?.[2].env.OMP_PROFILE).toBe("first");
  } finally {
    client.clear();
  }
});
