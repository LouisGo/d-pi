import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

// Real fixed SDK/native addon. No personal configuration or supplier traffic.
// The sole external request obtains the pinned official grammar asset; the
// actual installer then downloads it from localhost, verifying size and digest.
const sdk = resolve(process.env.SDK_ROOT ?? "resources/sdk");
const sandbox = createTestEnvironment({ prefix: "d-pi-sdk-upgrade-" });
const manifest = JSON.parse(await readFile(join(sdk, "manifest.json"), "utf8"));
assert.equal(manifest.sdkVersion, "18.8.7");
assert.equal(manifest.bunVersion, "1.3.14");
assert.equal(manifest.platform, "darwin-arm64");
const coding = join(sdk, "node_modules/@oh-my-pi/pi-coding-agent/src");
const natives = join(sdk, "node_modules/@oh-my-pi/pi-natives/native/index.js");
const catalog = join(sdk, "node_modules/@oh-my-pi/pi-catalog/src");
const children = new Set();
const sockets = new Set();
const checks = [];
let grammarBytes;
let heldGrammar;
let grammarRequests = 0;
let holdGrammar = false;
let modelCalls = 0;
const server = createServer(async (req, res) => {
  if (req.url.endsWith(".wasm.zst")) {
    grammarRequests++;
    const finish = () => {
      if (!res.destroyed) res.end(grammarBytes);
    };
    if (holdGrammar) heldGrammar = finish;
    else finish();
    return;
  }
  let body = "";
  for await (const bytes of req) body += bytes;
  const request = JSON.parse(body);
  modelCalls++;
  const toolResult = request.messages.some((m) => m.role === "tool");
  const delta = toolResult
    ? { role: "assistant", content: "GRAMMAR_DONE" }
    : {
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "grammar-ast",
            type: "function",
            function: {
              name: "ast_grep",
              arguments: JSON.stringify({
                pat: "println($X)",
                path: "fixture.kt",
                lang: "kotlin",
              }),
            },
          },
        ],
      };
  const frame = (delta, reason) => ({
    id: "fixture",
    object: "chat.completion.chunk",
    created: 1,
    model: request.model,
    choices: [{ index: 0, delta, finish_reason: reason }],
  });
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.write(`data: ${JSON.stringify(frame(delta, null))}\n\n`);
  res.write(
    `data: ${JSON.stringify(frame({}, toolResult ? "stop" : "tool_calls"))}\n\n`,
  );
  res.end("data: [DONE]\n\n");
});
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
const base = `http://127.0.0.1:${server.address().port}`;
async function probe(source, nativeDirectory, url = base) {
  const child = spawn(join(sdk, "bun"), ["--eval", source], {
    cwd: sandbox.cwd,
    env: {
      ...sandbox.env,
      PI_NATIVES_DIR: nativeDirectory,
      PI_GRAMMARS_URL: url,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  let output = "",
    errors = "";
  child.stdout.on("data", (b) => {
    output += b;
  });
  child.stderr.on("data", (b) => {
    errors = (errors + b).slice(-4000);
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 75000);
  try {
    const code = await new Promise((accept) => child.once("exit", accept));
    assert.equal(code, 0, errors + output);
    return JSON.parse(output.trim().split("\n").at(-1));
  } finally {
    clearTimeout(timer);
    children.delete(child);
  }
}
const nativeImport = `const n = await import(${JSON.stringify(natives)});`;
const grammarImport = `const g = await import(${JSON.stringify(join(coding, "utils/grammars.ts"))});`;
try {
  const nativeDir = join(sandbox.root, "natives-online");
  const info = await probe(
    `${nativeImport} console.log(JSON.stringify(n.wasmGrammarFor({lang:'kotlin'})));`,
    nativeDir,
  );
  assert.equal(info.installed, false);
  const assetUrl = `https://github.com/stencil-hq/wasm-grammars/releases/download/${info.release}/${info.file}.zst`;
  const asset = await fetch(assetUrl, { signal: AbortSignal.timeout(30000) });
  assert.equal(asset.ok, true, `Pinned grammar asset ${asset.status}`);
  grammarBytes = Buffer.from(await asset.arrayBuffer());
  await writeFile(
    join(sandbox.cwd, "fixture.kt"),
    'fun hello() { println("hello") }\n',
  );
  const astProbe = `${nativeImport}${grammarImport}
    const assert = (await import('node:assert/strict')).default;
    assert.equal(await g.ensureGrammar({lang:'kotlin'}),true);
    const result = await n.astGrep({patterns:['println($X)'],lang:'kotlin',path:'fixture.kt'});
    assert.equal(result.matches.length,1); assert.ok(!result.missingGrammars?.length);
    console.log(JSON.stringify({installed:n.wasmGrammarFor({lang:'kotlin'}).installed,matches:result.matches.length}));`;
  assert.equal((await probe(astProbe, nativeDir)).installed, true);
  assert.equal(grammarRequests, 1);
  await probe(astProbe, nativeDir, "http://127.0.0.1:1");
  assert.equal(grammarRequests, 1, "cached offline parse must not download");
  const offline = await probe(
    `${nativeImport}${grammarImport}
    const assert = (await import('node:assert/strict')).default;
    assert.equal(await g.ensureGrammar({lang:'kotlin'}),false);
    const result = await n.astGrep({patterns:['println($X)'],lang:'kotlin',path:'fixture.kt'});
    assert.ok(result.missingGrammars.includes('kotlin'));
    console.log(JSON.stringify({missing:result.missingGrammars,note:g.missingGrammarsNote(result.missingGrammars)}));`,
    join(sandbox.root, "natives-offline"),
    "http://127.0.0.1:1",
  );
  checks.push({
    grammar: {
      info,
      assetUrl,
      firstDownload: true,
      cachedOffline: true,
      firstOffline: offline,
    },
  });

  // The official binary exercises cache validation and the new UTF-8 snapshot
  // budget. These are SDK paths, without inventing an App cache or edit engine.
  const nativeChecks = await probe(
    `${nativeImport}
    const assert = (await import('node:assert/strict')).default;
    const {buildModel} = await import(${JSON.stringify(join(catalog, "build.ts"))});
    const cache = await import(${JSON.stringify(join(catalog, "model-cache.ts"))});
    const good = buildModel({provider:'fixture',id:'good',api:'openai-completions',baseUrl:'http://127.0.0.1:1',name:'good',reasoning:false,input:['text'],contextWindow:1000,maxTokens:100,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}});
    cache.writeModelCache('fixture',Date.now(),[good,{...good,id:'bad',contextWindow:'broken'}],true,'fingerprint');
    const a = cache.readModelCache('fixture',100000,Date.now);
    const b = cache.readModelCache('fixture',100000,Date.now);
    assert.deepEqual(a.models.map(m=>m.id),['good']); assert.equal(a.models[0],b.models[0]);
    const store = new n.EditStore(); const path = process.cwd()+'/edit.txt';
    const old = store.recordSnapshot(path,'旧😀\\r\\nnext\\n',[1,2]);
    store.recordSnapshot(path,'新😀\\r\\nnext\\n',[1,2]);
    assert.equal(store.byHashText(path,old),'旧😀\\nnext\\n');
    assert.deepEqual(store.seenLines(path,old),[1,2]);
    const text='汉😀'.repeat(300000); const tags=[];
    for(let i=0;i<40;i++) tags.push(store.recordSnapshot(process.cwd()+'/large-'+i,text));
    assert.equal(store.byHashText(process.cwd()+'/large-0',tags[0]),null);
    assert.equal(store.headText(process.cwd()+'/large-39'),text);
    store.clear(); assert.equal(store.headText(process.cwd()+'/large-39'),null);
    cache.closeModelCache();
    console.log(JSON.stringify({badModelExcluded:true,goodModelObjectReused:true,priorUnicodeSnapshotRecovered:true,utf8BudgetEvictsOldest:true,newestSnapshotRetained:true,clear:true}));`,
    nativeDir,
  );
  checks.push(nativeChecks);

  // A real Host/model/tool request enters the official grammar downloader.
  await writeFile(
    join(sandbox.config, "models.yml"),
    JSON.stringify({
      providers: {
        fixture: {
          baseUrl: `${base}/v1`,
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
      modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
      autolearn: { enabled: false },
      compaction: { enabled: false },
      astGrep: { enabled: true },
    }),
  );
  holdGrammar = true;
  const child = spawn(join(sdk, "bun"), [join(sdk, "host.mjs")], {
    cwd: sandbox.cwd,
    env: {
      ...sandbox.env,
      PI_NATIVES_DIR: join(sandbox.root, "natives-stop"),
      PI_GRAMMARS_URL: base,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.add(child);
  const frames = [];
  let errors = "";
  child.stderr.on("data", (b) => {
    errors = (errors + b).slice(-4000);
  });
  createInterface({ input: child.stdout }).on("line", (line) =>
    frames.push(JSON.parse(line)),
  );
  async function wait(predicate) {
    const until = Date.now() + 30000;
    while (!predicate()) {
      if (child.exitCode !== null || Date.now() > until)
        throw Error(
          `Host exited/timed out: ${errors} ${JSON.stringify(frames.slice(-3))}`,
        );
      await new Promise((accept) => setTimeout(accept, 20));
    }
  }
  function send(type, fields = {}) {
    const id = crypto.randomUUID();
    child.stdin.write(JSON.stringify({ type, id, ...fields }) + "\n");
    return id;
  }
  const reply = (id) =>
    frames.find((f) => f.type === "response" && f.id === id);
  await wait(() => frames.some((f) => f.type === "ready"));
  const prompt = send("prompt", {
    message: "Search fixture.kt with ast_grep.",
  });
  await wait(() => heldGrammar);
  const stopAt = Date.now();
  const stop = send("d_pi_stop");
  await wait(() =>
    frames.some(
      (f) =>
        f.type === "d_pi_control_state" && f.data.paused && f.data.stopping,
    ),
  );
  await new Promise((accept) => setTimeout(accept, 350));
  await wait(() => reply(stop));
  assert.equal(reply(stop).success, true);
  await wait(() =>
    frames.some((f) => f.type === "prompt_result" && f.id === prompt),
  );
  assert.equal(
    frames.find((f) => f.type === "prompt_result" && f.id === prompt).status,
    "aborted",
  );
  // Native tool cancellation races the execution against AbortSignal; the
  // download itself has no caller signal and remains live after prompt settle.
  const stopElapsedMs = Date.now() - stopAt;
  assert.equal(modelCalls, 1);
  const beforeRelease = await probe(
    `${nativeImport} console.log(JSON.stringify(n.wasmGrammarFor({lang:'kotlin'})));`,
    join(sandbox.root, "natives-stop"),
  );
  assert.equal(beforeRelease.installed, false);
  heldGrammar();
  await new Promise((accept) => setTimeout(accept, 500));
  const afterRelease = await probe(
    `${nativeImport} console.log(JSON.stringify(n.wasmGrammarFor({lang:'kotlin'})));`,
    join(sandbox.root, "natives-stop"),
  );
  assert.equal(afterRelease.installed, true);
  await new Promise((accept) => setTimeout(accept, 200));
  assert.equal(
    modelCalls,
    1,
    "Stop must not invoke a new model or retry after download",
  );
  checks.push({
    grammarStop: {
      downloadOutlivedStop: true,
      installedAfterRelease: true,
      stopElapsedMs,
      promptAborted: true,
      modelCalls,
    },
  });
  const close = send("d_pi_close");
  await wait(() => reply(close));
  child.stdin.end();
  await new Promise((accept) =>
    child.exitCode !== null ? accept() : child.once("exit", accept),
  );
  children.delete(child);
  const result = {
    sdkVersion: manifest.sdkVersion,
    bunVersion: manifest.bunVersion,
    platform: manifest.platform,
    sdkRoot: sdk,
    checks,
    limits: [
      "Stop aborts execution, but grammar transfer continues until completion or upstream 60-second timeout; caller AbortSignal is not wired",
      "Kotlin ast_grep covered; TTSR and read summaries are separate consumers",
      "No real OAuth or Claude account tested",
    ],
  };
  if (process.argv[2]) {
    const path = resolve(process.argv[2]);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, JSON.stringify(result, null, 2) + "\n");
  }
  console.log(JSON.stringify(result));
} finally {
  heldGrammar?.();
  await Promise.all(
    [...children].map(async (child) => {
      if (child.exitCode !== null) return;
      const exited = new Promise((accept) => child.once("exit", accept));
      child.kill("SIGKILL");
      await exited;
    }),
  );
  for (const socket of sockets) socket.destroy();
  server.close();
  sandbox.cleanup();
}
