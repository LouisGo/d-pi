import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { cpus, totalmem } from "node:os";
import { join } from "node:path";
import electron from "electron";
import { createCdpClient } from "./cdp.mjs";
import {
  createLongReadingSupplier,
  prepareLongReadingExtension,
} from "./long-reading.mjs";

const root = process.env.D_PI_PERFORMANCE_ROOT;
assert(root, "Missing owned isolated performance root");
const isolation = JSON.parse(
  readFileSync(join(root, "isolation.json"), "utf8"),
);
const dataset = JSON.parse(readFileSync(join(root, "dataset.json"), "utf8"));
assert.equal(
  dataset.records.reduce((sum, record) => sum + record.messages, 0),
  10000,
);
mkdirSync(join(isolation.config, "extensions"), { recursive: true });
prepareLongReadingExtension(isolation.config);
const long = createLongReadingSupplier();
const requests = [];
const streams = new Map();
const streamFinish = new Map();
// Explicit fixture supplier completion allows the real SDK to emit final/end
// before normal Quit; an aborted stream must not be misreported as settled work.
process.on("SIGUSR2", () => {
  for (const finish of streamFinish.values()) finish();
  writeFileSync(
    join(root, "production-supplier-finish.json"),
    JSON.stringify(
      {
        at: Date.now(),
        supplierPid: process.pid,
        streams: [...streams].map(([key, state]) => ({ key, ...state })),
      },
      null,
      2,
    ),
  );
});
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk.toString();
  const payload = JSON.parse(body);
  const last = payload.messages
    ?.filter((message) => message.role === "user")
    .at(-1);
  const text =
    typeof last?.content === "string"
      ? last.content
      : (last?.content ?? [])
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");
  const summary = {
    at: Date.now(),
    requestBytes: Buffer.byteLength(body),
    messageCount: payload.messages?.length,
    stream: text.match(/PERF_STREAM_[012]/)?.[0] ?? null,
  };
  requests.push(summary);
  if (long.handle(payload, response)) return;
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const frame = (content, finish = null) =>
    `data: ${JSON.stringify({ id: `performance-${requests.length}`, object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { content }, finish_reason: finish }] })}\n\n`;
  if (summary.stream) {
    assert(!streams.has(summary.stream), "Duplicate stream model request");
    const state = {
      chunks: 1,
      contentBytes: 0,
      startedAt: Date.now(),
      endedAt: null,
    };
    streams.set(summary.stream, state);
    const nextText = () =>
      `${summary.stream} chunk ${state.chunks} 中文流式后台 ${createHash("sha256").update(`${summary.stream}:${state.chunks}`).digest("hex")}\n`;
    const firstText = nextText();
    state.contentBytes += Buffer.byteLength(firstText);
    response.write(frame(firstText));
    const timer = setInterval(() => {
      state.chunks++;
      const text = nextText();
      state.contentBytes += Buffer.byteLength(text);
      response.write(frame(text));
    }, 1000);
    streamFinish.set(summary.stream, () => {
      clearInterval(timer);
      response.end(frame("实际流结束", "stop") + "data: [DONE]\n\n");
    });
    response.on("close", () => {
      clearInterval(timer);
      state.endedAt = Date.now();
    });
  } else {
    response.end(
      `${frame("Isolated fixture auxiliary response", "stop")}data: [DONE]\n\n`,
    );
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const modelPort = server.address().port;
const config = JSON.parse(
  readFileSync(join(isolation.config, "models.yml"), "utf8"),
);
config.providers.fixture.baseUrl = `http://127.0.0.1:${modelPort}/v1`;
writeFileSync(join(isolation.config, "models.yml"), JSON.stringify(config));
const portServer = createServer();
await new Promise((done) => portServer.listen(0, "127.0.0.1", done));
const debugPort = portServer.address().port;
await new Promise((done) => portServer.close(done));
const binary = process.env.D_PI_PERFORMANCE_ELECTRON ?? electron;
const entry =
  process.env.D_PI_PERFORMANCE_ENTRY ?? join(root, "out/main/index.js");
if (process.env.D_PI_PERFORMANCE_ELECTRON)
  assert(
    realpathSync(binary).startsWith(`${realpathSync(root)}/`),
    "Fixture binary escaped owned root",
  );
assert(
  realpathSync(entry).startsWith(`${realpathSync(root)}/`),
  "Fixture entry escaped owned root",
);
const application = spawn(
  binary,
  [entry, `--remote-debugging-port=${debugPort}`, "--lang=zh-CN"],
  {
    cwd: isolation.cwd,
    env: { ...isolation.env, D_PI_PERFORMANCE_ROOT: root },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let applicationExited = false;
application.on("exit", (code) => {
  applicationExited = true;
  console.error(`Production Electron exited: ${code}`);
});
application.stdout.on("data", (chunk) => process.stdout.write(chunk));
application.stderr.on("data", (chunk) => process.stderr.write(chunk));
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function wait(check, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    assert(
      !applicationExited,
      "Production application exited during validation",
    );
    const result = await check();
    if (result) return result;
    await pause(100);
  }
  throw Error(`Timeout: ${label}`);
}
const target = await wait(async () => {
  try {
    return (
      await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
    ).find((entry) => entry.type === "page");
  } catch {
    return null;
  }
}, "production renderer CDP");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done) =>
  socket.addEventListener("open", done, { once: true }),
);
const { call } = createCdpClient(socket);
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
await wait(
  () =>
    evaluate(
      "!!window.desktop?.runtime && !!document.querySelector('[contenteditable=true]')",
    ),
  "formal production workspace",
);
await call("Performance.enable");
await evaluate(`window.__productionProbe={views:{}, runtimeEvents:0, inputSamples:[],longTasks:[],visibility:[],composition:[]};
new PerformanceObserver(list=>window.__productionProbe.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
document.addEventListener('visibilitychange',()=>window.__productionProbe.visibility.push({at:Date.now(),state:document.visibilityState}));
document.addEventListener('beforeinput',event=>{if(!event.target.closest('[contenteditable=true]'))return;const start=performance.now();requestAnimationFrame(()=>window.__productionProbe.inputSamples.push({duration:performance.now()-start,type:event.inputType,composition:event.isComposing}));},true);
for(const type of ['compositionstart','compositionupdate','compositionend'])document.addEventListener(type,event=>window.__productionProbe.composition.push({at:Date.now(),type,data:event.data}),true);
true`);
for (const record of dataset.records) {
  await evaluate(
    `window.desktop.runtime.subscribe(view=>{window.__productionProbe.runtimeEvents++;window.__productionProbe.views[view.threadId]=view;},${JSON.stringify(record.threadId)});true`,
  );
  const view = await evaluate(
    `window.desktop.runtime.request({kind:'start',threadId:${JSON.stringify(record.threadId)},traceId:crypto.randomUUID()})`,
  );
  assert.equal(view.kind, "view", JSON.stringify(view));
  await wait(
    () =>
      evaluate(
        `window.__productionProbe.views[${JSON.stringify(record.threadId)}]?.phase==='ready'`,
      ),
    "actual native ready",
  );
}
async function submit(threadId, text) {
  return evaluate(
    `(async()=>{const submissionId=crypto.randomUUID();const prepared=await window.desktop.submission.request({kind:'prepare',threadId:${JSON.stringify(threadId)},submissionId,traceId:crypto.randomUUID(),revision:0,text:${JSON.stringify(text)},origin:'free'});if(prepared.kind!=='receipt')throw Error(JSON.stringify(prepared));return window.desktop.submission.request({kind:'dispatch',threadId:${JSON.stringify(threadId)},submissionId});})()`,
  );
}
const first = dataset.records[0].threadId;
await submit(first, "M2_LONG_TOOL_INPUT");
await wait(
  () =>
    long.requests.some((request) =>
      request.messages.some((message) => message.role === "tool"),
    ) &&
    evaluate(
      `window.__productionProbe.views[${JSON.stringify(first)}]?.control?.streaming===false`,
    ),
  "actual ten MiB native tool settlement",
  60000,
);
// OMP's native wrapper truncates model-facing output and saves the complete
// result as an artifact. Verify that actual file rather than pretending the
// provider or App received ten MiB of inline text.
const nativeFile = dataset.records[0].sessionFile;
const toolEntry = readFileSync(nativeFile, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .findLast(
    (entry) =>
      entry.message?.role === "toolResult" &&
      entry.message.toolName === "m2_long_output",
  );
assert.equal(toolEntry?.message.isError, false);
assert.equal(
  toolEntry.message.details.meta.truncation.totalBytes,
  10 * 1024 * 1024,
);
const artifacts = nativeFile.replace(/\.jsonl$/, "");
const artifactId = toolEntry.message.details.meta.truncation.artifactId;
const artifact = join(
  artifacts,
  readdirSync(artifacts).find((name) => name.startsWith(`${artifactId}.`)),
);
assert.equal(statSync(artifact).size, 10 * 1024 * 1024);
const toolEvidence = {
  inlineNativeBytes: Buffer.byteLength(
    JSON.stringify(toolEntry.message.content),
  ),
  artifactBytes: statSync(artifact).size,
  artifactSha256: createHash("sha256")
    .update(readFileSync(artifact))
    .digest("hex"),
  nativeTruncation: toolEntry.message.details.meta.truncation,
};
console.log("Actual ten MiB tool completed through normal OMP execution");
for (const [index, record] of dataset.records.entries())
  await submit(record.threadId, `PERF_STREAM_${index}`);
await wait(
  () =>
    streams.size === 3 &&
    [...streams.values()].every((state) => state.chunks >= 2),
  "three actual concurrent native streams",
);
await evaluate(
  "document.querySelector('[contenteditable=true]').editor.commands.setContent('');document.querySelector('[contenteditable=true]').focus();true",
);
await call("Input.insertText", {
  text: "中文长输入验证".repeat(3000).slice(0, 20000),
});
await wait(
  () =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.editor?.getText().length>=20000",
    ),
  "twenty thousand character composer",
);
for (let index = 0; index < 60; index++) {
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "x",
    code: "KeyX",
    text: "x",
    unmodifiedText: "x",
    windowsVirtualKeyCode: 88,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "x",
    code: "KeyX",
    windowsVirtualKeyCode: 88,
  });
  await pause(30);
}
const startAt = Date.now();
const report = {
  startAt,
  root,
  applicationPid: application.pid,
  debugPort,
  dataset,
  toolEvidence,
  productionBuild: {
    mainSha256: createHash("sha256")
      .update(readFileSync(join(root, "out/main/index.js")))
      .digest("hex"),
  },
  machine: {
    platform: process.platform,
    architecture: process.arch,
    cpu: cpus()[0].model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
  },
  scope: {
    realProvider: false,
    osIme: false,
    productionEntries: true,
    syntheticHistory: true,
    normalNativeTool: true,
    complete: false,
  },
  samples: [],
};
writeFileSync(
  join(root, "production-probe-ready.json"),
  JSON.stringify(
    {
      applicationPid: application.pid,
      supplierPid: process.pid,
      debugPort,
      startAt,
      target: target.webSocketDebuggerUrl,
    },
    null,
    2,
  ),
);
console.log(
  `Production 30 minute probe started: ${new Date(startAt).toISOString()}`,
);
async function sample() {
  const browser = await evaluate(
    `(()=>{const probe=window.__productionProbe;return {at:Date.now(),visibility:document.visibilityState,domNodes:document.querySelectorAll('*').length,conversationArticles:document.querySelectorAll('.conversation article').length,composerLength:document.querySelector('[contenteditable=true]')?.editor?.getText().length,viewport:{width:innerWidth,height:innerHeight},runtimeEvents:probe.runtimeEvents,views:probe.views,inputSamples:probe.inputSamples,longTasks:probe.longTasks,visibilityEvents:probe.visibility,composition:probe.composition};})()`,
  );
  const metrics = await call("Performance.getMetrics");
  assert(
    [...streams.values()].every((state) => state.endedAt === null),
    "Native stream ended before the full background interval",
  );
  assert(
    Object.values(browser.views).filter((view) => view.control?.streaming)
      .length === 3,
    "Three real native streams must remain active throughout the probe",
  );
  report.samples.push({
    browser,
    metrics: Object.fromEntries(
      metrics.metrics.map(({ name, value }) => [name, value]),
    ),
    streams: Object.fromEntries(
      [...streams].map(([key, value]) => [key, { ...value }]),
    ),
  });
  report.requests = requests;
  writeFileSync(
    join(root, "production-performance-progress.json"),
    JSON.stringify(report, null, 2),
  );
}
await sample();
while (Date.now() - startAt < 30 * 60 * 1000) {
  await pause(30000);
  await sample();
  console.log(
    `Production probe elapsed ${Math.round((Date.now() - startAt) / 1000)}s; streams ${[...streams.values()].map((state) => state.chunks).join("/")}`,
  );
}
report.scope.complete = true;
report.endAt = Date.now();
writeFileSync(
  join(root, "production-performance-progress.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  "30 minute production probe duration completed; application retained for final GUI/IME/cleanup checks",
);
// Keep the model server and application alive until explicit fixture cleanup.
await new Promise(() => {});
