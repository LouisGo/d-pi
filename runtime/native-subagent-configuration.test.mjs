import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import {
  createAgentSession,
  discoverAuthStorage,
} from "@oh-my-pi/pi-coding-agent/sdk";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { cfgTaskAgentModelOverrides } from "@oh-my-pi/pi-coding-agent/task/settings";
import {
  resolveEffectiveSubagentPolicy,
  runStructuredSubagent,
} from "@oh-my-pi/pi-coding-agent/task/structured-subagent";
import { createSubagentConfiguration } from "./native-subagent-configuration.mjs";

const model = {
  provider: "fixture",
  id: "child",
  name: "child",
  reasoning: true,
  thinking: { mode: "effort", efforts: ["low", "high"], defaultLevel: "low" },
};
function session() {
  return {
    settings: Settings.isolated(),
    sessionManager: { getCwd: () => process.cwd() },
    getSessionAgents: () => [
      {
        name: "fixture",
        description: "Fixture",
        systemPrompt: "Reply",
        model: "fixture/default",
        source: "session",
      },
    ],
    model: { ...model, id: "parent" },
    modelRegistry: {
      find: (provider, id) =>
        provider === "fixture" && id === "child" ? model : undefined,
      hasConfiguredAuth: () => true,
      refreshSelectedModelMetadata: async (value) => value,
    },
  };
}
function toolSession(native) {
  return {
    cwd: process.cwd(),
    settings: native.settings,
    getSessionAgents: native.getSessionAgents.bind(native),
    getSessionSpawns: () => "fixture,task",
    getActiveModelString: () => "fixture/parent",
  };
}
function fixtureModels(port) {
  return JSON.stringify({
    providers: Object.fromEntries(
      ["fixture", "fixture-other"].map((provider) => [
        provider,
        {
          baseUrl: `http://127.0.0.1:${port}/${provider}/v1`,
          apiKey: "fixture",
          api: "openai-completions",
          models: ["alpha", "beta"].map((id) => ({
            id,
            name: id,
            reasoning: true,
            thinking: {
              mode: "effort",
              efforts: ["low", "high"],
              defaultLevel: "low",
            },
            input: ["text"],
            contextWindow: 128000,
            maxTokens: 1024,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          })),
        },
      ]),
    ),
  });
}
test("sets a future spawn default on only this Settings instance", async () => {
  const a = session(),
    b = session();
  const config = createSubagentConfiguration(a);
  await config.apply({
    kind: "set",
    agent: "fixture",
    provider: "fixture",
    modelId: "child",
    thinking: { kind: "effort", effort: "high" },
  });
  const [aPolicy, bPolicy] = await Promise.all(
    [a, b].map((native) =>
      resolveEffectiveSubagentPolicy({
        session: toolSession(native),
        invocationKind: "task",
        assignment: "Reply",
        agent: "fixture",
      }),
    ),
  );
  expect(aPolicy.modelOverride).toEqual(["fixture/child:high"]);
  expect(bPolicy.modelOverride).toEqual(["fixture/default"]);
  expect(a.model.id).toBe("parent");
  expect(cfgTaskAgentModelOverrides.get(b.settings)).toEqual({});
});
test("a discovered and session-defined name has one entry matching native first-match precedence", async () => {
  const native = session();
  native.getSessionAgents = () => [
    {
      name: "task",
      description: "Session duplicate",
      model: "fixture/session-duplicate",
    },
  ];
  const snapshot = await createSubagentConfiguration(native).snapshot();
  const entries = snapshot.agents.filter((agent) => agent.name === "task");
  expect(entries).toHaveLength(1);
  const policy = await resolveEffectiveSubagentPolicy({
    session: toolSession(native),
    invocationKind: "task",
    assignment: "Reply",
    agent: "task",
  });
  expect(entries[0].effectivePatterns).toEqual(policy.modelOverride);
});
test("clearing restores native defaults and preserves a different agent override", async () => {
  const native = session();
  const config = createSubagentConfiguration(native);
  await config.apply({
    kind: "set",
    agent: "fixture",
    provider: "fixture",
    modelId: "child",
    thinking: { kind: "effort", effort: "high" },
  });
  await config.apply({
    kind: "set",
    agent: "task",
    provider: "fixture",
    modelId: "child",
    thinking: { kind: "default" },
  });
  const actual = await config.apply({ kind: "clear", agent: "fixture" });
  expect(
    actual.agents.find((agent) => agent.name === "fixture").effectivePatterns,
  ).toEqual(["fixture/default"]);
  expect(
    actual.agents.find((agent) => agent.name === "fixture").override,
  ).toBeNull();
  expect(
    actual.agents.find((agent) => agent.name === "task").override.modelId,
  ).toBe("child");
  await config.apply({ kind: "clear", agent: "task" });
  expect(cfgTaskAgentModelOverrides.get(native.settings)).toEqual({});
});
test("invalid models and thinking levels leave the accepted override unchanged", async () => {
  const native = session(),
    config = createSubagentConfiguration(native);
  const command = {
    kind: "set",
    agent: "fixture",
    provider: "fixture",
    modelId: "child",
    thinking: { kind: "effort", effort: "high" },
  };
  await config.apply(command);
  await expect(
    config.apply({ ...command, modelId: "missing" }),
  ).rejects.toThrow("model-unavailable");
  await expect(
    config.apply({ ...command, thinking: { kind: "effort", effort: "max" } }),
  ).rejects.toThrow();
  await expect(config.apply({ ...command, agent: "missing" })).rejects.toThrow(
    "subagent-unavailable",
  );
  const current = (await config.snapshot()).agents.find(
    (agent) => agent.name === "fixture",
  );
  expect(current.override).toEqual({
    provider: "fixture",
    modelId: "child",
    thinking: { kind: "effort", effort: "high" },
  });
  expect(current.effectivePatterns).toEqual(["fixture/child:high"]);
});
test("explicit spawn requests keep the native precedence over Thread defaults", async () => {
  const native = session(),
    config = createSubagentConfiguration(native);
  await config.apply({
    kind: "set",
    agent: "fixture",
    provider: "fixture",
    modelId: "child",
    thinking: { kind: "off" },
  });
  const policy = await resolveEffectiveSubagentPolicy({
    session: toolSession(native),
    invocationKind: "task",
    assignment: "Reply",
    agent: "fixture",
    model: "fixture/request:low",
  });
  expect(policy.modelOverride).toEqual(["fixture/request:low"]);
  expect(
    (await config.snapshot()).agents.find((agent) => agent.name === "fixture")
      .effectivePatterns,
  ).toEqual(["fixture/child:off"]);
});
test("auth and required-effort metadata reject unavailable overrides without changing the parent", async () => {
  const native = session(),
    config = createSubagentConfiguration(native);
  const command = {
    kind: "set",
    agent: "fixture",
    provider: "fixture",
    modelId: "child",
    thinking: { kind: "off" },
  };
  native.modelRegistry.hasConfiguredAuth = () => false;
  await expect(config.apply(command)).rejects.toThrow("model-unavailable");
  native.modelRegistry.hasConfiguredAuth = () => true;
  native.modelRegistry.refreshSelectedModelMetadata = async (value) => ({
    ...value,
    thinking: { ...value.thinking, requiresEffort: true },
  });
  await expect(config.apply(command)).rejects.toThrow("thinking-unavailable");
  expect(cfgTaskAgentModelOverrides.get(native.settings)).toEqual({});
  expect(native.model.id).toBe("parent");
});
test("clear observes an external native default change without writing config", async () => {
  const configPath = join(process.env.PI_CODING_AGENT_DIR, "config.yml");
  await writeFile(
    configPath,
    JSON.stringify({
      task: { agentModelOverrides: { fixture: "fixture/original:low" } },
    }),
  );
  const native = session();
  native.settings = await Settings.loadIsolated({
    cwd: process.cwd(),
    agentDir: process.env.PI_CODING_AGENT_DIR,
  });
  const config = createSubagentConfiguration(native);
  await config.apply({
    kind: "set",
    agent: "fixture",
    provider: "fixture",
    modelId: "child",
    thinking: { kind: "effort", effort: "high" },
  });
  const updated = JSON.stringify({
    task: { agentModelOverrides: { fixture: "fixture/updated:low" } },
  });
  await writeFile(configPath, updated);
  expect(
    (await config.snapshot()).agents.find((agent) => agent.name === "fixture")
      .effectivePatterns,
  ).toEqual(["fixture/child:high"]);
  expect(
    (await config.apply({ kind: "clear", agent: "fixture" })).agents.find(
      (agent) => agent.name === "fixture",
    ).effectivePatterns,
  ).toEqual(["fixture/updated:low"]);
  expect(await readFile(configPath, "utf8")).toBe(updated);
});
test("two concurrent real child spawns use separate defaults without rewriting shared config", async () => {
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const body = await req.json();
      requests.push({
        ...body,
        fixtureProvider: new URL(req.url).pathname.split("/")[1],
      });
      const chunk = (delta, finish_reason) => ({
        id: "fixture",
        object: "chat.completion.chunk",
        created: 1,
        model: body.model,
        choices: [{ index: 0, delta, finish_reason }],
      });
      return new Response(
        `data: ${JSON.stringify(chunk({ role: "assistant", content: "FIXTURE" }, null))}\n\ndata: ${JSON.stringify(chunk({}, "stop"))}\n\ndata: [DONE]\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  });
  let auth;
  const natives = [];
  try {
    const modelsPath = join(process.env.PI_CODING_AGENT_DIR, "models.yml");
    const content = fixtureModels(server.port);
    await writeFile(modelsPath, content);
    auth = await discoverAuthStorage(process.env.PI_CODING_AGENT_DIR);
    const registry = new ModelRegistry(auth, modelsPath);
    if (registry.getError()) throw Error(JSON.stringify(registry.getError()));
    for (let index = 0; index < 2; index++) {
      const { session: native } = await createAgentSession({
        cwd: process.cwd(),
        sessionManager: SessionManager.inMemory(process.cwd()),
        settings: Settings.isolated({ "autolearn.enabled": false }),
        modelRegistry: registry,
        authStorage: auth,
        model: registry.find("fixture", "alpha"),
        enableMCP: false,
        enableLsp: false,
        tools: [],
      });
      natives.push(native);
    }
    await Promise.all(
      natives.map((native, index) =>
        createSubagentConfiguration(native).apply({
          kind: "set",
          agent: "task",
          provider: index === 0 ? "fixture" : "fixture-other",
          modelId: index === 0 ? "alpha" : "beta",
          thinking: { kind: "effort", effort: index === 0 ? "high" : "low" },
        }),
      ),
    );
    const results = await Promise.all(
      natives.map((native) =>
        runStructuredSubagent({
          session: {
            ...toolSession(native),
            modelRegistry: registry,
            authStorage: auth,
            getSessionFile: () => null,
            enableLsp: false,
            enableIrc: false,
            enableMCP: false,
            restrictToolNames: true,
          },
          invocationKind: "task",
          agent: "task",
          assignment: "Reply FIXTURE",
          enableLsp: false,
          enableIrc: false,
          maxRuntimeMs: 15000,
        }),
      ),
    );
    expect(results.every((result) => result.result.exitCode === 0)).toBe(true);
    expect(
      [
        ...new Set(
          requests.map(
            (request) =>
              `${request.fixtureProvider}:${request.model}:${request.reasoning_effort}`,
          ),
        ),
      ].sort(),
    ).toEqual(["fixture-other:beta:low", "fixture:alpha:high"]);
    expect(await readFile(modelsPath, "utf8")).toBe(content);
    expect(natives.map((native) => native.model.id)).toEqual([
      "alpha",
      "alpha",
    ]);
  } finally {
    await Promise.all(natives.map((native) => native.dispose()));
    auth?.close();
    server.stop(true);
  }
}, 30000);
test("prepared Host starts and returns correlated subagent state/set/clear controls", async () => {
  await writeFile(
    join(process.env.PI_CODING_AGENT_DIR, "models.yml"),
    fixtureModels(1),
  );
  await writeFile(
    join(process.env.PI_CODING_AGENT_DIR, "config.yml"),
    JSON.stringify({
      autolearn: { enabled: false },
      modelRoles: { default: "fixture/alpha", task: "fixture/alpha" },
    }),
  );
  const child = spawn(
    join(import.meta.dir, "../bun"),
    [join(import.meta.dir, "../host.mjs")],
    { cwd: process.cwd(), env: process.env, stdio: ["pipe", "pipe", "pipe"] },
  );
  const frames = [];
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    frames.push(JSON.parse(line));
  });
  const wait = async (predicate) => {
    const deadline = Date.now() + 15000;
    while (!predicate()) {
      if (child.exitCode !== null || Date.now() > deadline)
        throw Error(`Host exited/timed out: ${stderr.slice(-2000)}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  const request = async (type, command) => {
    const id = crypto.randomUUID();
    child.stdin.write(
      `${JSON.stringify({ type, id, ...(command ? { command } : {}) })}\n`,
    );
    await wait(() =>
      frames.some((frame) => frame.type === "response" && frame.id === id),
    );
    const reply = frames.find(
      (frame) => frame.type === "response" && frame.id === id,
    );
    expect(reply.command).toBe(type);
    return reply;
  };
  try {
    await wait(() => frames.some((frame) => frame.type === "ready"));
    const initial = await request("d_pi_subagent_state");
    expect(initial.success).toBe(true);
    expect(initial.data.agents.some((agent) => agent.name === "task")).toBe(
      true,
    );
    const set = await request("d_pi_subagent_config", {
      kind: "set",
      agent: "task",
      provider: "fixture-other",
      modelId: "beta",
      thinking: { kind: "effort", effort: "high" },
    });
    expect(set.success).toBe(true);
    expect(
      set.data.agents.find((agent) => agent.name === "task").effectivePatterns,
    ).toEqual(["fixture-other/beta:high"]);
    const clear = await request("d_pi_subagent_config", {
      kind: "clear",
      agent: "task",
    });
    expect(clear.success).toBe(true);
    expect(
      clear.data.agents.find((agent) => agent.name === "task").override,
    ).toBeNull();
    const invalid = await request("d_pi_subagent_config", {
      kind: "set",
      agent: "task",
      provider: "fixture",
      modelId: "missing",
      thinking: { kind: "default" },
    });
    expect(invalid.success).toBe(false);
    expect(invalid.error).toBe("model-unavailable");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", resolve);
    });
    lines.close();
  }
}, 30000);
