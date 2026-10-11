import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCdpClient } from "./cdp.mjs";
import { assertProbeRun } from "./production-performance-run-identity.mjs";

const root = process.env.D_PI_PERFORMANCE_ROOT;
assert(root, "Missing owned performance root");
// A reload resets the original page instrumentation. Never destroy an
// unfinished continuous-background sample or change its observation overhead.
assert.equal(
  JSON.parse(readFileSync(join(root, "production-background.json"), "utf8"))
    .completed,
  true,
);
assert.equal(
  JSON.parse(
    readFileSync(join(root, "production-performance-progress.json"), "utf8"),
  ).scope.complete,
  true,
);
const ready = JSON.parse(
  readFileSync(join(root, "production-probe-ready.json"), "utf8"),
);
assertProbeRun(
  JSON.parse(readFileSync(join(root, "production-background.json"))),
  ready,
);
assert.equal(
  JSON.parse(readFileSync(join(root, "production-performance-progress.json")))
    .applicationPid,
  ready.applicationPid,
);
assert.equal(
  JSON.parse(readFileSync(join(root, "production-performance-progress.json")))
    .startAt,
  ready.startAt,
);
const dataset = JSON.parse(readFileSync(join(root, "dataset.json"), "utf8"));
const socket = new WebSocket(ready.target);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
const { call } = createCdpClient(socket);
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
try {
  const previous = await evaluate("window.__productionProbe ?? null");
  writeFileSync(
    join(root, "production-before-rendering-observation.json"),
    JSON.stringify(previous, null, 2),
  );
  await call("Page.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__productionRendering={commits:[],rendererIds:[],composerMutations:0};window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject(){const id=window.__productionRendering.rendererIds.length+1;window.__productionRendering.rendererIds.push(id);return id;},onCommitFiberRoot(id,root){const values=window.__productionRendering.commits;if(values.length<1024)values.push({at:Date.now(),time:performance.now(),visibility:document.visibilityState,id});},onCommitFiberUnmount(){}};`,
  });
  await call("Page.reload");
  const deadline = Date.now() + 30000;
  while (
    !(await evaluate(
      "!!document.querySelector('[contenteditable=true]')?.editor && window.__productionRendering?.commits.length>0",
    ))
  ) {
    assert(
      Date.now() < deadline,
      "Production React did not report real commits",
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await evaluate(
    `window.__productionProbe={views:{},runtimeEvents:0,inputSamples:[],longTasks:[],visibility:[],composition:[]};new PerformanceObserver(list=>window.__productionProbe.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});document.addEventListener('visibilitychange',()=>window.__productionProbe.visibility.push({at:Date.now(),state:document.visibilityState}));document.addEventListener('beforeinput',event=>{if(!event.target.closest('[contenteditable=true]'))return;const start=performance.now();requestAnimationFrame(()=>window.__productionProbe.inputSamples.push({duration:performance.now()-start,type:event.inputType,composition:event.isComposing}));},true);for(const type of ['compositionstart','compositionupdate','compositionend'])document.addEventListener(type,event=>window.__productionProbe.composition.push({at:Date.now(),type,data:event.data}),true);new MutationObserver(records=>window.__productionRendering.composerMutations+=records.length).observe(document.querySelector('[contenteditable=true]'),{subtree:true,childList:true,characterData:true,attributes:true});true`,
  );
  for (const record of dataset.records) {
    await evaluate(
      `window.desktop.runtime.subscribe(view=>{window.__productionProbe.runtimeEvents++;window.__productionProbe.views[view.threadId]=view;},${JSON.stringify(record.threadId)});true`,
    );
    const inspected = await evaluate(
      `window.desktop.runtime.request({kind:'inspect',threadId:${JSON.stringify(record.threadId)},traceId:crypto.randomUUID()})`,
    );
    assert.equal(inspected.kind, "view");
    await evaluate(
      `window.__productionProbe.views[${JSON.stringify(record.threadId)}]=${JSON.stringify(inspected.view)};true`,
    );
    assert.equal(
      inspected.view?.control?.streaming ?? inspected.control?.streaming,
      true,
      JSON.stringify(inspected),
    );
  }
  const before = await evaluate(
    "({at:Date.now(),visibility:document.visibilityState,commits:window.__productionRendering.commits.length,composerMutations:window.__productionRendering.composerMutations,composerLength:document.querySelector('[contenteditable=true]').editor.getText().length,views:window.__productionProbe.views})",
  );
  assert.equal(before.visibility, "visible");
  assert(before.composerLength >= 20000);
  await new Promise((resolve) => setTimeout(resolve, 15000));
  const after = await evaluate(
    "({at:Date.now(),visibility:document.visibilityState,commits:window.__productionRendering.commits.length,composerMutations:window.__productionRendering.composerMutations,composerLength:document.querySelector('[contenteditable=true]').editor.getText().length,views:window.__productionProbe.views})",
  );
  assert.equal(after.visibility, "visible");
  assert.equal(
    after.composerMutations,
    before.composerMutations,
    "Streaming mutated the idle Composer DOM",
  );
  writeFileSync(
    join(root, "production-react-visible.json"),
    JSON.stringify(
      {
        applicationPid: ready.applicationPid,
        sourceRunStartAt: ready.startAt,
        method:
          "actual production React DevTools commit callback, scalar counting only; separate observation after the completed uninstrumented background interval",
        before,
        after,
        commitDelta: after.commits - before.commits,
        composerMutationDelta:
          after.composerMutations - before.composerMutations,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      commits: after.commits - before.commits,
      composerMutations: after.composerMutations - before.composerMutations,
      composerLength: after.composerLength,
    }),
  );
} finally {
  socket.close();
}
