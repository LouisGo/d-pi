import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-m2-package-" });
const source = resolve(
  process.argv[2] ?? "dist/m2-entry-candidate/mac-arm64/d-pi.app",
);
const bundle = join(isolated.root, "Package With Spaces", "d-pi.app");
cpSync(source, bundle, { recursive: true, verbatimSymlinks: true });
const plist = join(bundle, "Contents/Info.plist");
assert.equal(
  spawnSync(
    "/usr/bin/plutil",
    [
      "-replace",
      "CFBundleIdentifier",
      "-string",
      "local.d-pi.m2-validation",
      plist,
    ],
    { env: isolated.env },
  ).status,
  0,
);
const a = randomUUID(),
  workspace = randomUUID();
const db = new DatabaseSync(join(isolated.data, "drafts.sqlite"));
db.exec(
  "CREATE TABLE workspace(id TEXT PRIMARY KEY,directory TEXT NOT NULL UNIQUE,execution_trust TEXT NOT NULL);CREATE TABLE thread(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL);CREATE TABLE desktop(id INTEGER PRIMARY KEY,active_thread TEXT,theme TEXT NOT NULL,density TEXT NOT NULL);PRAGMA user_version=1;",
);
db.prepare("INSERT INTO workspace VALUES(?,?,'browse')").run(
  workspace,
  isolated.cwd,
);
db.prepare("INSERT INTO thread VALUES(?,?,0,'')").run(a, workspace);
db.prepare("INSERT INTO desktop VALUES(1,?,'dark','normal')").run(a);
writeFileSync(join(isolated.cwd, "fixture.txt"), "M2 isolated project\n");
const secondProject = join(isolated.root, "Second Project");
mkdirSync(secondProject);
writeFileSync(join(secondProject, "second.txt"), "Second isolated project\n");
const requests = [];
let held = null;
const sockets = new Set();
const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  assert.equal(req.method, "POST");
  requests.push(JSON.parse(body));
  const frame = (delta, finish) => ({
    id: "fixture",
    object: "chat.completion.chunk",
    created: 1,
    model: requests.at(-1).model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.write(
    `data: ${JSON.stringify(frame({ role: "assistant", content: requests.length === 1 ? "M2_THREAD_A_REPLY" : "M2_THREAD_B_REPLY" }, null))}\n\n`,
  );
  const finish = () => {
    res.write(`data: ${JSON.stringify(frame({}, "stop"))}\n\n`);
    res.end("data: [DONE]\n\n");
  };
  if (requests.length === 1) held = finish;
  else setTimeout(finish, 100);
});
server.on("connection", (s) => {
  sockets.add(s);
  s.on("close", () => sockets.delete(s));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
writeFileSync(
  join(isolated.config, "models.yml"),
  JSON.stringify({
    providers: {
      fixture: {
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        apiKey: "fixture",
        api: "openai-completions",
        models: ["fixture-a", "fixture-b"].map((id) => ({
          id,
          name: id,
          reasoning: id === "fixture-b",
          input: ["text"],
          contextWindow: 128000,
          maxTokens: 1024,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        })),
      },
    },
  }),
);
writeFileSync(
  join(isolated.config, "config.yml"),
  JSON.stringify({
    autolearn: { enabled: false },
    modelRoles: { default: "fixture/fixture-a", smol: "fixture/fixture-a" },
  }),
);
mkdirSync(join(isolated.config, "extensions"));
writeFileSync(
  join(isolated.config, "extensions", "finalized.ts"),
  `export default function(pi){pi.on('assistant_message',event=>({content:event.message.content.map(part=>part.type==='text'?{...part,text:part.text+'_FINALIZED\\n\\n'+Array.from({length:80},(_,i)=>'Reading fixture line '+i).join('\\n\\n')}:part)}));}`,
);
const ports = createServer();
await new Promise((r) => ports.listen(0, "127.0.0.1", r));
const port = ports.address().port;
await new Promise((r) => ports.close(r));
const binary = join(bundle, "Contents/MacOS/d-pi");
function launch() {
  const app = spawn(
    binary,
    ["--lang=zh-CN", `--remote-debugging-port=${port}`],
    { env: isolated.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  app.stdout.resume();
  app.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return app;
}
let child = launch(),
  socket;
let seq = 0;
const pending = new Map();
async function wait(fn, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("M2 package timeout");
}
async function connect() {
  const target = await wait(async () => {
    try {
      return (
        await (
          await fetch(`http://127.0.0.1:${port}/json/list`, {
            signal: AbortSignal.timeout(1000),
          })
        ).json()
      ).find((t) => t.type === "page");
    } catch {
      return null;
    }
  });
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    socket.onopen = r;
    socket.onerror = j;
  });
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const task = pending.get(m.id);
      pending.delete(m.id);
      m.error ? task?.reject(Error(m.error.message)) : task?.resolve(m.result);
    }
  };
  socket.onclose = () => {
    for (const task of pending.values()) task.reject(Error("CDP closed"));
    pending.clear();
  };
}
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const reply = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (reply.exceptionDetails)
    throw Error(JSON.stringify(reply.exceptionDetails));
  return reply.result.value;
}
async function click(text) {
  await wait(() =>
    evaluate(
      `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`,
    ),
  );
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`,
  );
}
async function selectThread(id) {
  if (process.argv.includes("--continuity"))
    await evaluate(`(()=>{
    const shell=document.querySelector('.app-shell');
    const sidebar=document.querySelector('.sidebar');
    const toolbar=document.querySelector('.toolbar');
    const samples=[];
    const sample=()=>{
      samples.push({shell:document.querySelector('.app-shell')===shell && shell.getBoundingClientRect().height>0,sidebar:document.querySelector('.sidebar')===sidebar,toolbar:document.querySelector('.toolbar')===toolbar,workspace:!!document.querySelector('.thread-workspace'),editor:!!document.querySelector('.tiptap')});
    };
    let running=true;
    const frame=()=>{if(running){sample();requestAnimationFrame(frame);}};
    requestAnimationFrame(frame);
    const observer=new MutationObserver(sample);
    observer.observe(document.getElementById('root'),{subtree:true,childList:true,attributes:true,attributeFilter:['style']});
    window.__continuityStop=()=>{running=false;observer.disconnect();return samples;};
    return true;
  })()`);
  await wait(() =>
    evaluate(
      `!!document.querySelector('.thread-navigation button[title$="${id}"]')`,
    ),
  );
  await evaluate(
    `document.querySelector('.thread-navigation button[title$="${id}"]').click()`,
  );
  await wait(
    () =>
      db.prepare("SELECT active_thread FROM desktop").get().active_thread ===
      id,
  );
  await wait(() =>
    evaluate(
      `document.querySelector('.thread-navigation button[aria-current=page]')?.title.endsWith('${id}')`,
    ),
  );
  if (process.argv.includes("--continuity")) {
    await evaluate(
      "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
    );
    const samples = await evaluate("window.__continuityStop()");
    continuitySamples.push({ threadId: id, samples });
    assert.ok(samples.length > 0);
    assert.ok(
      samples.every(
        (s) => s.shell && s.sidebar && s.toolbar && s.workspace && s.editor,
      ),
      "Thread switch removed or hid the shell/workspace: " +
        JSON.stringify(samples),
    );
  }
}
async function insert(text) {
  await evaluate("document.querySelector('[contenteditable=true]').focus()");
  await call("Input.insertText", { text });
  await wait(() =>
    evaluate(
      `document.querySelector('[contenteditable=true]')?.textContent.includes(${JSON.stringify(text)})`,
    ),
  );
}
async function editorSelection(from, to = from) {
  await evaluate(`(()=>{
    const editor=document.querySelector('[contenteditable=true]');editor.focus();
    const node=editor.querySelector('p').firstChild, range=document.createRange();
    range.setStart(node,${from});range.setEnd(node,${to});
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  })()`);
  await evaluate(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
  );
}
async function historyKey(redo = false) {
  await evaluate("document.querySelector('[contenteditable=true]').focus()");
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "z",
    code: "KeyZ",
    modifiers: redo ? 12 : 4,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "z",
    code: "KeyZ",
    modifiers: redo ? 12 : 4,
  });
}
async function shot(name) {
  await evaluate(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
  );
  const result = await call("Page.captureScreenshot", { format: "png" });
  const path = join(isolated.root, name + ".png");
  writeFileSync(path, Buffer.from(result.data, "base64"));
  return path;
}
const routerValidation = process.argv.includes("--router");
const checks = [];
const screenshots = [];
const continuitySamples = [];
try {
  await connect();
  await wait(() =>
    evaluate("!!document.querySelector('[contenteditable=true]')"),
  );
  await evaluate("document.querySelector('.configuration-settings').open=true");
  await wait(() =>
    evaluate(
      "document.querySelector('.configuration-settings').textContent.includes('OpenAI') && !document.querySelector('.configuration-settings').textContent.includes('正在读取')",
    ),
  );
  await wait(() =>
    evaluate(
      "document.querySelector('.model-controls select')?.options.length===3",
    ),
  );
  await evaluate("document.querySelector('.model-controls').open=true");
  await evaluate(
    `(()=>{const s=document.querySelector('.model-controls select');s.value=${JSON.stringify(JSON.stringify(["fixture", "fixture-b"]))};s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await evaluate(
    "(()=>{const s=document.querySelectorAll('.model-controls select')[1];s.value='high';s.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await click("应用到当前会话");
  await wait(() =>
    evaluate(
      "document.querySelector('.model-controls').textContent.includes('fixture-b · high')",
    ),
  );
  await evaluate(
    "document.querySelector('.configuration-settings').open=false",
  );
  await click("允许项目执行");
  await click("启动 OMP");
  await wait(() =>
    evaluate(
      "document.querySelector('.model-controls').textContent.includes('fixture/fixture-b')",
    ),
  );
  await insert("M2_FIRST_INPUT");
  await click("发送");
  await wait(() => requests.length === 1);
  assert.equal(requests[0].model, "fixture-b");
  await insert("A_UNSENT_DRAFT");
  await new Promise((resolve) => setTimeout(resolve, 600));
  await editorSelection(3);
  await insert("#");
  await editorSelection(2, 8);
  await click("新会话");
  const b = await wait(() => {
    const id = db
      .prepare("SELECT active_thread FROM desktop")
      .get().active_thread;
    return id !== a ? id : null;
  });
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent===''",
    ),
  );
  await click("启动 OMP");
  await wait(() =>
    evaluate(
      "document.querySelector('.model-controls').textContent.includes('fixture/fixture-a')",
    ),
  );
  await insert("M2_SECOND_INPUT");
  await click("发送");
  await wait(() => requests.length === 2);
  assert.equal(requests[1].model, "fixture-a");
  await wait(() =>
    evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_THREAD_B_REPLY')",
    ),
  );
  await wait(() =>
    evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_THREAD_B_REPLY_FINALIZED')",
    ),
  );
  const readingPosition = await evaluate(`(()=>{
    const pane=document.querySelector('.reading-pane');
    pane.scrollTop=pane.scrollHeight-pane.clientHeight-20;
    return {top:pane.scrollTop,height:pane.scrollHeight,client:pane.clientHeight};
  })()`);
  assert.ok(readingPosition.height > readingPosition.client + 100);
  await insert("B_UNSENT_DRAFT");
  await evaluate(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
  );
  assert.equal(
    await evaluate("document.querySelector('.reading-pane').scrollTop"),
    readingPosition.top,
  );
  checks.push(
    "full message_end displays finalized native text; manual near-bottom reading position survives draft input",
  );
  assert.ok(
    !(await evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_THREAD_A_REPLY')",
    )),
  );
  if (routerValidation) {
    await evaluate(
      "window.__routerEditor=document.querySelector('[contenteditable=true]');window.__routerPanes=Array.from(document.querySelectorAll('.reading-pane'));true",
    );
    for (const [index, label] of [
      [1, "只读文件与当前差异"],
      [2, "提交原文"],
      [3, "原生历史"],
      [0, "会话"],
    ]) {
      await click(label);
      await wait(() =>
        evaluate(
          `Array.from(document.querySelectorAll('.reading-pane')).every((pane,i)=>pane.hidden===(i!==${index})) && document.querySelectorAll('.reading-navigation button')[${index}].getAttribute('aria-pressed')==='true'`,
        ),
      );
    }
    assert.equal(
      await evaluate(
        "window.__routerEditor===document.querySelector('[contenteditable=true]') && window.__routerPanes.every((pane,i)=>pane===document.querySelectorAll('.reading-pane')[i])",
      ),
      true,
    );
    assert.equal(
      await evaluate("document.querySelector('.reading-pane').scrollTop"),
      readingPosition.top,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('[contenteditable=true]').textContent",
      ),
      "B_UNSENT_DRAFT",
    );
    checks.push(
      "actual Router search navigation retains Composer and all reading-pane DOM, draft and manual scroll position",
    );
  }

  await selectThread(a);
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='A_U#NSENT_DRAFT'",
    ),
  );
  await evaluate("document.querySelector('[contenteditable=true]').focus()");
  assert.deepEqual(
    await evaluate(
      "({from:getSelection().anchorOffset,to:getSelection().focusOffset})",
    ),
    { from: 2, to: 8 },
  );
  await historyKey();
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='A_UNSENT_DRAFT'",
    ),
  );
  await historyKey(true);
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='A_U#NSENT_DRAFT'",
    ),
  );
  await historyKey();
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='A_UNSENT_DRAFT'",
    ),
  );
  checks.push(
    "native Electron editor restores middle selection and independent undo/redo across Thread switch",
  );
  if (routerValidation) {
    await click("后退");
    await wait(
      () =>
        db.prepare("SELECT active_thread FROM desktop").get().active_thread ===
        b,
    );
    await wait(() =>
      evaluate(
        "document.querySelector('[contenteditable=true]')?.textContent==='B_UNSENT_DRAFT'",
      ),
    );
    await click("前进");
    await wait(
      () =>
        db.prepare("SELECT active_thread FROM desktop").get().active_thread ===
        a,
    );
    await wait(() =>
      evaluate(
        "document.querySelector('[contenteditable=true]')?.textContent==='A_UNSENT_DRAFT'",
      ),
    );
    checks.push(
      "actual toolbar back/forward confirm Main selection and restore separate Thread drafts",
    );
  }

  await editorSelection(3);
  await evaluate(`(()=>{
    window.__fixtureIme={active:false,trusted:false};
    document.addEventListener('compositionstart',e=>{window.__fixtureIme.active=true;window.__fixtureIme.trusted=e.isTrusted;},{once:true});
    document.addEventListener('compositionend',()=>{window.__fixtureIme.active=false;},{once:true});
  })()`);
  await call("Input.imeSetComposition", {
    text: "中",
    selectionStart: 1,
    selectionEnd: 1,
  });
  await wait(() => evaluate("window.__fixtureIme.active"));
  await evaluate(
    `document.querySelector('.thread-navigation button[title$="${b}"]').click()`,
  );
  await evaluate(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
  );
  assert.equal(
    db.prepare("SELECT active_thread FROM desktop").get().active_thread,
    a,
  );
  assert.equal(await evaluate("window.__fixtureIme.trusted"), true);
  if (routerValidation) {
    await click("后退");
    await evaluate(
      "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
    );
    assert.equal(
      db.prepare("SELECT active_thread FROM desktop").get().active_thread,
      a,
    );
    checks.push(
      "trusted Chromium IME blocks actual toolbar POP and preserves Main selection",
    );
  }

  await call("Input.imeSetComposition", {
    text: "",
    selectionStart: 0,
    selectionEnd: 0,
  });
  await wait(() => evaluate("!window.__fixtureIme.active"));
  await selectThread(b);
  await selectThread(a);
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='A_UNSENT_DRAFT'",
    ),
  );
  checks.push(
    "trusted Chromium composition in native Electron blocks Thread switch until composition ends; system input source not exercised",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_THREAD_A_REPLY')",
    ),
  );
  assert.ok(
    !(await evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_THREAD_B_REPLY')",
    )),
  );
  const ps = spawnSync("/bin/ps", ["-ww", "-axo", "command="], {
    env: isolated.env,
    encoding: "utf8",
  }).stdout;
  assert.equal(
    ps
      .split("\n")
      .filter((line) =>
        line.includes(join(bundle, "Contents/Resources/sdk/host.mjs")),
      ).length,
    2,
  );
  assert.equal(db.prepare("SELECT count(*) n FROM native_session").get().n, 2);
  checks.push(
    "two parallel native OMP scopes; switching does not interrupt held work",
    "separate model/effort, messages, drafts and session identities",
  );
  held();
  await wait(() =>
    evaluate(
      "document.querySelector('.runtime-panel [role=status]')?.textContent==='OMP 已就绪'",
    ),
  );
  await selectThread(b);
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='B_UNSENT_DRAFT'",
    ),
  );
  if (process.argv.includes("--continuity")) {
    assert.equal(
      await evaluate("document.querySelector('.reading-pane').scrollTop"),
      readingPosition.top,
    );
    checks.push(
      "Thread switching preserves shell and workspace through every DOM mutation/frame; returning restores independent reading scroll",
    );
  }
  await call("Page.reload");
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='B_UNSENT_DRAFT'",
    ),
  );
  assert.equal(requests.length, 2);
  await selectThread(a);
  await wait(() =>
    evaluate(
      "document.querySelector('.model-controls')?.textContent.includes('fixture/fixture-b')",
    ),
  );
  checks.push(
    "renderer reload reconnects same native sessions without resending",
  );
  const inputLayout = await evaluate(`(()=>{
    const editor=document.querySelector('[contenteditable=true]');
    const send=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='发送');
    const e=editor.getBoundingClientRect(), b=send.getBoundingClientRect();
    return { editorTop:e.top, editorBottom:e.bottom, sendBottom:b.bottom, readingHeight:document.querySelector(".thread-reading").getBoundingClientRect().height, height:innerHeight };
  })()`);
  assert.ok(
    inputLayout.editorTop >= 0 &&
      inputLayout.editorBottom <= inputLayout.height &&
      inputLayout.sendBottom <= inputLayout.height &&
      inputLayout.readingHeight >= 100,
    JSON.stringify(inputLayout),
  );
  await click("只读文件与当前差异");
  assert.equal(
    await evaluate(
      "document.querySelector('[contenteditable=true]').textContent",
    ),
    "A_UNSENT_DRAFT",
  );
  await click("会话");
  checks.push(
    "composer and send action stay inside window; switching reading view preserves draft",
  );
  screenshots.push(await shot("m2-parallel-entry"));
  if (process.argv.includes("--inspect")) {
    const checkpoint = join(isolated.root, "inspect-checkpoint.json"),
      resume = join(isolated.root, "inspect-continue");
    const expiresAt = new Date(Date.now() + 600000).toISOString();
    writeFileSync(
      checkpoint,
      JSON.stringify(
        {
          bundle,
          source,
          binary,
          root: isolated.root,
          project: isolated.cwd,
          secondProject,
          data: isolated.data,
          config: isolated.config,
          debugPort: port,
          threadA: a,
          threadB: b,
          resumeFile: resume,
          expiresAt,
          instructions:
            "Inspect only this isolated App. Test native Open Project with secondProject and cancel, system IME and cancel-login. Do not send real provider requests. Create resumeFile within 10 minutes.",
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ checkpoint, resumeFile: resume, expiresAt }));
    while (!existsSync(resume)) {
      if (Date.now() > Date.parse(expiresAt)) throw Error("Inspection timeout");
      await new Promise((r) => setTimeout(r, 250));
    }
    socket.onclose = null;
    socket.close();
    await connect();
    await selectThread(a);
    checks.push("native inspection checkpoint resumed");
  }
  child.kill("SIGKILL");
  await wait(() => child.signalCode !== null);
  socket.onclose = null;
  socket.close();
  child = launch();
  await connect();
  await wait(() =>
    evaluate(
      "document.querySelector('.runtime-panel')?.textContent.includes('当前只读历史')",
    ),
  );
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='发送').disabled",
    ),
    true,
  );
  assert.equal(requests.length, 2);
  await selectThread(b);
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='B_UNSENT_DRAFT'",
    ),
  );
  await click("新会话");
  await wait(
    () =>
      db.prepare("SELECT active_thread FROM desktop").get().active_thread !== b,
  );
  await wait(() =>
    evaluate(
      "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='启动 OMP'&&!b.disabled)",
    ),
  );
  checks.push(
    "cold old native sessions remain read-only, preserve drafts; explicit new independent Thread is available",
  );
  screenshots.push(await shot("m2-cold-new-thread"));
  const logs = readFileSync(join(isolated.data, "logs/main.jsonl"), "utf8");
  assert.ok(!logs.includes("M2_FIRST_INPUT"));
  assert.ok(!logs.includes("fixture-original"));
  const build = JSON.parse(logs.trim().split("\n")[0]).build;
  assert.equal(build.dirty, false);
  const result = {
    source,
    bundle,
    build,
    root: isolated.root,
    checks,
    screenshots,
    continuitySamples,
    providerCalls: requests.length,
    models: requests.map((r) => r.model),
    nativeSessions: db
      .prepare("SELECT session_id,thread_id FROM native_session")
      .all(),
    layout: inputLayout,
    sourceAsarSha256: createHash("sha256")
      .update(readFileSync(join(source, "Contents/Resources/app.asar")))
      .digest("hex"),
    limitations: [
      "localhost deterministic supplier, no real credentials/billing",
      "native inspection evidence recorded separately",
      "M2 V1-04 and queue/subagent/read-performance increments remain open",
    ],
  };
  writeFileSync(
    join(isolated.root, "m2-result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({ result: join(isolated.root, "m2-result.json"), checks }),
  );
  void call("Browser.close").catch(() => {});
  await wait(() => child.exitCode !== null);
} catch (error) {
  try {
    screenshots.push(await shot("m2-failure"));
    writeFileSync(
      join(isolated.root, "failure-dom.txt"),
      await evaluate("document.body.textContent"),
    );
  } catch {}
  console.error("Failure evidence: " + isolated.root);
  throw error;
} finally {
  socket?.close();
  if (child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
  server.close();
  for (const s of sockets) s.destroy();
  db.close();
}
