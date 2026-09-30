import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createTestEnvironment } from "../../scripts/test-environment.mjs";

const combination = process.argv.includes("--s5");
const rewriting = combination || process.argv.includes("--rewrite");
const inspecting = process.argv.includes("--inspect");
assert.ok(!inspecting || combination, "--inspect requires --s5");
const sandbox = createTestEnvironment({
  prefix: combination ? "d-pi-s5-package-" : "d-pi-s3-package-",
});
const root = realpathSync(sandbox.root);
const bundle = join(root, "Package With Spaces", "d-pi.app");
const sourceBundle = resolve(
  process.argv.slice(2).find((argument) => !argument.startsWith("--")) ??
    (combination
      ? "dist/s5-candidate/mac-arm64/d-pi.app"
      : "dist/s3-candidate/mac-arm64/d-pi.app"),
);
cpSync(sourceBundle, bundle, {
  recursive: true,
  verbatimSymlinks: true,
});
const fixtureBundleModification = {};
if (combination) {
  const info = join(bundle, "Contents/Info.plist");
  const identifier = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "CFBundleIdentifier", "raw", "-o", "-", info],
    { encoding: "utf8", env: sandbox.env },
  );
  assert.equal(identifier.status, 0, identifier.stderr);
  const replacement = "local.d-pi.s5-validation";
  const changed = spawnSync(
    "/usr/bin/plutil",
    ["-replace", "CFBundleIdentifier", "-string", replacement, info],
    { encoding: "utf8", env: sandbox.env },
  );
  assert.equal(changed.status, 0, changed.stderr);
  const unchangedResources = [
    "Contents/Resources/app.asar",
    "Contents/Resources/sdk/host.mjs",
    "Contents/Resources/sdk/manifest.json",
  ].map((path) => {
    const digest = (base) =>
      createHash("sha256")
        .update(readFileSync(join(base, path)))
        .digest("hex");
    const sourceSha256 = digest(sourceBundle);
    const fixtureSha256 = digest(bundle);
    assert.equal(fixtureSha256, sourceSha256);
    return { path, sha256: sourceSha256 };
  });
  Object.assign(fixtureBundleModification, {
    path: "Contents/Info.plist",
    originalIdentifier: identifier.stdout.trim(),
    fixtureIdentifier: replacement,
    reason:
      "bind native inspection to the isolated copy, apart from the user's live App",
    unchangedResources,
  });
}
const { cwd: project, data, config } = sandbox;
const rawFile = "BEGIN😀\r\nSECOND\rTHIRD\nEND";
const changedFile = "CHANGED😀\r\nSECOND\rTHIRD\nEND";
const rawPreview = "BEGIN😀\nSECOND\nTHIRD\nEND";
const changedPreview = "CHANGED😀\nSECOND\nTHIRD\nEND";
const modeFile = "S5_SAME_BYTES\nconst mode = 1;\n";
const whitespaceFile = "  \n\t\n";
function git(...args) {
  const result = spawnSync("/usr/bin/git", ["-C", project, ...args], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
if (rewriting) {
  writeFileSync(
    join(project, "raw-selection.txt"),
    "INITIAL\r\nSECOND\rTHIRD\nEND",
  );
  if (combination) {
    writeFileSync(join(project, "mode-source.txt"), modeFile);
    chmodSync(join(project, "mode-source.txt"), 0o644);
    writeFileSync(join(project, "whitespace-diff.txt"), "");
  }
  for (const args of [
    ["init", "-q"],
    ["add", "."],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture baseline",
    ],
  ]) {
    git(...args);
  }
  writeFileSync(join(project, "raw-selection.txt"), rawFile);
  if (combination) {
    git("config", "core.filemode", "true");
    chmodSync(join(project, "mode-source.txt"), 0o755);
    git("add", "mode-source.txt");
    chmodSync(join(project, "mode-source.txt"), 0o644);
    writeFileSync(join(project, "whitespace-diff.txt"), whitespaceFile);
    assert.equal(git("show", "HEAD:mode-source.txt"), modeFile);
    assert.equal(git("show", ":mode-source.txt"), modeFile);
    assert.equal(
      readFileSync(join(project, "mode-source.txt"), "utf8"),
      modeFile,
    );
  }
}
const db = new DatabaseSync(join(data, "drafts.sqlite"));
// Seed an S1 browse-only Thread; the unmodified package performs its real migrations.
db.exec(
  "CREATE TABLE workspace(id TEXT PRIMARY KEY,directory TEXT NOT NULL UNIQUE,execution_trust TEXT NOT NULL);CREATE TABLE thread(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL);CREATE TABLE desktop(id INTEGER PRIMARY KEY,active_thread TEXT,theme TEXT NOT NULL,density TEXT NOT NULL);PRAGMA user_version=1;",
);
const thread = randomUUID(),
  workspace = randomUUID();
db.prepare("INSERT INTO workspace VALUES(?,?,'browse')").run(
  workspace,
  project,
);
db.prepare("INSERT INTO thread VALUES(?,?,0,'')").run(thread, workspace);
db.prepare("INSERT INTO desktop VALUES(1,?,'light','normal')").run(thread);
const requests = [];
const providerEvents = [];
let nextRequestHold = null;
let nextRequestReply = null;
const combinationChecks = [];
const combinationEvidence = {};
const sockets = new Set();
const server = createServer(async (req, res) => {
  let text = "";
  for await (const bytes of req) text += bytes.toString();
  requests.push(text);
  const hold = nextRequestHold;
  nextRequestHold = null;
  const reply = nextRequestReply;
  nextRequestReply = null;
  const requestEvent = { request: requests.length, hold, reply, closed: false };
  providerEvents.push(requestEvent);
  res.on("close", () => {
    requestEvent.closed = true;
  });
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const frame = (delta, finish) => ({
    id: "fixture",
    object: "chat.completion.chunk",
    created: 1,
    model: "fixture",
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  if (rewriting && requests.length === 1) {
    res.write(
      `data: ${JSON.stringify(frame({ role: "assistant", tool_calls: [{ index: 0, id: "fixture-write", type: "function", function: { name: "write", arguments: JSON.stringify({ path: "native-evidence.txt", content: "NATIVE_TOOL_WRITE\n" }) } }] }, null))}\n\n`,
    );
    res.write(`data: ${JSON.stringify(frame({}, "tool_calls"))}\n\n`);
    res.end("data: [DONE]\n\n");
    return;
  }
  const firstReply = requests.length === (rewriting ? 2 : 1);
  res.write(
    `data: ${JSON.stringify(frame({ role: "assistant", content: reply ?? (firstReply ? "PACKAGE_FIRST_REPLY\n\n```ts\nconst value = 1;\n```\n[GitHub](https://github.com/can1357/oh-my-pi)" : hold === "interrupted" ? "PACKAGE_INTERRUPTED_REPLY" : hold === "busy" ? "S5_BUSY_REPLY" : "PACKAGE_SECOND_REPLY") }, null))}\n\n`,
  );
  // Each held request is armed immediately before the matching GUI action.
  if (hold) return;
  await new Promise((r) => setTimeout(r, 300));
  res.write(`data: ${JSON.stringify(frame({}, "stop"))}\n\n`);
  res.end("data: [DONE]\n\n");
});
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
writeFileSync(
  join(config, "models.yml"),
  JSON.stringify({
    providers: {
      fixture: {
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
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
if (combination) {
  mkdirSync(join(config, "extensions"), { recursive: true });
  writeFileSync(
    join(config, "extensions", "s5.ts"),
    `import { writeFileSync } from 'node:fs';
export default function(pi) { pi.registerCommand('s5ask', { description: 'Isolated S5 interaction fixture', handler: async (_, ctx) => {
  const a = await ctx.ui.confirm('S5 确认', '确认组合测试操作？');
  const b = await ctx.ui.select('S5 选择', ['选项甲', '选项乙']);
  const c = await ctx.ui.input('S5 输入');
  const d = await ctx.ui.editor('S5 编辑', 'S5预填内容');
  writeFileSync(${JSON.stringify(join(project, "s5-answers.json"))}, JSON.stringify([a,b,c,d]));
} }); }`,
  );
}
writeFileSync(
  join(config, "config.yml"),
  JSON.stringify({
    autolearn: { enabled: false },
    modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
  }),
);
const ports = createServer();
await new Promise((r) => ports.listen(0, "127.0.0.1", r));
const port = ports.address().port;
await new Promise((r) => ports.close(r));
const binary = join(bundle, "Contents/MacOS/d-pi");
function launch() {
  const application = spawn(
    binary,
    ["--lang=zh-CN", `--remote-debugging-port=${port}`],
    { env: sandbox.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  application.stdout.on("data", () => {});
  application.stderr.on("data", (bytes) => process.stderr.write(bytes));
  application.on("exit", (code, signal) =>
    console.log("package exit", code, signal),
  );
  return application;
}
let child = launch();
let socket;
let captureFailure;
async function wait(fn) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    const value = await fn();
    if (value) return value;
    if (child.exitCode !== null || child.signalCode !== null)
      throw Error("Package exited early");
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Package UI timeout");
}
try {
  const connect = async () => {
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
    const connection = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, reject) => {
      connection.onopen = r;
      connection.onerror = reject;
    });
    return connection;
  };
  socket = await connect();
  let sequence = 0;
  const pending = new Map();
  const onClose = () => {
    for (const entry of pending.values()) entry.reject(Error("CDP closed"));
    pending.clear();
  };
  const onMessage = (e) => {
    const message = JSON.parse(e.data);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry?.reject(Error(message.error.message));
      else entry?.resolve(message.result);
    }
  };
  socket.onclose = onClose;
  socket.onmessage = onMessage;
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  captureFailure = async () => {
    const shot = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(root, "failure.png"), Buffer.from(shot.data, "base64"));
    const state = await evaluate(
      "({focused:document.hasFocus(),activeTag:document.activeElement?.tagName,activeClass:document.activeElement?.className,activeLabel:document.activeElement?.getAttribute('aria-label'),buttons:Array.from(document.querySelectorAll('button')).map(b=>({text:b.textContent.trim(),disabled:b.disabled})),selectedTextElements:document.querySelectorAll('.monaco-editor .selected-text').length})",
    );
    writeFileSync(
      join(root, "failure-dom.json"),
      JSON.stringify(state, null, 2) + "\n",
    );
  };
  const click = async (text) => {
    await wait(() =>
      evaluate(
        `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`,
      ),
    );
    return evaluate(
      `(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b || b.disabled)throw Error('Button unavailable');b.click();})()`,
    );
  };
  const shot = async (name) => {
    await evaluate(
      "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
    );
    const screenshot = await call("Page.captureScreenshot", { format: "png" });
    const path = join(root, name);
    writeFileSync(path, Buffer.from(screenshot.data, "base64"));
    return path;
  };
  const composerText = () =>
    evaluate("document.querySelector('[contenteditable=true]')?.textContent");
  const draftBody = () =>
    db.prepare("SELECT body FROM thread WHERE id=?").get(thread)?.body;
  const insertDraft = async (text) => {
    await evaluate("document.querySelector('[contenteditable=true]').focus()");
    await call("Input.insertText", { text });
    await wait(async () => (await composerText()).includes(text));
  };
  const clearDraft = async () => {
    await call("Page.bringToFront");
    await evaluate("document.querySelector('[contenteditable=true]').focus()");
    for (const type of ["keyDown", "keyUp"])
      await call("Input.dispatchKeyEvent", {
        type,
        key: "a",
        code: "KeyA",
        modifiers: 4,
        windowsVirtualKeyCode: 65,
      });
    for (const type of ["keyDown", "keyUp"])
      await call("Input.dispatchKeyEvent", {
        type,
        key: "Backspace",
        code: "Backspace",
        windowsVirtualKeyCode: 8,
      });
    await wait(async () => (await composerText()) === "" && draftBody() === "");
  };
  const reloadRenderer = async (ready) => {
    await call("Page.reload");
    await wait(async () => {
      try {
        return await evaluate(ready);
      } catch {
        return false;
      }
    });
    assert.equal(
      db.prepare("SELECT session_id FROM native_session").get().session_id,
      session,
      "renderer reload must retain the native session identity",
    );
  };
  const switchLocale = async (locale) => {
    await wait(() => evaluate("!!document.querySelector('.toolbar select')"));
    await evaluate(
      `(()=>{const select=document.querySelector('.toolbar select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(locale)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await wait(
      async () =>
        db.prepare("SELECT locale FROM desktop WHERE id=1").get()?.locale ===
          locale &&
        (await evaluate(
          `document.documentElement.lang===${JSON.stringify(locale)}`,
        )),
    );
  };
  await switchLocale("zh-CN");
  await wait(() =>
    evaluate("document.body?.textContent.includes('允许项目执行')"),
  );
  await click("允许项目执行");
  await wait(() =>
    evaluate(
      "Array.from(document.querySelectorAll('button')).some(b=>b.textContent === '启动 OMP')",
    ),
  );
  await click("启动 OMP");
  await wait(() =>
    evaluate(
      "Array.from(document.querySelectorAll('button')).some(b=>b.textContent === '发送' && !b.disabled)",
    ),
  );
  const session = db
    .prepare("SELECT session_id FROM native_session")
    .get().session_id;
  if (rewriting) {
    await evaluate(
      "(()=>{const editor=document.querySelector('[contenteditable=true]');window.fixtureIME=[];editor.addEventListener('compositionstart',()=>window.fixtureIME.push('start'));editor.addEventListener('compositionend',()=>window.fixtureIME.push('end'));editor.focus();})()",
    );
    await call("Input.imeSetComposition", {
      text: "中文",
      selectionStart: 2,
      selectionEnd: 2,
    });
    await wait(() => evaluate("window.fixtureIME.includes('start')"));
    await click("发送");
    await new Promise((accept) => setTimeout(accept, 150));
    assert.equal(requests.length, 0, "an active composition must not dispatch");
    assert.equal(
      db.prepare("SELECT COUNT(*) AS total FROM submission").get().total,
      0,
    );
    await call("Input.imeSetComposition", {
      text: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    await wait(() => evaluate("window.fixtureIME.includes('end')"));
    assert.equal(
      requests.length,
      0,
      "composition completion must not dispatch",
    );
    // Chromium may commit the composition on the button's focus change. End of
    // composition is not cancellation of its text; clear this fixture explicitly.
    await clearDraft();
  }
  for (const [input, reply] of [
    ["PACKAGE_FIRST_INPUT", "PACKAGE_FIRST_REPLY"],
    ["PACKAGE_SECOND_INPUT", "PACKAGE_SECOND_REPLY"],
  ]) {
    await evaluate("document.querySelector('[contenteditable=true]').focus()");
    await call("Input.insertText", { text: input });
    await click("发送");
    await wait(() =>
      evaluate(
        `document.querySelector('.conversation')?.textContent.includes(${JSON.stringify(reply)})`,
      ),
    );
    await wait(() =>
      evaluate(
        "Array.from(document.querySelectorAll('button')).some(b=>b.textContent === '发送' && !b.disabled)",
      ),
    );
  }
  if (
    requests.length !== (rewriting ? 3 : 2) ||
    !requests.at(-1).includes("PACKAGE_FIRST_INPUT") ||
    !requests.at(-1).includes("PACKAGE_FIRST_REPLY")
  )
    throw Error("Package context not retained");
  if (
    db.prepare("SELECT session_id FROM native_session").get().session_id !==
    session
  )
    throw Error("Package native session changed");
  const receipts = db
    .prepare("SELECT receipt FROM submission")
    .all()
    .map((r) => JSON.parse(r.receipt));
  if (receipts.some((r) => r.state !== "acknowledged"))
    throw Error("ACK not durable");
  if (combination) {
    const callsBeforeInteraction = requests.length;
    await insertDraft("/s5ask");
    await click("发送");
    await wait(() =>
      evaluate("document.body.textContent.includes('确认组合测试操作？')"),
    );
    await wait(async () => (await composerText()) === "");
    await insertDraft("S5_PRESERVED_DURING_DIALOG");
    await wait(() => draftBody() === "S5_PRESERVED_DURING_DIALOG");
    await reloadRenderer(
      "document.body.textContent.includes('确认组合测试操作？') && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='确认'&&!b.disabled)",
    );
    assert.equal(await composerText(), "S5_PRESERVED_DURING_DIALOG");
    assert.equal(requests.length, callsBeforeInteraction);
    assert.equal(
      await evaluate(
        "Array.from(document.querySelectorAll('.composer button')).filter(b=>['发送','排队发送','干预当前执行'].includes(b.textContent.trim())).every(b=>b.disabled)",
      ),
      true,
      "pending native interaction must block submission admission after resubscription",
    );
    combinationEvidence.interaction = await shot("s5-interaction-reload.png");
    await click("确认");
    await click("选项乙");
    await wait(() =>
      evaluate(
        "!!document.querySelector('textarea[aria-label=\"S5 输入\"]:not(:disabled)')",
      ),
    );
    await evaluate(
      "document.querySelector('textarea[aria-label=\"S5 输入\"]').focus()",
    );
    await call("Input.insertText", { text: "S5测试回答" });
    await click("提交回答");
    await wait(() =>
      evaluate(
        "!!document.querySelector('textarea[aria-label=\"S5 编辑\"]:not(:disabled)')",
      ),
    );
    assert.equal(
      await evaluate(
        "document.querySelector('textarea[aria-label=\"S5 编辑\"]').value",
      ),
      "S5预填内容",
    );
    combinationEvidence.editorInteraction = await shot(
      "s5-editor-interaction.png",
    );
    await click("提交回答");
    await wait(() => existsSync(join(project, "s5-answers.json")));
    assert.deepEqual(
      JSON.parse(readFileSync(join(project, "s5-answers.json"), "utf8")),
      [true, "选项乙", "S5测试回答", "S5预填内容"],
    );
    await wait(() =>
      evaluate(
        "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='发送'&&!b.disabled)",
      ),
    );
    assert.equal(await composerText(), "S5_PRESERVED_DURING_DIALOG");
    assert.equal(requests.length, callsBeforeInteraction);
    combinationChecks.push(
      "official extension confirm/select/input/editor; pending confirm survives renderer reload with draft and no replay",
    );
    await clearDraft();

    const representativeDraft = "S5代表性草稿0123456789 "
      .repeat(1250)
      .slice(0, 20000);
    assert.equal(representativeDraft.length, 20000);
    await insertDraft(representativeDraft);
    await wait(() => draftBody() === representativeDraft);
    await reloadRenderer("!!document.querySelector('[contenteditable=true]')");
    await wait(async () => (await composerText()) === representativeDraft);
    assert.equal(draftBody(), representativeDraft);
    await click("紧凑密度");
    await wait(() =>
      evaluate("document.documentElement.dataset.density==='compact'"),
    );
    await click("正常密度");
    await wait(() =>
      evaluate("document.documentElement.dataset.density==='normal'"),
    );
    combinationEvidence.representativeDraft = {
      utf16Length: representativeDraft.length,
      persistedAndRestoredExactly: true,
      appearanceCommandsResponsive: true,
      performanceMeasurement: false,
    };
    await clearDraft();
    combinationChecks.push(
      "representative 20000-character draft persists, reloads exactly and accepts appearance commands; no performance claim",
    );

    const callsBeforeBusy = requests.length;
    nextRequestHold = "busy";
    await insertDraft("S5_BUSY_INPUT");
    await click("发送");
    await wait(() => requests.length === callsBeforeBusy + 1);
    await wait(() =>
      evaluate(
        "document.querySelector('.conversation')?.textContent.includes('S5_BUSY_REPLY') && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='排队发送'&&!b.disabled)",
      ),
    );
    await wait(async () => (await composerText()) === "");
    await insertDraft("S5_QUEUED_INPUT");
    await click("排队发送");
    await wait(() =>
      evaluate("document.body.textContent.includes('待处理：S5_QUEUED_INPUT')"),
    );
    await wait(async () => (await composerText()) === "");
    await click("停止并暂缓队列");
    await wait(() =>
      evaluate("document.body.textContent.includes('队列已暂缓')"),
    );
    await new Promise((accept) => setTimeout(accept, 350));
    assert.equal(
      requests.length,
      callsBeforeBusy + 1,
      "stopping must preserve the queued input without consuming it",
    );
    await reloadRenderer(
      "document.body.textContent.includes('队列已暂缓') && document.body.textContent.includes('S5_QUEUED_INPUT')",
    );
    assert.equal(
      requests.length,
      callsBeforeBusy + 1,
      "renderer reload must not resume the paused native queue",
    );
    combinationEvidence.pausedQueue = await shot("s5-paused-queue-reload.png");
    nextRequestReply = "S5_QUEUE_REPLY";
    await click("明确继续");
    await wait(() => requests.length === callsBeforeBusy + 2);
    await wait(() =>
      evaluate(
        "document.querySelector('.conversation')?.textContent.includes('S5_QUEUE_REPLY') && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='发送'&&!b.disabled)",
      ),
    );
    assert.ok(requests.at(-1).includes("S5_QUEUED_INPUT"));
    await new Promise((accept) => setTimeout(accept, 350));
    assert.equal(
      requests.length,
      callsBeforeBusy + 2,
      "explicit continuation consumes the queued input once",
    );
    assert.equal(
      db.prepare("SELECT session_id FROM native_session").get().session_id,
      session,
    );
    assert.ok(
      db
        .prepare("SELECT receipt FROM submission")
        .all()
        .map((row) => JSON.parse(row.receipt))
        .every((receipt) => receipt.state === "acknowledged"),
    );
    combinationEvidence.queue = {
      callsBeforeBusy,
      callsAfterContinue: requests.length,
      sameNativeSession: true,
      resumedOnce: true,
    };
    combinationChecks.push(
      "busy submit queues natively; stop preserves and pauses; renderer reload does not replay; explicit continuation consumes once on the same session",
    );
    // Reproduce a real prepare/dispatch race across the restricted public bridge.
    // Main rejects before Host here, so do not invent a Host reason or seed a
    // synthetic receipt in SQLite. Exercise the ordinary GUI's generic fallback.
    const refusedText = "S5_PREPARED_BEFORE_PAUSE";
    await insertDraft(refusedText);
    await wait(() => draftBody() === refusedText);
    const refusalCommand = {
      kind: "prepare",
      threadId: thread,
      submissionId: randomUUID(),
      traceId: randomUUID(),
      revision: db.prepare("SELECT revision FROM thread WHERE id=?").get(thread)
        .revision,
      text: refusedText,
      delivery: "followUp",
    };
    const prepared = await evaluate(
      `window.desktop.submission.request(${JSON.stringify(refusalCommand)})`,
    );
    assert.equal(prepared.kind, "receipt");
    assert.equal(prepared.receipt.state, "prepared");
    const callsBeforeRefusal = requests.length;
    await click("停止并暂缓队列");
    await wait(() =>
      evaluate("document.body.textContent.includes('队列已暂缓')"),
    );
    const refused = await evaluate(
      `window.desktop.submission.request(${JSON.stringify({ kind: "dispatch", threadId: thread, submissionId: refusalCommand.submissionId })})`,
    );
    assert.equal(refused.kind, "receipt");
    assert.equal(refused.receipt.state, "rejected");
    assert.equal(refused.receipt.rejectionReason, undefined);
    assert.equal(refused.receipt.acknowledgedAt, null);
    await click("核对提交状态");
    await evaluate(
      "document.querySelector('[aria-label=提交记录] details').open=true",
    );
    await wait(() =>
      evaluate(
        "document.querySelector('[aria-label=提交记录]')?.textContent.includes('未派发到 OMP，原文保留；可处理阻塞后重新发送')",
      ),
    );
    assert.equal(draftBody(), refusedText);
    assert.equal(requests.length, callsBeforeRefusal);
    combinationEvidence.rejection = {
      receipt: refused.receipt,
      attribution: "Main admission; no Host reason was reported",
      noProviderCall: true,
      draftPreserved: true,
      screenshot: await shot("s5-paused-rejection.png"),
    };
    combinationChecks.push(
      "prepare before pause then dispatch is refused by Main; ordinary submission GUI preserves the generic fallback when no Host reason was reported, with no ACK/provider call and exact draft preserved",
    );
    await click("明确继续");
    await wait(() =>
      evaluate("!document.body.textContent.includes('队列已暂缓')"),
    );
    await clearDraft();
  }
  await click("读取原生记录");
  await wait(() =>
    evaluate(
      "document.querySelector('[aria-label=只读原生会话历史]')?.textContent.includes('PACKAGE_SECOND_REPLY')",
    ),
  );
  if (rewriting) {
    assert.equal(
      readFileSync(join(project, "native-evidence.txt"), "utf8"),
      "NATIVE_TOOL_WRITE\n",
    );
    await wait(() =>
      evaluate(
        "document.querySelector('[aria-label=只读原生会话历史]')?.textContent.includes('原生工具结果证据')",
      ),
    );
    const selectAll = async () => {
      await call("Page.bringToFront");
      await evaluate(
        "Array.from(document.querySelectorAll('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea')).at(-1).focus()",
      );
      // A same-byte view intentionally keeps Monaco's existing range, while the
      // parent clears its pending attachment. Change the range before selecting
      // again so this is a new selection event from the current Git source.
      for (const type of ["keyDown", "keyUp"])
        await call("Input.dispatchKeyEvent", {
          type,
          key: "ArrowLeft",
          code: "ArrowLeft",
          windowsVirtualKeyCode: 37,
        });
      await call("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "a",
        code: "KeyA",
        modifiers: 4,
        windowsVirtualKeyCode: 65,
      });
      await call("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "a",
        code: "KeyA",
        modifiers: 4,
        windowsVirtualKeyCode: 65,
      });
      await wait(() =>
        evaluate(
          "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='将选区附入输入'&&!b.disabled)",
        ),
      );
      await click("将选区附入输入");
    };
    if (combination) {
      const openModeDiff = async (scope, source) => {
        await wait(() =>
          evaluate(
            `Array.from(document.querySelectorAll('.change-list button')).some(b=>b.textContent.includes(${JSON.stringify(scope)})&&b.textContent.includes('mode-source.txt'))`,
          ),
        );
        await evaluate(
          `Array.from(document.querySelectorAll('.change-list button')).find(b=>b.textContent.includes(${JSON.stringify(scope)})&&b.textContent.includes('mode-source.txt')).click()`,
        );
        await wait(() =>
          evaluate(
            `document.querySelector('.diff-sources span:last-child')?.textContent===${JSON.stringify(source)} && document.querySelector('.monaco-diff-editor')?.textContent.includes('S5_SAME_BYTES')`,
          ),
        );
      };
      // Prime both Query entries before switching the same-byte view. A cache miss
      // would temporarily remove the editor and fail to exercise its source update.
      await openModeDiff("暂存区 → 工作区", "working tree: mode-source.txt");
      await openModeDiff("HEAD → 暂存区", "index: mode-source.txt");
      await selectAll();
      await wait(() =>
        evaluate("document.querySelectorAll('.file-reference pre').length===1"),
      );
      await evaluate(
        "void (window.fixtureModeDiff=document.querySelector('.monaco-diff-editor'))",
      );
      await openModeDiff("暂存区 → 工作区", "working tree: mode-source.txt");
      assert.equal(
        await evaluate(
          "window.fixtureModeDiff===document.querySelector('.monaco-diff-editor')",
        ),
        true,
        "same-byte Git scope switch must exercise the mounted editor",
      );
      await selectAll();
      await wait(() =>
        evaluate("document.querySelectorAll('.file-reference pre').length===2"),
      );
      const sources = await evaluate(
        "Array.from(document.querySelectorAll('.file-reference small')).map(node=>node.textContent)",
      );
      assert.ok(sources[0].startsWith("index: mode-source.txt · sha256:"));
      assert.ok(
        sources[1].startsWith("working tree: mode-source.txt · sha256:"),
      );
      assert.equal(
        sources[0].split(" · ").at(-1),
        sources[1].split(" · ").at(-1),
      );
      assert.deepEqual(
        await evaluate(
          "Array.from(document.querySelectorAll('.file-reference pre')).map(node=>node.textContent)",
        ),
        [modeFile, modeFile],
      );
      await wait(() =>
        draftBody()?.includes('"source":"working tree: mode-source.txt"'),
      );
      combinationEvidence.sameByteSources = {
        path: "mode-source.txt",
        sources,
        sameEditor: true,
        sameText: true,
        stagedMode: "100755",
        worktreeMode: "100644",
        screenshot: await shot("s5-same-byte-source-switch.png"),
      };
      combinationChecks.push(
        "mode-only HEAD/index/worktree have the same path/hash/bytes; mounted right-pane selections retain each current Git source",
      );
      await clearDraft();
      await evaluate(
        "Array.from(document.querySelectorAll('.change-list button')).find(b=>b.textContent.includes('whitespace-diff.txt')).click()",
      );
      await wait(() =>
        evaluate(
          "document.querySelector('.diff-sources span:last-child')?.textContent==='working tree: whitespace-diff.txt' && !!document.querySelector('.monaco-diff-editor .view-lines')",
        ),
      );
      await evaluate(
        "document.querySelector('.monaco-diff-editor').scrollIntoView({block:'center'})",
      );
      combinationEvidence.whitespaceDiff = {
        rawText: whitespaceFile,
        screenshot: await shot("s5-whitespace-diff.png"),
      };
      combinationChecks.push(
        "whitespace-only current Git diff rendered and captured for visual inspection",
      );
    }
    await click("raw-selection.txt");
    await wait(() =>
      evaluate(
        "document.querySelector('.monaco-editor')?.textContent.includes('BEGIN')",
      ),
    );
    await selectAll();
    await wait(() =>
      evaluate(
        `document.querySelector('.file-reference pre')?.textContent===${JSON.stringify(rawPreview)}`,
      ),
    );
    await wait(() =>
      db
        .prepare("SELECT body FROM thread WHERE id=?")
        .get(thread)
        ?.body.includes(rawFile),
    );
    writeFileSync(join(project, "raw-selection.txt"), changedFile);
    await evaluate("document.querySelector('.file-panel button').click()");
    await wait(() =>
      evaluate(
        "document.querySelector('.monaco-editor')?.textContent.includes('CHANGED')",
      ),
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.file-reference pre').textContent",
      ),
      rawPreview,
    );
    await evaluate(
      "Array.from(document.querySelectorAll('.change-list button')).find(b=>b.textContent.includes('raw-selection.txt')).click()",
    );
    await wait(() =>
      evaluate(
        "document.querySelector('.monaco-diff-editor')?.textContent.includes('CHANGED')",
      ),
    );
    await selectAll();
    await wait(() =>
      evaluate("document.querySelectorAll('.file-reference pre').length===2"),
    );
    assert.deepEqual(
      await evaluate(
        "Array.from(document.querySelectorAll('.file-reference pre')).map(p=>p.textContent)",
      ),
      [rawPreview, changedPreview],
    );
    await evaluate(
      "void (window.fixtureComposer=document.querySelector('[contenteditable=true]'))",
    );
    await switchLocale("en-US");
    await switchLocale("zh-CN");
    assert.equal(
      await evaluate(
        "window.fixtureComposer===document.querySelector('[contenteditable=true]')",
      ),
      true,
      "language changes must retain the mounted editor",
    );
    assert.deepEqual(
      await evaluate(
        "Array.from(document.querySelectorAll('.file-reference pre')).map(p=>p.textContent)",
      ),
      [rawPreview, changedPreview],
    );
    await wait(() =>
      db
        .prepare("SELECT body FROM thread WHERE id=?")
        .get(thread)
        ?.body.includes(changedFile),
    );
    const selectedShot = await call("Page.captureScreenshot", {
      format: "png",
    });
    writeFileSync(
      join(root, "package-files.png"),
      Buffer.from(selectedShot.data, "base64"),
    );
    await call("Page.reload");
    await wait(async () => {
      try {
        return await evaluate(
          "document.querySelectorAll('.file-reference pre').length===2",
        );
      } catch {
        return false;
      }
    });
    assert.deepEqual(
      await evaluate(
        "Array.from(document.querySelectorAll('.file-reference pre')).map(p=>p.textContent)",
      ),
      [rawPreview, changedPreview],
    );
    assert.equal(
      db.prepare("SELECT session_id FROM native_session").get().session_id,
      session,
    );
    assert.equal(
      requests.length,
      combination ? combinationEvidence.queue.callsAfterContinue : 3,
      "window reload must not restart or resend native work",
    );
  }
  await wait(() =>
    evaluate(
      "document.querySelector('.conversation pre code')?.textContent.includes('const value')",
    ),
  );
  await evaluate(
    "document.querySelector('.conversation pre').scrollIntoView({block:'center'})",
  );
  const screenshot = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    join(root, "package.png"),
    Buffer.from(screenshot.data, "base64"),
  );
  await evaluate(
    "document.querySelector('[aria-label=\"切换为深色主题\"]').click()",
  );
  await wait(() =>
    evaluate("document.documentElement.dataset.theme === 'dark'"),
  );
  await click("紧凑密度");
  await wait(() =>
    evaluate("document.documentElement.dataset.density === 'compact'"),
  );
  const darkShot = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    join(root, "package-dark.png"),
    Buffer.from(darkShot.data, "base64"),
  );
  if (combination && inspecting) {
    const checkpoint = join(root, "inspect-checkpoint.json");
    const resume = join(root, "inspect-continue");
    const callsBeforeInspection = requests.length;
    const expiresAt = new Date(Date.now() + 300000).toISOString();
    writeFileSync(
      checkpoint,
      JSON.stringify(
        {
          phase:
            "live S5 flow completed; before deliberate native interruption",
          sourceBundle,
          bundle,
          bundleIdentifier: fixtureBundleModification.fixtureIdentifier,
          binary,
          project,
          data,
          config,
          environment: sandbox.env,
          thread,
          session,
          debugPort: port,
          providerCalls: callsBeforeInspection,
          resumeFile: resume,
          expiresAt,
          instructions:
            "Inspect only this isolated fixture App. Create resumeFile to continue within 5 minutes. Do not submit new work or change draft references; closing/reopening the same fixture window is allowed if the App remains alive.",
        },
        null,
        2,
      ) + "\n",
    );
    console.log(JSON.stringify({ checkpoint, resumeFile: resume, expiresAt }));
    while (!existsSync(resume)) {
      if (Date.now() >= Date.parse(expiresAt))
        throw Error(
          "S5 native inspection checkpoint timed out after 5 minutes",
        );
      if (child.exitCode !== null || child.signalCode !== null)
        throw Error("S5 fixture App exited during inspection");
      await new Promise((accept) => setTimeout(accept, 250));
    }
    // A native close/reopen can replace the renderer target. Bind the fresh target
    // before continuing and verify that inspection did not cause native replay.
    // No request is in flight here. A late close from the old target must not
    // reject requests queued against the new target through the shared map.
    socket.onclose = null;
    socket.close();
    socket = await connect();
    socket.onclose = onClose;
    socket.onmessage = onMessage;
    await wait(() =>
      evaluate("document.querySelectorAll('.file-reference pre').length===2"),
    );
    assert.equal(
      requests.length,
      callsBeforeInspection,
      "native inspection/reconnection must not replay native work",
    );
    assert.equal(
      db.prepare("SELECT session_id FROM native_session").get().session_id,
      session,
    );
    combinationEvidence.inspection = {
      checkpoint,
      resumed: true,
      providerCalls: requests.length,
      sameNativeSession: true,
      screenshot: await shot("s5-after-native-inspection.png"),
    };
    combinationChecks.push(
      "inspection checkpoint resumed on the current renderer target without native resend/session replacement",
    );
  }
  console.log(
    `PASS: relocated formal package, bundled official SDK, v1 migration, two turns/same session, ACK consumption, direct reading/history. Evidence: ${root}`,
  );
  if (rewriting) {
    const interruptedRequest = requests.length + 1;
    nextRequestHold = "interrupted";
    await evaluate("document.querySelector('[contenteditable=true]').focus()");
    await call("Input.insertText", { text: "PACKAGE_INTERRUPTED_INPUT" });
    await click("发送");
    await wait(() => requests.length === interruptedRequest);
    const latestReceipt = () =>
      db
        .prepare("SELECT receipt FROM submission")
        .all()
        .map((r) => JSON.parse(r.receipt))
        .find((r) => r.text.includes("PACKAGE_INTERRUPTED_INPUT"));
    await wait(() => latestReceipt()?.state === "acknowledged");
    assert.ok(latestReceipt().text.includes(rawFile));
    assert.ok(latestReceipt().text.includes(changedFile));
    await wait(() =>
      evaluate("document.querySelectorAll('.file-reference pre').length===0"),
    );
    await evaluate("document.querySelector('[contenteditable=true]').focus()");
    await call("Input.insertText", { text: "COLD_PENDING_DRAFT" });
    await wait(() =>
      db
        .prepare("SELECT body FROM thread WHERE id=?")
        .get(thread)
        ?.body.includes("COLD_PENDING_DRAFT"),
    );
    const ps = spawnSync("/bin/ps", ["-ww", "-axo", "pid=,ppid=,command="], {
      encoding: "utf8",
      env: sandbox.env,
    });
    const owned = ps.stdout
      .split("\n")
      .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
      .filter((row) =>
        row?.[3].includes(join(bundle, "Contents/Resources/sdk/host.mjs")),
      );
    assert.equal(
      owned.length,
      1,
      "interrupt exactly the native child belonging to this fixture package",
    );
    process.kill(Number(owned[0][1]), "SIGKILL");
    await wait(() => latestReceipt()?.outcome === "unknown");
    await new Promise((accept) => setTimeout(accept, 500));
    assert.equal(
      requests.length,
      interruptedRequest,
      "unknown must not resend",
    );
    const logs = readFileSync(join(data, "logs/main.jsonl"), "utf8");
    const events = logs
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const receipt = latestReceipt();
    assert.ok(
      events.some(
        (event) =>
          event.traceId === receipt.traceId &&
          event.receiptState === "acknowledged" &&
          event.outcome === "unknown",
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.operation === "runtime:host" && event.stage === "exited",
      ),
    );
    assert.ok(
      events.every((event) => event.build.dirty === false),
      "validate a clean, identified bundle",
    );
    assert.ok(
      !logs.includes("PACKAGE_FIRST_INPUT"),
      "diagnostics must not mirror content",
    );
    const resultPath = join(
      root,
      combination ? "s5-result.json" : "rewrite-result.json",
    );
    const logPath = join(
      root,
      combination ? "s5-main.jsonl" : "rewrite-main.jsonl",
    );
    writeFileSync(logPath, logs);
    const native = db.prepare("SELECT * FROM native_session").get();
    writeFileSync(
      resultPath,
      JSON.stringify(
        {
          bundle,
          ...(combination
            ? {
                sourceBundle,
                fixtureBundleModification,
                combinationEvidence,
                providerEvents,
                limitations: [
                  "localhost deterministic fixture; no real supplier account or billing",
                  "CDP composition events; no system IME proof",
                  "paused nonempty queue abandonment/complete quit still pending S3 09",
                  "engineering evidence is separate from user trial/acceptance",
                ],
              }
            : {}),
          project,
          data,
          config,
          environment: sandbox.env,
          providerCalls: requests.length,
          native,
          receipts: db
            .prepare("SELECT receipt FROM submission")
            .all()
            .map((r) => {
              const { text, ...fields } = JSON.parse(r.receipt);
              return fields;
            }),
          build: events[0].build,
          checks: [
            ...combinationChecks,
            "v1 migration",
            "real browser composition events block dispatch (CDP, not system IME)",
            "two turns and native write",
            "same live session after window reload",
            "raw CRLF/CR/LF file and diff selection",
            "frozen input references after disk refresh and renderer reload",
            "theme and density",
            "language changes retain the mounted editor and exact references",
            "ACK then native child interrupted",
            "unknown persisted without resend",
            "same-trace receipt outcome and distinct Host exit",
          ],
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`PASS: rewrite package integrated paths. Evidence: ${root}`);
    child.kill("SIGKILL");
    await wait(() => child.exitCode !== null || child.signalCode !== null);
    socket.onclose = null;
    socket.close();
    child = launch();
    socket = await connect();
    socket.onclose = onClose;
    socket.onmessage = onMessage;
    await wait(() =>
      evaluate("document.body?.textContent.includes('当前只读历史')"),
    );
    assert.equal(
      await evaluate(
        "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='发送')?.disabled",
      ),
      true,
      "cold native session recovery has no single-writer proof",
    );
    assert.equal(
      db.prepare("SELECT session_id FROM native_session").get().session_id,
      session,
    );
    assert.equal(latestReceipt().outcome, "unknown");
    assert.ok(
      await evaluate(
        "document.querySelector('[contenteditable=true]')?.textContent.includes('COLD_PENDING_DRAFT')",
      ),
    );
    assert.ok(latestReceipt().text.includes(rawFile));
    assert.ok(latestReceipt().text.includes(changedFile));
    await click("读取原生记录");
    await wait(() =>
      evaluate(
        "document.querySelector('[aria-label=只读原生会话历史]')?.textContent.includes('PACKAGE_SECOND_REPLY')",
      ),
    );
    await evaluate("document.querySelector('[contenteditable=true]').focus()");
    await call("Input.insertText", { text: "COLD_RECOVERY_DRAFT" });
    await wait(() =>
      db
        .prepare("SELECT body FROM thread WHERE id=?")
        .get(thread)
        ?.body.includes("COLD_RECOVERY_DRAFT"),
    );
    await click("raw-selection.txt");
    await wait(() =>
      evaluate(
        "document.querySelector('.monaco-editor')?.textContent.includes('CHANGED')",
      ),
    );
    await new Promise((accept) => setTimeout(accept, 500));
    assert.equal(
      requests.length,
      interruptedRequest,
      "cold reopen must not send or create replacement native work",
    );
    const coldProcesses = spawnSync("/bin/ps", ["-ww", "-axo", "command="], {
      encoding: "utf8",
      env: sandbox.env,
    });
    assert.ok(
      !coldProcesses.stdout.includes(
        join(bundle, "Contents/Resources/sdk/host.mjs"),
      ),
      "cold reopen must not spawn a native writer",
    );
    const coldShot = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(
      join(root, "package-cold-recovery.png"),
      Buffer.from(coldShot.data, "base64"),
    );
    const result = JSON.parse(readFileSync(resultPath, "utf8"));
    result.checks.push(
      "cold reopen remains read-only with preserved history, draft and file access",
    );
    result.coldRecovery = {
      providerCalls: requests.length,
      sameNativeSession: true,
      outcome: latestReceipt().outcome,
      nativeChildSpawned: false,
    };
    writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");
    writeFileSync(logPath, readFileSync(join(data, "logs/main.jsonl"), "utf8"));
    console.log(
      `PASS: cold recovery stays read-only and content stays accessible. Evidence: ${root}`,
    );
    if (combination)
      console.log(
        JSON.stringify({
          result: resultPath,
          logs: logPath,
          root,
          checks: result.checks,
          providerCalls: requests.length,
        }),
      );
    void call("Browser.close").catch(() => {});
    await wait(() => child.exitCode !== null);
  } else {
    // Browser.close is used only after verified idle; product's before/will-quit guards remain installed.
    void call("Browser.close").catch(() => {});
    await wait(() => child.exitCode !== null);
  }
} catch (error) {
  try {
    await captureFailure?.();
  } catch {}
  console.error(`Package failure evidence: ${root}`);
  throw error;
} finally {
  socket?.close();
  if (child.exitCode === null) child.kill("SIGTERM");
  server.close();
  for (const socket of sockets) socket.destroy();
  db.close();
}
