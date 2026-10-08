import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-live-model-config-" });
const coding = realpathSync("node_modules/@oh-my-pi/pi-coding-agent");
const scope = join(isolated.root, "node_modules", "@oh-my-pi");
mkdirSync(scope, { recursive: true });
symlinkSync(coding, join(scope, "pi-coding-agent"));
const dependency = (name) => realpathSync(join(coding, "..", name));
for (const name of ["pi-ai", "pi-agent-core", "pi-catalog", "pi-utils"])
  symlinkSync(dependency(name), join(scope, name));
copyFileSync(
  resolve("runtime/model-selection.mjs"),
  join(isolated.root, "model-selection.mjs"),
);
const probe = join(isolated.root, "probe.mjs");
writeFileSync(
  probe,
  `
import assert from 'node:assert/strict';
import {writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {Agent} from '@oh-my-pi/pi-agent-core';
import {AuthStorage} from '@oh-my-pi/pi-ai/auth-storage';
import {ModelRegistry} from '@oh-my-pi/pi-coding-agent/config/model-registry';
import {Settings} from '@oh-my-pi/pi-coding-agent/config/settings';
import {ModelControls} from '@oh-my-pi/pi-coding-agent/session/model-controls';
import {SessionManager} from '@oh-my-pi/pi-coding-agent/session/session-manager';
import {applyModelSelection,ensureCurrentModelConfiguration} from './model-selection.mjs';
globalThis.fetch=()=>{throw Error('Network forbidden in live native configuration validation');};
const config=process.env.PI_CODING_AGENT_DIR;
const path=join(config,'models.yml');
const marker=join(config,'helper-ran');
const spec=(id,baseUrl='http://127.0.0.1:9/v1')=>({id,name:id,api:'openai-completions',baseUrl,reasoning:false,input:['text'],contextWindow:1000,maxTokens:100,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}});
const save=(models)=>writeFileSync(path,JSON.stringify({providers:{fixture:{auth:'oauth',api:'openai-completions',baseUrl:'http://127.0.0.1:9/v1',models},unrelated:{api:'openai-completions',baseUrl:'http://127.0.0.1:9/v1',apiKey:'!touch '+marker,models:[spec('unrelated')]}}}));
save([spec('start')]);
writeFileSync(join(config,'config.yml'),JSON.stringify({modelRoles:{default:'fixture/start'},autolearn:{enabled:false}}));
const settings=await Settings.loadIsolated({cwd:process.cwd()});
const auth=await AuthStorage.create(join(config,'agent.db'));
const writer=await AuthStorage.create(join(config,'agent.db'));
try {
 const registry=new ModelRegistry(auth,path,{settings,cacheDbPath:join(config,'models.db'),fetch:globalThis.fetch});
 const agent=new Agent();const manager=SessionManager.inMemory();
 const controls=new ModelControls({agent,settings,modelRegistry:registry,sessionManager:manager,providerSessionState:new Map(),model:()=>agent.state.model,sessionId:()=>manager.getSessionId(),promptGeneration:()=>0,resolveActiveEditMode:()=> 'replace',syncAfterModelChange:async()=>{},setModelWithProviderSessionReset:async model=>agent.setModel(model),clearActiveRetryFallback:()=>{},clearInheritedProviderPromptCacheKey:()=>{},magicKeywordEnabled:()=>false,emit:()=>{},emitSessionEvent:async()=>{},emitNotice:()=>{}},{});
 const session={settings,modelRegistry:registry,get model(){return agent.state.model;},get thinkingLevel(){return controls.thinkingLevel;},setModelTemporary:(...args)=>controls.setModelTemporary(...args)};
 const choose=(id)=>applyModelSelection(session,{provider:'fixture',modelId:id,thinking:{kind:'default'}});
 await assert.rejects(choose('start'));
 await writer.credentials.upsert('fixture',{type:'api_key',key:'isolated-only'});
 await choose('start');assert.equal(session.model.id,'start','new native credentials must work without restarting Host');
 save([spec('start'),spec('added')]);await choose('added');assert.equal(session.model.id,'added','new custom model must be discoverable in existing Host');
 writeFileSync(join(config,'config.yml'),JSON.stringify({disabledProviders:['fixture'],modelRoles:{default:'fixture/start'},autolearn:{enabled:false}}));
 await assert.rejects(choose('start'));await assert.rejects(ensureCurrentModelConfiguration(session));
 writeFileSync(join(config,'config.yml'),JSON.stringify({enabledModels:['fixture/start'],modelRoles:{default:'fixture/start'},autolearn:{enabled:false}}));
 await assert.rejects(choose('added'));await choose('start');
 save([spec('start','http://127.0.0.1:10/v1'),spec('added')]);
 await assert.rejects(ensureCurrentModelConfiguration(session),/model-configuration-changed/);
 await choose('start');await ensureCurrentModelConfiguration(session);
 await writer.credentials.remove('fixture');await assert.rejects(ensureCurrentModelConfiguration(session));
 assert.equal(existsSync(marker),false,'offline synchronization must not run unrelated command credentials');
 console.log(JSON.stringify({sdkVersion:'18.4.6',checks:['existing Host reads newly saved credentials','existing Host reads added custom models','provider disabled before switch and model call','native enabledModels enforced','edited endpoint requires explicit reselection','removed credential blocks next call','unrelated helper not executed'],realSupplierRequests:0}));
} finally {writer.close();auth.close();settings.cancelPendingSaves();}
`,
);
try {
  const result = spawnSync(resolve("resources/sdk/bun"), [probe], {
    cwd: isolated.cwd,
    env: { ...isolated.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout.trim());
  const output = resolve(
    process.argv[2] ??
      ".scratch/providers-models/evidence/live-model-configuration.json",
  );
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence));
} finally {
  isolated.cleanup();
}
