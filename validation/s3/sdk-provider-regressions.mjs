import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

// Run the unmodified, prepared SDK under its pinned Bun with no inherited credentials.
const sdk = resolve(process.env.SDK_ROOT ?? "resources/sdk");
if (!process.argv.includes("--worker")) {
  const sandbox = createTestEnvironment({
    prefix: "d-pi-sdk-provider-regressions-",
  });
  try {
    const result = spawnSync(
      join(sdk, "bun"),
      [fileURLToPath(import.meta.url), "--worker"],
      {
        cwd: sandbox.cwd,
        env: { ...sandbox.env, SDK_ROOT: sdk },
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 1024 * 1024,
      },
    );
    assert.equal(result.status, 0, result.stderr || String(result.error));
    console.log(result.stdout.trim());
  } finally {
    sandbox.cleanup();
  }
} else {
  const native = (name, path) =>
    import(join(sdk, "node_modules/@oh-my-pi", name, "src", path));
  const metadata = JSON.parse(
    await readFile(join(sdk, "manifest.json"), "utf8"),
  );
  assert.equal(metadata.sdkVersion, "18.8.9");
  const { buildModel } = await native("pi-catalog", "build.ts");
  const { streamOpenAIResponses } = await native(
    "pi-ai",
    "providers/openai-responses.ts",
  );
  const { streamOpenAICodexResponses } = await native(
    "pi-ai",
    "providers/openai-codex-responses.ts",
  );
  const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const cases = [
    {
      name: "blank done and item",
      done: "",
      item: "",
      expected: { path: "fixture.txt" },
    },
    {
      name: "blank done and full item",
      done: "",
      item: '{"path":"fixture.txt"}',
      expected: { path: "fixture.txt" },
    },
    {
      name: "full done ignores late delta",
      done: '{"path":"fixture.txt"}',
      item: "",
      late: " ",
      expected: { path: "fixture.txt" },
    },
    { name: "explicit empty object wins", done: "{}", item: "", expected: {} },
    { name: "explicit null wins", done: "null", item: "null", expected: null },
  ];
  const passed = [];
  for (const [api, streamFn] of [
    ["openai-responses", streamOpenAIResponses],
    ["openai-codex-responses", streamOpenAICodexResponses],
  ]) {
    const model = buildModel({
      id: "fixture",
      name: "fixture",
      provider: api === "openai-responses" ? "openai" : "openai-codex",
      api,
      baseUrl: "http://127.0.0.1:1/v1",
      input: ["text"],
      reasoning: false,
      cost,
      contextWindow: 128000,
      maxTokens: 1024,
    });
    for (const test of cases) {
      const item = {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "read",
        arguments: "",
      };
      const events = [
        { type: "response.created", response: { id: "resp_fixture" } },
        { type: "response.output_item.added", output_index: 0, item },
        {
          type: "response.function_call_arguments.delta",
          output_index: 0,
          item_id: item.id,
          delta: '{"path":',
        },
        {
          type: "response.function_call_arguments.delta",
          output_index: 0,
          item_id: item.id,
          delta: '"fixture.txt"}',
        },
        {
          type: "response.function_call_arguments.done",
          output_index: 0,
          item_id: item.id,
          arguments: test.done,
        },
        ...(test.late
          ? [
              {
                type: "response.function_call_arguments.delta",
                output_index: 0,
                item_id: item.id,
                delta: test.late,
              },
            ]
          : []),
        {
          type: "response.output_item.done",
          output_index: 0,
          item: { ...item, arguments: test.item },
        },
        {
          type: "response.completed",
          response: {
            id: "resp_fixture",
            status: "completed",
            output: [],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        },
      ];
      let calls = 0;
      const token = `aaa.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "fixture" } })).toString("base64")}.bbb`;
      const stream = streamFn(
        model,
        { messages: [{ role: "user", content: "read fixture", timestamp: 1 }] },
        {
          apiKey: api === "openai-responses" ? "fixture" : token,
          preferWebsockets: false,
          fetch: async (url) => {
            assert.ok(String(url).startsWith("http://127.0.0.1:1/"));
            calls++;
            return new Response(
              events
                .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                .join(""),
              { headers: { "Content-Type": "text/event-stream" } },
            );
          },
        },
      );
      const result = await stream.result();
      assert.equal(result.stopReason, "toolUse", JSON.stringify(result));
      assert.equal(calls, 1);
      assert.deepEqual(
        result.content.find((part) => part.type === "toolCall")?.arguments,
        test.expected,
        `${api}: ${test.name}`,
      );
      passed.push(`${api}: ${test.name}`);
    }
  }
  // Validation may inspect native internals; production still uses its existing SDK boundary.
  const { Settings } = await native("pi-coding-agent", "config/settings.ts");
  const { resolveModelCompactionSettings } = await native(
    "pi-coding-agent",
    "session/model-compaction-threshold.ts",
  );
  const { resolveThresholdTokens } = await native(
    "pi-agent-core",
    "compaction/compaction.ts",
  );
  const model = { provider: "fixture", id: "fixture" };
  const thresholds = [];
  for (const [entry, expected] of [
    [undefined, 850000],
    [400000, 340000],
    ["f400000", 400000],
    ["80%", 800000],
  ]) {
    const settings = Settings.isolated(
      entry === undefined
        ? {}
        : { "compaction.modelThresholds": { "fixture/fixture": entry } },
    );
    const point = resolveThresholdTokens(
      1000000,
      resolveModelCompactionSettings(settings, model),
    );
    assert.equal(point, expected);
    thresholds.push({ entry: entry ?? "default", tokens: point });
  }
  const settings = Settings.isolated({ "compaction.thresholdTokens": 300000 });
  assert.equal(
    resolveThresholdTokens(
      196608,
      resolveModelCompactionSettings(settings, model),
    ),
    167117,
  );
  const { AuthStorage } = await native("pi-ai", "auth-storage.ts");
  const { ModelRegistry } = await native(
    "pi-coding-agent",
    "config/model-registry.ts",
  );
  const modelsPath = join(process.env.PI_CODING_AGENT_DIR, "models.yml");
  await writeFile(
    modelsPath,
    JSON.stringify({
      providers: {
        fixture: {
          api: "openai-responses",
          baseUrl: "http://127.0.0.1:1/v1",
          apiKey: "fixture",
          models: [
            {
              id: "fixture",
              name: "fixture",
              contextWindow: 128000,
              maxContextWindow: 512000,
              maxTokens: 1024,
              reasoning: false,
              input: ["text"],
              cost,
            },
          ],
        },
      },
    }),
  );
  const auth = await AuthStorage.create(
    join(process.env.PI_CODING_AGENT_DIR, "agent.db"),
  );
  const registry = new ModelRegistry(auth, modelsPath, {
    settings: Settings.isolated(),
    fetch: async () => {
      throw Error("catalog network forbidden");
    },
  });
  const row = registry.find("fixture", "fixture");
  assert.ok(row);
  assert.deepEqual(registry.contextWindowTiers(row), {
    standard: 128000,
    extended: 512000,
  });
  const extendedWindows = [];
  for (const [entry, expected] of [
    [undefined, 128000],
    [128000, 128000],
    [200000, 512000],
    ["f128000", 512000],
    ["80%", 128000],
  ]) {
    const scope = Settings.isolated({
      extendedContext: false,
      ...(entry === undefined
        ? {}
        : { "compaction.modelThresholds": { "fixture/fixture": entry } }),
    });
    const window = registry.fitContextWindow(row, scope).contextWindow;
    assert.equal(window, expected);
    extendedWindows.push({ entry: entry ?? "default", window });
  }
  assert.equal(
    registry.fitContextWindow(
      row,
      Settings.isolated({
        "compaction.modelThresholds": { "fixture/fixture": 200000 },
        "compaction.modelThresholdsEnabled": false,
      }),
    ).contextWindow,
    128000,
  );
  auth.close();
  const { SessionManager } = await native(
    "pi-coding-agent",
    "session/session-manager.ts",
  );
  const manager = SessionManager.create(
    process.cwd(),
    process.env.PI_CODING_AGENT_SESSION_DIR,
  );
  manager.appendMessage({ role: "user", content: "fixture", timestamp: 1 });
  manager.appendMessage({
    role: "assistant",
    content: [
      {
        type: "toolCall",
        id: "pending",
        name: "read",
        arguments: { path: "fixture.txt" },
      },
    ],
    api: "openai-responses",
    provider: "fixture",
    model: "fixture",
    timestamp: 2,
    stopReason: "toolUse",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { ...cost, total: 0 },
    },
  });
  manager.appendCustomEntry("tool_execution_start", {
    toolCallId: "pending",
    toolName: "read",
    startedAt: new Date().toISOString(),
  });
  await manager.flush();
  const before = await readFile(manager.getSessionFile(), "utf8");
  const fork = await SessionManager.forkFrom(
    manager.getSessionFile(),
    process.cwd(),
    process.env.PI_CODING_AGENT_SESSION_DIR,
    undefined,
    {
      copyArtifacts: false,
      suppressBreadcrumb: true,
      repairInterruptedTail: true,
    },
  );
  const messages = fork.buildSessionContext().messages;
  const pending = messages.find(
    (message) =>
      message.role === "toolResult" && message.toolCallId === "pending",
  );
  assert.ok(pending?.isError);
  assert.match(
    JSON.stringify(pending),
    /parent session may still be running.*unknown/,
  );
  assert.equal(
    await readFile(manager.getSessionFile(), "utf8"),
    before,
    "repair must not mutate the live parent",
  );
  await fork.close();
  await manager.close();
  console.log(
    JSON.stringify(
      {
        sdkVersion: metadata.sdkVersion,
        adapterCases: passed,
        thresholds,
        extendedWindows,
        oversizedFixed: 167117,
        forkOutcomeUnknown: true,
        parentUnchanged: true,
        realSupplierRequests: 0,
      },
      null,
      2,
    ),
  );
}
