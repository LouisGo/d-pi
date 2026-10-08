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
  resolve(
    process.env.D_PI_MODEL_SELECTION_SOURCE ?? "runtime/model-selection.mjs",
  ),
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
import {cfgDisabledProviders} from '@oh-my-pi/pi-coding-agent/config/model-settings';
import {ModelRegistry} from '@oh-my-pi/pi-coding-agent/config/model-registry';
import {Settings} from '@oh-my-pi/pi-coding-agent/config/settings';
import {ModelControls} from '@oh-my-pi/pi-coding-agent/session/model-controls';
import {SessionManager} from '@oh-my-pi/pi-coding-agent/session/session-manager';
const {applyModelSelection,captureCurrentModelConfiguration,ensureCurrentModelConfiguration}=await import('./model-selection.mjs');
globalThis.fetch=()=>{throw Error('Network forbidden in live native configuration validation');};
const config=process.env.PI_CODING_AGENT_DIR;
const path=join(config,'models.yml');
const marker=join(config,'helper-ran');
const spec=(id,baseUrl='http://127.0.0.1:9/v1')=>({id,name:id,api:'openai-completions',baseUrl,reasoning:false,input:['text'],contextWindow:1000,maxTokens:100,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}});
const save=(models,headers)=>writeFileSync(path,JSON.stringify({providers:{fixture:{auth:'oauth',api:'openai-completions',baseUrl:'http://127.0.0.1:9/v1',models,...(headers?{headers}:{})},openai:{api:'openai-completions',baseUrl:'http://127.0.0.1:9/v1',apiKey:'!touch '+marker,models:[spec('unrelated')]}}}));
save([spec('start')]);
writeFileSync(join(config,'config.yml'),JSON.stringify({modelRoles:{default:'fixture/start'},autolearn:{enabled:false}}));
const settings=await Settings.loadIsolated({cwd:process.cwd()});
const auth=await AuthStorage.create(join(config,'agent.db'));
const writer=await AuthStorage.create(join(config,'agent.db'));
try {
 const checks=[];
 const registry=new ModelRegistry(auth,path,{settings,cacheDbPath:join(config,'models.db'),fetch:globalThis.fetch});
 // Match the native AgentSession policy listener: reload itself starts discovery.
 cfgDisabledProviders.listen(settings,()=>registry.reapplyModelPolicies());
 const createSession=registry=>{
 const agent=new Agent();const manager=SessionManager.inMemory();
 const controls=new ModelControls({agent,settings,modelRegistry:registry,sessionManager:manager,providerSessionState:new Map(),model:()=>agent.state.model,sessionId:()=>manager.getSessionId(),promptGeneration:()=>0,resolveActiveEditMode:()=> 'replace',syncAfterModelChange:async()=>{},setModelWithProviderSessionReset:async model=>agent.setModel(model),clearActiveRetryFallback:()=>{},clearInheritedProviderPromptCacheKey:()=>{},magicKeywordEnabled:()=>false,emit:()=>{},emitSessionEvent:async()=>{},emitNotice:()=>{}},{});
 return {settings,modelRegistry:registry,get model(){return agent.state.model;},get thinkingLevel(){return controls.thinkingLevel;},setModelTemporary:(...args)=>controls.setModelTemporary(...args),resolveRoleModel:(...args)=>controls.resolveRoleModel(...args)};
 };
 const session=createSession(registry);
 const choose=(id)=>applyModelSelection(session,{provider:'fixture',modelId:id,thinking:{kind:'default'}});
 await assert.rejects(choose('start'));
 await writer.credentials.upsert('fixture',{type:'api_key',key:'isolated-only'});
 await choose('start');assert.equal(session.model.id,'start','new native credentials must work without restarting Host');
 save([spec('start'),spec('added')]);await choose('added');assert.equal(session.model.id,'added','new custom model must be discoverable in existing Host');
 if(process.env.D_PI_LIVE_MODEL_GUARD_CASE!=='lazy'){
 await choose('start');
 const desktopA=session.model;const nativeB=registry.find('fixture','added');
 await session.setModelTemporary(nativeB,undefined,{ephemeral:true});
 await ensureCurrentModelConfiguration(session);
 assert.equal(session.model,nativeB,'native ephemeral selection must remain on B');
 await session.setModelTemporary(desktopA,undefined,{ephemeral:true});
 await ensureCurrentModelConfiguration(session);
 assert.equal(session.model,desktopA,'native ephemeral restore must remain on A');
 const nativeStartup=createSession(registry);
 await nativeStartup.setModelTemporary(registry.find('fixture','start'));
 await captureCurrentModelConfiguration(nativeStartup);
 const startupA=nativeStartup.model;const startupB=registry.find('fixture','added');
 await nativeStartup.setModelTemporary(startupB,undefined,{ephemeral:true});
 await ensureCurrentModelConfiguration(nativeStartup);
 await nativeStartup.setModelTemporary(startupA,undefined,{ephemeral:true});
 await ensureCurrentModelConfiguration(nativeStartup);
 for(const mutation of ['endpoint','headers']){
 save([spec('start'),{...spec('added'),headers:{'X-Native':'one'}}]);
 await choose('start');const oldB=registry.find('fixture','added');
 save([spec('start'),{...spec('added',mutation==='endpoint'?'http://127.0.0.1:11/v1':undefined),headers:{'X-Native':mutation==='headers'?'two':'one'}}]);
 await ensureCurrentModelConfiguration(session);
 await session.setModelTemporary(oldB,undefined,{ephemeral:true});
 await assert.rejects(ensureCurrentModelConfiguration(session),/model-configuration-changed/,'old native B must retain its declaration baseline after '+mutation+' edit');
 await choose('start');
 const updatedB=registry.find('fixture','added');
 await session.setModelTemporary(updatedB,undefined,{ephemeral:true});
 await ensureCurrentModelConfiguration(session);
 }
 checks.push('desktop baseline permits native ephemeral A to B and restore','startup baseline permits native ephemeral A to B and restore','old native B endpoint edit requires reselection','old native B deferred header edit requires reselection');
 }
 writeFileSync(join(config,'config.yml'),JSON.stringify({disabledProviders:['fixture'],modelRoles:{default:'fixture/start'},autolearn:{enabled:false}}));
 await assert.rejects(choose('start'));await assert.rejects(ensureCurrentModelConfiguration(session));
 writeFileSync(join(config,'config.yml'),JSON.stringify({enabledModels:['fixture/start'],modelRoles:{default:'fixture/start'},autolearn:{enabled:false}}));
 await assert.rejects(choose('added'));await choose('start');
 writeFileSync(join(config,'config.yml'),JSON.stringify({enabledModels:['fixture/start'],modelRoles:{default:'fixture/start',tiny:'fixture/added'},autolearn:{enabled:false}}));
 await settings.reloadFromDisk();
 const nativeTiny=session.resolveRoleModel('tiny');
 assert.equal(nativeTiny.id,'added','native role can resolve a model excluded from the desktop selector');
 await session.setModelTemporary(nativeTiny,undefined,{ephemeral:true});
 await ensureCurrentModelConfiguration(session);
 assert.equal(session.model,nativeTiny,'native role target must remain executable');
 await assert.rejects(choose('added'),'desktop selection must continue to obey enabledModels');
 await choose('start');
 checks.push('native role executes outside enabledModels while desktop selection remains filtered');
 save([spec('start','http://127.0.0.1:10/v1'),spec('added')]);
 await assert.rejects(ensureCurrentModelConfiguration(session),/model-configuration-changed/);
 await choose('start');await ensureCurrentModelConfiguration(session);
 if(process.env.D_PI_LIVE_MODEL_GUARD_CASE!=='lazy'){
 save([spec('start','http://127.0.0.1:10/v1'),spec('added')],{'X-Selected':'one'});
 await choose('start');
 assert.equal(session.model.headers,undefined,'native config headers are deferred, not present in headers');
 assert.equal(typeof session.model.resolveHeaders,'function');
 save([spec('start','http://127.0.0.1:10/v1'),spec('added')],{'X-Selected':'two'});
 await assert.rejects(ensureCurrentModelConfiguration(session),/model-configuration-changed/,'changed native header closure must require explicit selection');
 await choose('start');await ensureCurrentModelConfiguration(session);
 assert.equal((await registry.resolveModelHeaders(session.model))['X-Selected'],'two');
 const startupSession={settings,modelRegistry:registry,model:registry.find('fixture','start')};
 await captureCurrentModelConfiguration(startupSession);
 save([spec('start','http://127.0.0.1:10/v1'),spec('added')],{'X-Selected':'three'});
 await assert.rejects(ensureCurrentModelConfiguration(startupSession),/model-configuration-changed/,'startup default baseline must precede the first model call');
 const selectedMarker=join(config,'selected-header-helper-ran');
 save([spec('start','http://127.0.0.1:10/v1'),spec('added')],{'X-Selected':'!touch '+selectedMarker});
 await choose('start');await ensureCurrentModelConfiguration(session);
 assert.equal(existsSync(selectedMarker),false,'configuration comparison must not execute the selected command header');
 save([spec('start','http://127.0.0.1:10/v1'),spec('added')],{'X-Selected':'!touch '+selectedMarker+'-changed'});
 await assert.rejects(ensureCurrentModelConfiguration(session),/model-configuration-changed/);
 assert.equal(existsSync(selectedMarker+'-changed'),false);
 await choose('start');
 checks.push('native deferred headers require explicit reselection','startup default baseline precedes first call','selected command headers compared without execution');
 }
 await writer.credentials.remove('fixture');await assert.rejects(ensureCurrentModelConfiguration(session));
 assert.equal(existsSync(marker),false,'offline synchronization must not run unrelated command credentials');
 checks.push('existing Host reads newly saved credentials','existing Host reads added custom models','provider disabled before switch and model call','native enabledModels enforced','edited endpoint requires explicit reselection','removed credential blocks next call','unrelated helper not executed during native settings listener refresh');
 for(const type of ['llama.cpp','lm-studio']){
   const provider='lazy-'+type;
   writeFileSync(path,JSON.stringify({providers:{[provider]:{auth:'none',api:'openai-completions',baseUrl:'http://127.0.0.1:9001/v1',discovery:{type}}}}));
   writeFileSync(join(config,'config.yml'),JSON.stringify({modelRoles:{default:provider+'/lazy-model'},autolearn:{enabled:false}}));
   let window=1000;const requests=[];
   const nativeLocalFetch=async input=>{
     const url=new URL(String(input));
     assert.equal(url.hostname,'127.0.0.1','only fixture local discovery is permitted');
     requests.push(url.pathname);
     const payload=url.pathname==='/props'?{default_generation_settings:{n_ctx:window,params:{n_predict:-1}}}:url.pathname==='/api/v0/models'?{data:[{id:'lazy-model',state:'loaded',loaded_context_length:window,max_context_length:8192}]}:{data:[{id:'lazy-model',meta:{n_ctx:window,n_ctx_train:8192},architecture:{input_modalities:['text']}}]};
     return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
   };
   const lazyRegistry=new ModelRegistry(auth,path,{settings,cacheDbPath:join(config,'models.db'),fetch:nativeLocalFetch});
   await settings.reloadFromDisk();
   await lazyRegistry.reapplyModelPolicies();
   await lazyRegistry.refreshProvider(provider,'online');
   assert.ok(lazyRegistry.find(provider,'lazy-model'),JSON.stringify({type,error:lazyRegistry.getError(),state:lazyRegistry.getProviderDiscoveryState(provider),requests}));
   assert.equal(lazyRegistry.find(provider,'lazy-model').contextWindow,1000,type+' initial native cached metadata');
   window=2000;
   const lazySession=createSession(lazyRegistry);
   await applyModelSelection(lazySession,{provider,modelId:'lazy-model',thinking:{kind:'default'}});
   assert.equal(lazySession.model.contextWindow,2000,type+' native lazy metadata must be applied on selection');
   const selected=lazySession.model;
   const requestCount=requests.length;
   await ensureCurrentModelConfiguration(lazySession);
   assert.equal(lazySession.model,selected,type+' guard must preserve the selected native model object');
   assert.equal(lazySession.model.contextWindow,2000,type+' guard must preserve native live metadata');
   assert.equal(lazyRegistry.find(provider,'lazy-model').contextWindow,1000,type+' offline cache must remain distinct from selected live metadata');
   assert.equal(requests.length,requestCount,type+' guard must not re-probe native lazy metadata');
   await lazySession.setModelTemporary(lazyRegistry.find(provider,'lazy-model'),undefined,{ephemeral:true});
   assert.notEqual(lazySession.model,selected,type+' native lazy refresh creates another model object');
   const nativeSelected=lazySession.model;const nativeRequestCount=requests.length;
   await ensureCurrentModelConfiguration(lazySession);
   assert.equal(lazySession.model,nativeSelected,type+' native lazy clone must remain selected');
   assert.equal(lazySession.model.contextWindow,2000);
   assert.equal(requests.length,nativeRequestCount,type+' clone guard must not discover again');
   checks.push(type+' native lazy context survives offline cache refresh');
   checks.push(type+' native lazy metadata clone retains declaration identity');
 }
 console.log(JSON.stringify({sdkVersion:'18.4.6',checks,redRegressions:{deferredHeaders:'missing expected rejection on c283246',lazyContext:'model-configuration-changed on c283246 despite unchanged configuration',settingsListener:'unrelated credential helper executed from native settings listener on c283246',nativeSwitch:{source:'runtime/model-selection.mjs at 5256af46a25b848f4d6cba89b9a6301ce5fa1bff',validation:'validation/m2/model-configuration-live.mjs official ModelControls ephemeral A to B',command:'node validation/m2/model-configuration-live.mjs /tmp/d-pi-native-model-switch-red.json',result:'exit 1: model-configuration-changed after official ephemeral A to B selection'},nativeRole:{source:'runtime/model-selection.mjs at 7da8934f30731ebbc528027f29091cb46c159e4e',validation:'official ModelControls.resolveRoleModel tiny and ephemeral selection outside enabledModels',result:'exit 1: selected-model-unavailable for native tiny role excluded from desktop selector'}},realSupplierRequests:0}));
} finally {writer.close();auth.close();settings.cancelPendingSaves();}
`,
);
try {
  const result = spawnSync(resolve("resources/sdk/bun"), [probe], {
    cwd: isolated.cwd,
    env: {
      ...isolated.env,
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
      D_PI_LIVE_MODEL_GUARD_CASE: process.env.D_PI_LIVE_MODEL_GUARD_CASE,
    },
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
