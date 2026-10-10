import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

// Fixed official SDK with isolated configuration; no prompt, network model, or user credentials.
const sandbox = createTestEnvironment({ prefix: "d-pi-sdk-cold-resume-" });
const sdk = resolve(process.env.SDK_ROOT ?? "resources/sdk");
const children = new Set();
try {
  const packageMetadata = JSON.parse(
    await readFile(
      join(sdk, "node_modules/@oh-my-pi/pi-coding-agent/package.json"),
      "utf8",
    ),
  );
  assert.equal(packageMetadata.version, "18.8.7");
  await writeFile(
    join(sandbox.config, "models.yml"),
    JSON.stringify({
      providers: {
        fixture: {
          baseUrl: "http://127.0.0.1:1/v1",
          apiKey: "fixture",
          api: "openai-completions",
          models: [
            {
              id: "fixture",
              name: "fixture",
              reasoning: false,
              input: ["text"],
              contextWindow: 128000,
              maxTokens: 1024,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        },
      },
    }),
  );
  await writeFile(
    join(sandbox.config, "config.yml"),
    JSON.stringify({
      autolearn: { enabled: false },
      compaction: { enabled: false },
      modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
    }),
  );
  const manager = join(
    sdk,
    "node_modules/@oh-my-pi/pi-coding-agent/src/session/session-manager.ts",
  );
  const seed = spawnSync(
    join(sdk, "bun"),
    [
      "-e",
      `const {SessionManager}=await import(${JSON.stringify(manager)});const m=SessionManager.create(process.cwd(),process.env.PI_CODING_AGENT_SESSION_DIR);m.appendModelChange("fixture/fixture");m.appendMessage({role:'user',content:'remember blue heron 7',timestamp:1});m.appendMessage({role:'assistant',content:[{type:'text',text:'saved answer'}],api:'openai-completions',provider:'fixture',model:'fixture',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:2});await m.close(); console.log(JSON.stringify({sessionFile:m.getSessionFile(),sessionId:m.getSessionId()}));`,
    ],
    { cwd: sandbox.cwd, env: sandbox.env, encoding: "utf8", timeout: 15000 },
  );
  assert.equal(seed.status, 0, seed.stderr);
  const binding = JSON.parse(seed.stdout.trim());
  const initial = await readFile(binding.sessionFile, "utf8");
  async function run(bindingOverride, inspect = true, selection) {
    const child = spawn(join(sdk, "bun"), [join(sdk, "host.mjs")], {
      cwd: sandbox.cwd,
      env: {
        ...sandbox.env,
        D_PI_RESUME_SESSION: JSON.stringify(bindingOverride),
        ...(selection
          ? { D_PI_MODEL_SELECTION: JSON.stringify(selection) }
          : {}),
      },
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
    const waitFor = async (predicate) => {
      for (let i = 0; i < 300; i++) {
        const found = frames.find(predicate);
        if (found) return found;
        if (child.exitCode !== null)
          throw Error(`SDK exited ${child.exitCode}: ${stderr}`);
        await new Promise((r) => setTimeout(r, 25));
      }
      throw Error(`SDK response timeout: ${stderr}`);
    };
    const exited = new Promise((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    if (!inspect) {
      child.stdin.end();
      return { code: await exited, frames };
    }
    child.stdin.write(
      JSON.stringify({ type: "get_state", id: "state" }) + "\n",
    );
    const state = await waitFor(
      (f) => f.type === "response" && f.id === "state",
    );
    child.stdin.write(
      JSON.stringify({
        type: "get_messages_page",
        id: "messages",
        limit: 100,
      }) + "\n",
    );
    const messages = await waitFor(
      (f) => f.type === "response" && f.id === "messages",
    );
    child.stdin.end();
    const code = await exited;
    children.delete(child);
    return { state, messages, frames, code };
  }
  const fresh = await run(null);
  assert.equal(
    fresh.code,
    0,
    "closing stdin exits the real RPC session cleanly",
  );
  assert.equal(fresh.state.success, true);
  assert.equal(fresh.messages.data.totalMessages, 0);
  const emptyBinding = {
    sessionId: fresh.state.data.sessionId,
    sessionFile: await realpath(fresh.state.data.sessionFile),
  };
  const emptyJournal = await readFile(emptyBinding.sessionFile, "utf8");
  const coldEmpty = await run(emptyBinding);
  assert.equal(coldEmpty.state.data.sessionId, emptyBinding.sessionId);
  assert.equal(
    await realpath(coldEmpty.state.data.sessionFile),
    emptyBinding.sessionFile,
  );
  assert.equal(coldEmpty.messages.data.totalMessages, 0);
  assert.ok(
    (await readFile(emptyBinding.sessionFile, "utf8")).startsWith(emptyJournal),
  );
  const restored = await run(binding);
  assert.equal(restored.code, 0, "resumed RPC session exits cleanly");
  assert.equal(restored.state.success, true);
  assert.equal(restored.state.data.sessionId, binding.sessionId);
  assert.equal(
    await realpath(restored.state.data.sessionFile),
    binding.sessionFile,
  );
  assert.deepEqual(
    restored.messages.data.messages.map((m) => m.role),
    ["user", "assistant"],
  );
  assert.equal(
    restored.messages.data.messages[1].content[0].text,
    "saved answer",
  );
  assert.ok(
    !restored.frames.some(
      (f) => f.type === "prompt_result" || f.type === "agent_start",
    ),
  );
  const roleSeed = spawnSync(
    join(sdk, "bun"),
    [
      "-e",
      `const {SessionManager}=await import(${JSON.stringify(manager)});const m=SessionManager.create(process.cwd(),process.env.PI_CODING_AGENT_SESSION_DIR);m.appendModelChange('fixture/fixture');m.appendMessage({role:'user',content:'saved role history',timestamp:1});m.appendModelChange('fixture/missing-role','advisor');await m.ensureOnDisk();await m.close();console.log(JSON.stringify({sessionFile:m.getSessionFile(),sessionId:m.getSessionId()}));`,
    ],
    { cwd: sandbox.cwd, env: sandbox.env, encoding: "utf8", timeout: 15000 },
  );
  assert.equal(roleSeed.status, 0, roleSeed.stderr);
  const roleBinding = JSON.parse(roleSeed.stdout.trim());
  const roleJournal = await readFile(roleBinding.sessionFile, "utf8");
  assert.notEqual(
    (await run(roleBinding, false)).code,
    0,
    "missing last role model must not silently substitute saved default",
  );
  assert.ok(
    (await readFile(roleBinding.sessionFile, "utf8")).startsWith(roleJournal),
  );
  const after = await readFile(binding.sessionFile, "utf8");
  assert.ok(after.startsWith(initial), "resume preserves the prior journal");
  for (const invalid of [
    { ...binding, sessionId: "wrong" },
    { ...binding, sessionFile: join(sandbox.sessions, "missing.jsonl") },
  ]) {
    const rejected = await run(invalid, false);
    assert.notEqual(rejected.code, 0);
    assert.equal(await readFile(binding.sessionFile, "utf8"), after);
  }
  const wrongCwd = join(sandbox.sessions, "wrong-cwd.jsonl");
  const changed = initial.split("\n");
  const headerIndex = changed.findIndex(
    (line) => line && JSON.parse(line).type === "session",
  );
  const header = JSON.parse(changed[headerIndex]);
  header.cwd = sandbox.home;
  changed[headerIndex] = JSON.stringify(header);
  const wrongBody = changed.join("\n");
  await writeFile(wrongCwd, wrongBody);
  assert.notEqual(
    (await run({ ...binding, sessionFile: wrongCwd }, false)).code,
    0,
  );
  assert.equal(await readFile(wrongCwd, "utf8"), wrongBody);
  const empty = join(sandbox.sessions, "empty.jsonl");
  await writeFile(empty, "");
  assert.notEqual(
    (await run({ ...binding, sessionFile: empty }, false)).code,
    0,
  );
  assert.equal(await readFile(empty, "utf8"), "");
  const modelsPath = join(sandbox.config, "models.yml");
  const models = JSON.parse(await readFile(modelsPath, "utf8"));
  models.providers.fixture.models[0].id = "replacement";
  models.providers.fixture.models[0].name = "replacement";
  await writeFile(modelsPath, JSON.stringify(models));
  const settingsPath = join(sandbox.config, "config.yml");
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  settings.modelRoles = {
    default: "fixture/replacement",
    smol: "fixture/replacement",
  };
  await writeFile(settingsPath, JSON.stringify(settings));
  assert.notEqual(
    (await run(binding, false)).code,
    0,
    "missing saved model must refuse fallback",
  );
  assert.equal(await readFile(binding.sessionFile, "utf8"), after);
  const selection = {
    provider: "fixture",
    modelId: "replacement",
    thinking: { kind: "default" },
  };
  const replacement = await run(binding, true, selection);
  assert.equal(replacement.code, 0);
  assert.equal(replacement.state.data.sessionId, binding.sessionId);
  assert.equal(replacement.state.data.sessionFile, binding.sessionFile);
  assert.equal(replacement.state.data.model.id, "replacement");
  assert.equal(replacement.messages.data.totalMessages, 2);
  assert.ok((await readFile(binding.sessionFile, "utf8")).startsWith(after));
  let selectedJournal = await readFile(binding.sessionFile, "utf8");
  async function preservesHistoryOnRejectedSelection() {
    const journal = await readFile(binding.sessionFile, "utf8");
    assert.ok(journal.startsWith(selectedJournal));
    const added = journal.slice(selectedJournal.length).trim();
    for (const line of added ? added.split("\n") : []) {
      const entry = JSON.parse(line);
      assert.equal(entry.type, "custom");
      assert.equal(entry.customType, "session_exit");
    }
    selectedJournal = journal;
  }

  settings.disabledProviders = ["fixture"];
  await writeFile(settingsPath, JSON.stringify(settings));
  assert.notEqual(
    (await run(binding, false)).code,
    0,
    "disabled saved provider must refuse model fallback",
  );
  await preservesHistoryOnRejectedSelection();
  assert.notEqual(
    (await run(binding, false, selection)).code,
    0,
    "disabled selection cannot start execution",
  );
  await preservesHistoryOnRejectedSelection();
  delete settings.disabledProviders;
  settings.enabledModels = ["fixture/other"];
  await writeFile(settingsPath, JSON.stringify(settings));
  assert.notEqual(
    (await run(binding, false, selection)).code,
    0,
    "disabled desktop model cannot start execution",
  );
  await preservesHistoryOnRejectedSelection();
  assert.notEqual(
    (await run(binding, false, { ...selection, modelId: "missing" })).code,
    0,
  );
  await preservesHistoryOnRejectedSelection();
  console.log(
    JSON.stringify({
      sdkVersion: "18.8.7",
      emptySessionColdRestart: true,
      sameSessionId: true,
      sameSessionFile: true,
      savedMessages: restored.messages.data.totalMessages,
      noPromptReplay: true,
      priorJournalPreserved: true,
      rejectedWrongId: true,
      rejectedMissing: true,
      rejectedWrongCwd: true,
      rejectedEmpty: true,
      missingModelRefused: true,
      explicitReplacementSameIdentity: true,
      disabledSelectionRefused: true,
      disabledSavedProviderRefused: true,
      missingRoleModelRefused: true,
      failedResumePreservesJournal: true,
      modelCalls: 0,
    }),
  );
} finally {
  for (const child of children) child.kill("SIGKILL");
  sandbox.cleanup();
}
