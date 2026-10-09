// Opt-in real provider verification: installed CLI -> GUI adapter -> cold GUI
// adapter, all on the original synthetic native session. No user history sent.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { backup, DatabaseSync } from "node:sqlite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

if (!process.env.D_PI_LIVE_AUTH_SOURCE)
  throw Error(
    "Set D_PI_LIVE_AUTH_SOURCE to explicitly opt into real model calls",
  );
const sandbox = createTestEnvironment({ prefix: "d-pi-cli-continuation-" });
const sdk = resolve(process.env.SDK_ROOT ?? "resources/sdk");
const cli = process.env.D_PI_CLI_BINARY ?? "/opt/homebrew/bin/omp";
const children = new Set();
const model = "openai-codex/gpt-6-luna";
const marker = `蓝色纸鹤编号 ${randomUUID().slice(0, 8)}`;
const env = {
  ...sandbox.env,
  PI_CODING_AGENT_SESSION_DIR: join(sandbox.config, "sessions"),
};
const cliFlags = [
  "--model",
  model,
  "--no-tools",
  "--no-lsp",
  "--no-extensions",
  "--no-skills",
  "--no-rules",
  "--thinking",
  "low",
  "--session-dir",
  env.PI_CODING_AGENT_SESSION_DIR,
];
const adapter = join(sandbox.root, "adapter");
const source = new DatabaseSync(
  join(process.env.D_PI_LIVE_AUTH_SOURCE, "agent.db"),
  { readOnly: true },
);
try {
  await backup(source, join(sandbox.config, "agent.db"));
} finally {
  source.close();
}
async function sessions(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await sessions(path)));
    else if (entry.name.endsWith(".jsonl")) results.push(path);
  }
  return results;
}
function start(binary, args, extraEnv = {}) {
  const child = spawn(binary, args, {
    cwd: sandbox.cwd,
    env: { ...env, ...extraEnv },
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.add(child);
  const frames = [];
  let stderr = "";
  child.stderr.on("data", (bytes) => {
    stderr = (stderr + bytes).slice(-4096);
  });
  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      frames.push(JSON.parse(line));
    } catch {}
  });
  const exited = new Promise((resolve) =>
    child.once("exit", (code) => {
      children.delete(child);
      resolve(code);
    }),
  );
  const wait = async (predicate) => {
    const until = Date.now() + 120000;
    while (Date.now() < until) {
      const frame = frames.find(predicate);
      if (frame) return frame;
      if (child.exitCode !== null)
        throw Error(`Process exited ${child.exitCode}: ${stderr.slice(-2000)}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error("Native response timeout");
  };
  const send = (frame) => child.stdin.write(JSON.stringify(frame) + "\n");
  return { child, frames, exited, wait, send };
}
try {
  await mkdir(env.PI_CODING_AGENT_SESSION_DIR, { recursive: true });
  await writeFile(
    join(sandbox.config, "config.yml"),
    JSON.stringify({
      autolearn: { enabled: false },
      compaction: { enabled: false },
      modelRoles: { default: model, smol: model },
    }),
  );
  const version = spawnSync(cli, ["--version"], {
    env,
    cwd: sandbox.cwd,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(version.status, 0);
  const seed = start(cli, [
    ...cliFlags,
    "--mode",
    "json",
    "--print",
    `这是无敏感信息的合成测试：纸鹤的描述是“${marker}”。请记住这个测试事实，只回复“已记住”，不使用工具。`,
  ]);
  seed.child.stdin.end();
  assert.equal(await seed.exited, 0, "real CLI seed completed");
  const paths = await sessions(env.PI_CODING_AGENT_SESSION_DIR);
  assert.equal(paths.length, 1);
  const file = paths[0];
  const initial = await readFile(file, "utf8");
  const entries = initial
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const header = entries.find((entry) => entry.type === "session");
  assert.ok(header?.id);
  assert.ok(
    entries.some(
      (entry) => entry.type === "message" && entry.message.role === "assistant",
    ),
  );
  const owners = () => {
    const result = spawnSync(
      join(sdk, "bun"),
      [
        "-e",
        `import {sessionExecutionOwners} from ${JSON.stringify(resolve("src/platform/node/processes/session-file-owners.ts"))}; console.log(JSON.stringify(await sessionExecutionOwners(${JSON.stringify(file)},${JSON.stringify(sandbox.cwd)})));`,
      ],
      { env, cwd: sandbox.cwd, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 0, "owner probe succeeds");
    return JSON.parse(result.stdout.trim());
  };
  const idle = start(cli, [...cliFlags, "--mode", "rpc", "--resume", file]);
  idle.send({ type: "get_state", id: "state" });
  const state = await idle.wait(
    (frame) => frame.type === "response" && frame.id === "state",
  );
  assert.equal(state.success, true);
  assert.equal(state.data.sessionId, header.id);
  assert.ok(owners().includes(idle.child.pid), "real idle CLI is detected");
  idle.child.stdin.end();
  await idle.exited;
  assert.deepEqual(
    owners(),
    [],
    "closed CLI no longer blocks GUI continuation",
  );
  await mkdir(adapter);
  await symlink(join(sdk, "node_modules"), join(adapter, "node_modules"));
  await cp(join(sdk, "gate.js"), join(adapter, "gate.js"));
  for (const name of [
    "host.mjs",
    "model-selection.mjs",
    "native-queue.mjs",
    "native-subagent-configuration.mjs",
    "reading-session.mjs",
    "managed-session.mjs",
  ])
    await cp(resolve("runtime", name), join(adapter, name));
  const rounds = [];
  for (let round = 0; round < 2; round++) {
    const native = start(join(sdk, "bun"), [join(adapter, "host.mjs")], {
      PI_CODING_AGENT_SESSION_DIR: dirname(file),
      D_PI_RESUME_SESSION: JSON.stringify({
        sessionFile: file,
        sessionId: header.id,
        origin: "cli",
      }),
      D_PI_MODEL_SELECTION: JSON.stringify({
        provider: "openai-codex",
        modelId: "gpt-6-luna",
        thinking: { kind: "effort", effort: "low" },
      }),
    });
    native.send({ type: "get_state", id: "state" });
    const restored = await native.wait(
      (frame) => frame.type === "response" && frame.id === "state",
    );
    assert.equal(restored.success, true);
    assert.equal(restored.data.sessionId, header.id);
    assert.equal(restored.data.sessionFile, file);
    assert.ok(
      !native.frames.some((frame) => frame.type === "agent_start"),
      "startup does not replay a prompt",
    );
    native.send({
      type: "negotiate_protocol",
      protocolVersion: 2,
      id: "protocol",
    });
    await native.wait(
      (frame) => frame.type === "response" && frame.id === "protocol",
    );
    native.send({
      type: "prompt",
      id: `follow-up-${round}`,
      message:
        round === 0
          ? "请只回复前文合成测试纸鹤的完整描述（颜色和编号），不使用工具。"
          : "冷重启后继续：请再次只回复前文合成测试纸鹤的完整描述（颜色和编号），不使用工具。",
    });
    const response = await native.wait(
      (frame) => frame.type === "response" && frame.id === `follow-up-${round}`,
    );
    assert.equal(response.success, true);
    const result = await native.wait(
      (frame) =>
        frame.type === "prompt_result" && frame.id === `follow-up-${round}`,
    );
    assert.ok(result, "exact prompt result");
    const ended = await native.wait(
      (frame) =>
        frame.type === "message_end" &&
        frame.message?.role === "assistant" &&
        frame.message.stopReason === "stop",
    );
    const text = ended.message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
    assert.equal(text, marker, "original CLI context recalled");
    assert.ok(
      !native.frames.some((frame) => frame.type === "tool_execution_start"),
    );
    native.child.stdin.end();
    await native.exited;
    const saved = (await readFile(file, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const assistant = saved.findLast(
      (entry) => entry.type === "message" && entry.message.role === "assistant",
    );
    assert.equal(
      assistant.message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim(),
      marker,
    );
    rounds.push({
      sameSessionId: true,
      sameSessionFile: true,
      recall: true,
      savedAssistantId: assistant.id,
      textHash: createHash("sha256").update(text).digest("hex"),
    });
  }
  const evidence = {
    cliVersion: version.stdout.trim(),
    sdkVersion: "18.4.6",
    model,
    modelCalls: 3,
    cliSeed: true,
    realIdleCliDetected: true,
    closedCliReleased: true,
    rounds,
    tools: 0,
    result: "passed",
  };
  if (process.env.D_PI_EVIDENCE_PATH)
    await writeFile(
      process.env.D_PI_EVIDENCE_PATH,
      JSON.stringify(evidence, null, 2) + "\n",
    );
  console.log(JSON.stringify(evidence));
} finally {
  for (const child of children) child.kill("SIGKILL");
  sandbox.cleanup();
}
