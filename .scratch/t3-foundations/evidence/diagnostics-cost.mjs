// Run from the integration checkout: node --expose-gc .scratch/t3-foundations/evidence/diagnostics-cost.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setImmediate } from 'node:timers/promises';
const base = '598323321c8c2ba6eb177097e2042510c3b79d87';
const directory = mkdtempSync(join(tmpdir(), 'd-pi-writer-cost-'));
const original = execFileSync('git', ['show', `${base}:src/platform/main/diagnostics/diagnostics.ts`], {encoding:'utf8'});
writeFileSync(join(directory, 'baseline.ts'), original.replace(
  'import { BUILD_INFO } from "../../../shared/build-info";',
  'const BUILD_INFO = {version:"source",commit:"unbundled",dirty:true,id:"unbundled"};',
));
const bun = resolve('node_modules/.bin/bun');
execFileSync(bun, ['build', join(directory,'baseline.ts'), '--target=node', `--outfile=${join(directory,'baseline.mjs')}`]);
execFileSync(bun, ['build', 'src/platform/main/diagnostics/diagnostics.ts', '--target=node', `--outfile=${join(directory,'current.mjs')}`]);
const baseline = (await import(pathToFileURL(join(directory,'baseline.mjs')).href)).Diagnostics;
const current = (await import(pathToFileURL(join(directory,'current.mjs')).href)).Diagnostics;
const event = {
  traceId: crypto.randomUUID(), requestId: crypto.randomUUID(), connectionId: crypto.randomUUID(),
  threadId: crypto.randomUUID(), operation:'save',stage:'received',durationMs:12.5, code:'storage-unavailable',causeCode:'SQLITE_BUSY',
};
const percentile = (numbers,p) => [...numbers].sort((a,b)=>a-b)[Math.min(numbers.length-1,Math.ceil(numbers.length*p)-1)];
const samples = {off:[],baseline:[],current:[]};
async function sample(mode, index) {
  global.gc?.();
  const initialHeap = process.memoryUsage().heapUsed;
  const Writer = mode === 'baseline' ? baseline : current;
  const writer = mode === 'off' ? null : new Writer(join(directory,`${mode}-${index}`));
  const timings=[];
  let endHeap=initialHeap;
  for (let burst=0;burst<100;burst++) {
    const before=performance.now();
    for(let i=0;i<100;i++) writer?.record(event);
    timings.push(performance.now()-before);
    // Same bursts and cooperative cadence; record() measurements exclude disk flush.
    await writer?.flush();
    if(burst===99) { global.gc?.(); endHeap=process.memoryUsage().heapUsed; }
    await setImmediate();
  }
  const dropped=writer?.dropped ?? 0;
  await writer?.close();
  return {recordBurstMedianMs:percentile(timings,.5),recordBurstP95Ms:percentile(timings,.95),steadyHeapDeltaBytes:endHeap-initialHeap,dropped};
}
try {
  // Warm both JIT paths before collecting; alternate order to limit drift.
  await sample('baseline','warm'); await sample('current','warm');
  for(let i=0;i<5;i++) for(const mode of (i%2 ? ['current','baseline','off'] : ['off','baseline','current']))
    samples[mode].push(await sample(mode,i));
  const medians = Object.fromEntries(Object.entries(samples).map(([mode,rows])=>[mode,{
    burstMedianMs:percentile(rows.map(r=>r.recordBurstMedianMs),.5),
    burstP95Ms:percentile(rows.map(r=>r.recordBurstP95Ms),.5),
    steadyHeapDeltaBytes:percentile(rows.map(r=>r.steadyHeapDeltaBytes),.5),
  }]));
  console.log(JSON.stringify({base,node:process.version,platform:process.platform,arch:process.arch,eventsPerSample:10000,eventsPerBurst:100,runs:5,samples,medians,limits:'Producer-only fixed metadata cost; excludes GUI input, native stream, task completion and full B6 combination acceptance.'},null,2));
} finally { rmSync(directory,{recursive:true,force:true}); }
