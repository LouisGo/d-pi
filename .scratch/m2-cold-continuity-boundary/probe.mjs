import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTestEnvironment } from '../../scripts/testing/test-environment.mjs';
const sdkRoot = fileURLToPath(new URL('../../resources/sdk/', import.meta.url));
const workerPath = fileURLToPath(new URL('./worker.mjs', import.meta.url));
const isolated = createTestEnvironment({ prefix: 'dpi-cold-lock-probe-' });
const workers = [];
function worker() {
  const child = spawn(sdkRoot + 'bun', [workerPath, sdkRoot + 'node_modules/@oh-my-pi/pi-coding-agent/src/session/session-manager.ts'], { env: isolated.env, cwd: isolated.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  const stderr = [];
  child.stderr.on('data', value => stderr.push(String(value)));
  workers.push(child);
  return { command: async value => { child.stdin.write(JSON.stringify(value) + '\n'); const response = await iterator.next(); if (response.done) throw Error('worker terminated ' + stderr.join('')); return JSON.parse(response.value); } };
}
const summary = { sdkVersion: JSON.parse(readFileSync(sdkRoot + 'manifest.json')).sdkVersion, modelRequests: 0, isolationRoot: isolated.root, scenario: 'A and B stay alive with simultaneously opened managers for the identical original session', observations: [] };
try {
  const seed = worker();
  const created = await seed.command({kind:'seed'});
  summary.observations.push(created, await seed.command({kind:'close'}));
  const a = worker(), b = worker();
  summary.observations.push(await a.command({kind:'open',path:created.sessionFile}), await b.command({kind:'open',path:created.sessionFile}));
  summary.observations.push(await a.command({kind:'append',marker:'live-owner-A'}), await b.command({kind:'append',marker:'live-owner-B'}));
  summary.persistedMarkers = readFileSync(created.sessionFile,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x)).filter(x=>x.type==='custom').map(x=>({id:x.id,parentId:x.parentId,marker:x.customType}));
  summary.observations.push(await a.command({kind:'close'}), await b.command({kind:'close'}));
  summary.twoLiveOwnersOpened = summary.observations.filter(x=>x.kind==='open').length === 2;
  summary.bothOwnersWrote = ['live-owner-A','live-owner-B'].every(marker=>summary.persistedMarkers.some(x=>x.marker===marker));
  writeFileSync(new URL('./evidence/lock-counterexample.json', import.meta.url), JSON.stringify(summary,null,2));
  process.stdout.write(JSON.stringify(summary,null,2)+'\n');
} finally { for (const child of workers) { child.stdin.end(); if (child.exitCode === null) child.kill(); } }
