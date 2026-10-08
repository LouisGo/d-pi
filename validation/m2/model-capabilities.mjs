import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-model-capabilities-" });
const sdk = resolve("resources/sdk");
const sourceHost = process.env.D_PI_MODEL_HOST_SOURCE === "1";
const scope = join(isolated.root, "node_modules", "@oh-my-pi");
mkdirSync(scope, { recursive: true });
const coding = realpathSync(
  process.env.D_PI_CONFIGURATION_SOURCE === "1"
    ? "node_modules/@oh-my-pi/pi-coding-agent"
    : join(sdk, "node_modules", "@oh-my-pi", "pi-coding-agent"),
);
for (const name of readdirSync(join(coding, ".."))) {
  try {
    symlinkSync(realpathSync(join(coding, "..", name)), join(scope, name));
  } catch {}
}
copyFileSync(
  resolve(
    process.env.D_PI_CONFIGURATION_SOURCE === "1" || sourceHost
      ? "runtime"
      : sdk,
    "model-selection.mjs",
  ),
  join(isolated.root, "model-selection.mjs"),
);
const probe = join(isolated.root, "probe.mjs");
writeFileSync(
  probe,
  `
import assert from 'node:assert/strict';
import {Agent} from '@oh-my-pi/pi-agent-core';
import {AuthStorage} from '@oh-my-pi/pi-ai/auth-storage';
import {getBundledModels,getBundledProviders} from '@oh-my-pi/pi-catalog/models';
import {getSupportedEfforts} from '@oh-my-pi/pi-catalog/model-thinking';
import {ModelRegistry} from '@oh-my-pi/pi-coding-agent/config/model-registry';
import {Settings} from '@oh-my-pi/pi-coding-agent/config/settings';
import {ModelControls} from '@oh-my-pi/pi-coding-agent/session/model-controls';
import {SessionManager} from '@oh-my-pi/pi-coding-agent/session/session-manager';
import {applyModelSelection,thinkingCapabilities} from './model-selection.mjs';
globalThis.fetch=()=>{throw Error('Network forbidden in model capability validation');};
const all=getBundledProviders().flatMap(getBundledModels);
const samples={
 deepseek:all.find(m=>m.provider==='deepseek'&&getSupportedEfforts(m).join(',')==='low,high,max'),
 minimal:all.find(m=>getSupportedEfforts(m).includes('minimal')),
 fixed:all.find(m=>m.reasoning&&!getSupportedEfforts(m).length),
 required:all.find(m=>m.thinking?.requiresEffort),
 plain:all.find(m=>!m.reasoning)
};
for(const [kind,model] of Object.entries(samples))assert.ok(model,'official catalog sample '+kind);
assert.deepEqual(thinkingCapabilities(samples.deepseek).efforts,['low','high','max']);
assert.ok(thinkingCapabilities(samples.minimal).efforts.includes('minimal'));
assert.equal(thinkingCapabilities(samples.fixed).adjustable,false);
assert.equal(thinkingCapabilities(samples.required).requiresEffort,true);
assert.equal(thinkingCapabilities(samples.plain).adjustable,false);
const auth=await AuthStorage.create(':memory:');
try{
 for(const model of Object.values(samples))auth.keys.setRuntime(model.provider,'isolated-runtime-fixture');
 const settings=Settings.isolated();const registry=new ModelRegistry(auth,process.env.PI_CODING_AGENT_DIR+'/models.json',{settings,cacheDbPath:':memory:',fetch:globalThis.fetch});
 const agent=new Agent();const manager=SessionManager.inMemory();
 const controls=new ModelControls({agent,settings,modelRegistry:registry,sessionManager:manager,providerSessionState:new Map(),model:()=>agent.state.model,sessionId:()=>manager.getSessionId(),promptGeneration:()=>0,resolveActiveEditMode:()=> 'replace',syncAfterModelChange:async()=>{},setModelWithProviderSessionReset:async model=>agent.setModel(model),clearActiveRetryFallback:()=>{},clearInheritedProviderPromptCacheKey:()=>{},magicKeywordEnabled:()=>false,emit:()=>{},emitSessionEvent:async()=>{},emitNotice:()=>{}},{});
 const session={settings,modelRegistry:registry,get model(){return agent.state.model;},get thinkingLevel(){return controls.thinkingLevel;},setModelTemporary:(...args)=>controls.setModelTemporary(...args),setThinkingLevel:(...args)=>controls.setThinkingLevel(...args)};
 const choose=(model,thinking)=>applyModelSelection(session,{provider:model.provider,modelId:model.id,thinking});
 await choose(samples.minimal,{kind:'effort',effort:'minimal'});assert.equal(controls.thinkingLevel,'minimal');assert.equal(agent.state.disableReasoning,false);
 await choose(samples.minimal,{kind:'default'});assert.equal(controls.thinkingLevel,'minimal','native default preserves effective effort without model default');
 const off=await choose(samples.minimal,{kind:'off'});assert.equal(agent.state.disableReasoning,true,'explicit off must disable native provider reasoning');assert.equal(off.thinkingLevel,'off');
 await choose(samples.deepseek,{kind:'effort',effort:'high'});assert.equal(controls.thinkingLevel,'high');assert.equal(agent.state.thinkingLevel,'high');assert.equal(agent.state.disableReasoning,false);
 const required=await choose(samples.required,{kind:'default'});assert.equal(required.thinkingLevel,samples.required.thinking.defaultLevel);
 await assert.rejects(choose(samples.required,{kind:'off'}));
 await assert.rejects(choose(samples.deepseek,{kind:'effort',effort:'minimal'}));
 await choose(samples.fixed,{kind:'default'});assert.equal(controls.thinkingLevel,undefined);await assert.rejects(choose(samples.fixed,{kind:'off'}));
 const plain=await choose(samples.plain,{kind:'default'});assert.equal(plain.thinkingLevel,'inherit');assert.equal(agent.state.thinkingLevel,undefined);
 console.log(JSON.stringify({sdkVersion:JSON.parse(await Bun.file(new URL('./node_modules/@oh-my-pi/pi-coding-agent/package.json',import.meta.url)).text()).version,samples:Object.fromEntries(Object.entries(samples).map(([kind,model])=>[kind,{provider:model.provider,id:model.id,thinking:thinkingCapabilities(model)}])),checks:['official metadata five categories','distinct default/off/effort through native ModelControls','native Agent reasoning disabled only by explicit off','required and invalid efforts rejected','native actual level readback'],realSupplierRequests:0}));
}finally{auth.close();}
`,
);
const result = spawnSync(join(sdk, "bun"), [probe], {
  cwd: isolated.cwd,
  env: { ...isolated.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
  timeout: 30000,
});
assert.equal(result.status, 0, result.stderr);
const evidence = JSON.parse(result.stdout.trim());
if (process.env.D_PI_CONFIGURATION_SOURCE !== "1") {
  let hostEntry = join(sdk, "host.mjs");
  if (sourceHost) {
    copyFileSync(resolve("runtime/host.mjs"), join(isolated.root, "host.mjs"));
    for (const name of [
      "image-input.mjs",
      "image-compression.mjs",
      "native-queue.mjs",
      "native-subagent-configuration.mjs",
      "reading-session.mjs",
      "pdf-content.mjs",
    ])
      copyFileSync(resolve("runtime", name), join(isolated.root, name));
    copyFileSync(join(sdk, "gate.js"), join(isolated.root, "gate.js"));
    hostEntry = join(isolated.root, "host.mjs");
  }
  const providers = Object.fromEntries(
    Object.values(evidence.samples).map((model) => [
      model.provider,
      { apiKey: "isolated-runtime-fixture" },
    ]),
  );
  providers.fixture = {
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:9/v1",
    apiKey: "fixture",
    models: [
      {
        id: "start",
        name: "Start",
        reasoning: false,
        input: ["text"],
        contextWindow: 1000,
        maxTokens: 100,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  };
  writeFileSync(
    join(isolated.config, "models.yml"),
    JSON.stringify({ providers }),
  );
  writeFileSync(
    join(isolated.config, "config.yml"),
    JSON.stringify({
      modelRoles: { default: "fixture/start", smol: "fixture/start" },
      autolearn: { enabled: false },
    }),
  );
  const guard = join(isolated.root, "network-forbidden.mjs");
  writeFileSync(
    guard,
    "globalThis.fetch=()=>{throw Error('Network forbidden during model Host validation');};",
  );
  const child = spawn(join(sdk, "bun"), ["--preload", guard, hostEntry], {
    cwd: isolated.cwd,
    env: { ...isolated.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const frames = [];
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => frames.push(JSON.parse(line)));
  const wait = async (predicate) => {
    const start = Date.now();
    while (!predicate()) {
      if (child.exitCode !== null || Date.now() - start > 30000)
        throw Error("Host timeout/exit " + child.exitCode + ": " + stderr);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  const request = async (type, fields = {}) => {
    const id = crypto.randomUUID();
    child.stdin.write(JSON.stringify({ type, id, ...fields }) + "\n");
    await wait(() =>
      frames.some((frame) => frame.type === "response" && frame.id === id),
    );
    return frames.find((frame) => frame.type === "response" && frame.id === id);
  };
  const select = async (sample, thinking, expected) => {
    const reply = await request("d_pi_model", {
      provider: sample.provider,
      modelId: sample.id,
      thinking,
    });
    assert.equal(reply.success, true, JSON.stringify(reply));
    assert.equal(reply.data.thinkingLevel, expected);
    const state = await request("get_state");
    assert.equal(state.success, true);
    assert.equal(state.data.model.provider, sample.provider);
    assert.equal(state.data.model.id, sample.id);
    assert.equal(state.data.thinkingLevel ?? "inherit", expected);
  };
  try {
    await wait(() => frames.some((frame) => frame.type === "ready"));
    await select(
      evidence.samples.minimal,
      { kind: "effort", effort: "minimal" },
      "minimal",
    );
    await select(evidence.samples.minimal, { kind: "default" }, "minimal");
    await select(evidence.samples.minimal, { kind: "off" }, "off");
    await select(
      evidence.samples.deepseek,
      { kind: "effort", effort: "high" },
      "high",
    );
    await select(
      evidence.samples.required,
      { kind: "default" },
      evidence.samples.required.thinking.defaultLevel,
    );
    assert.equal(
      (
        await request("d_pi_model", {
          provider: evidence.samples.required.provider,
          modelId: evidence.samples.required.id,
          thinking: { kind: "off" },
        })
      ).success,
      false,
    );
    await select(evidence.samples.fixed, { kind: "default" }, "inherit");
    await select(evidence.samples.plain, { kind: "default" }, "inherit");
    evidence.checks.push(
      `${sourceHost ? "worktree Host against packaged SDK" : "packaged Host"} d_pi_model result agrees with native get_state for five categories`,
    );
  } finally {
    try {
      await request("d_pi_close");
    } catch {}
    child.kill();
    lines.close();
    await new Promise((resolve) =>
      child.exitCode !== null ? resolve() : child.once("close", resolve),
    );
  }
}
if (process.argv[2]) {
  const output = resolve(process.argv[2]);
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
}
console.log(JSON.stringify(evidence));
