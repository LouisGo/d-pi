import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createTestEnvironment } from "../../scripts/test-environment.mjs";

const rewriting = process.argv.includes("--rewrite");
const sandbox = createTestEnvironment({ prefix: "d-pi-s3-package-" });
const root = realpathSync(sandbox.root);
const bundle = join(root, "Package With Spaces", "d-pi.app");
cpSync(
  resolve(process.argv[2] ?? "dist/s3-candidate/mac-arm64/d-pi.app"),
  bundle,
  {
    recursive: true,
    verbatimSymlinks: true,
  },
);
const { cwd: project, data, config } = sandbox;
const rawFile = "BEGIN😀\r\nSECOND\rTHIRD\nEND";
const changedFile = "CHANGED😀\r\nSECOND\rTHIRD\nEND";
const rawPreview = "BEGIN😀\nSECOND\nTHIRD\nEND";
const changedPreview = "CHANGED😀\nSECOND\nTHIRD\nEND";
if (rewriting) {
  writeFileSync(
    join(project, "raw-selection.txt"),
    "INITIAL\r\nSECOND\rTHIRD\nEND",
  );
  for (const args of [
    ["init", "-q"],
    ["add", "raw-selection.txt"],
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
    const result = spawnSync("/usr/bin/git", ["-C", project, ...args], {
      env: sandbox.env,
    });
    assert.equal(result.status, 0, result.stderr?.toString());
  }
  writeFileSync(join(project, "raw-selection.txt"), rawFile);
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
const sockets = new Set();
const server = createServer(async (req, res) => {
  let text = "";
  for await (const bytes of req) text += bytes.toString();
  requests.push(text);
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
    `data: ${JSON.stringify(frame({ role: "assistant", content: firstReply ? "PACKAGE_FIRST_REPLY\n\n```ts\nconst value = 1;\n```\n[GitHub](https://github.com/can1357/oh-my-pi)" : requests.length === 4 && rewriting ? "PACKAGE_INTERRUPTED_REPLY" : "PACKAGE_SECOND_REPLY" }, null))}\n\n`,
  );
  // Leave only the deliberately interrupted third submission active.
  if (rewriting && requests.length === 4) return;
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
  const click = (text) =>
    evaluate(
      `(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b || b.disabled)throw Error('Button unavailable');b.click();})()`,
    );
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
    await wait(() =>
      evaluate(
        "window.fixtureIME.includes('end') && document.querySelector('[contenteditable=true]').textContent===''",
      ),
    );
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
        `document.querySelector('[aria-label=会话阅读]').textContent.includes(${JSON.stringify(reply)})`,
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
  await click("读取原生记录");
  await wait(() =>
    evaluate(
      "document.querySelector('[aria-label=只读原生历史]').textContent.includes('PACKAGE_SECOND_REPLY')",
    ),
  );
  if (rewriting) {
    assert.equal(
      readFileSync(join(project, "native-evidence.txt"), "utf8"),
      "NATIVE_TOOL_WRITE\n",
    );
    await wait(() =>
      evaluate(
        "document.querySelector('[aria-label=只读原生历史]').textContent.includes('原生工具结果证据')",
      ),
    );
    const selectAll = async () => {
      await call("Page.bringToFront");
      await evaluate(
        "Array.from(document.querySelectorAll('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea')).at(-1).focus()",
      );
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
      3,
      "window reload must not restart or resend native work",
    );
  }
  await wait(() =>
    evaluate(
      "document.querySelector('[aria-label=会话阅读] pre code')?.textContent.includes('const value')",
    ),
  );
  await evaluate(
    "document.querySelector('[aria-label=会话阅读] pre').scrollIntoView({block:'center'})",
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
  console.log(
    `PASS: relocated formal package, bundled official SDK, v1 migration, two turns/same session, ACK consumption, direct reading/history. Evidence: ${root}`,
  );
  if (rewriting) {
    await evaluate("document.querySelector('[contenteditable=true]').focus()");
    await call("Input.insertText", { text: "PACKAGE_INTERRUPTED_INPUT" });
    await click("发送");
    await wait(() => requests.length === 4);
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
    assert.equal(requests.length, 4, "unknown must not resend");
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
    writeFileSync(join(root, "rewrite-main.jsonl"), logs);
    const native = db.prepare("SELECT * FROM native_session").get();
    writeFileSync(
      join(root, "rewrite-result.json"),
      JSON.stringify(
        {
          bundle,
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
        "document.querySelector('[aria-label=只读原生历史]').textContent.includes('PACKAGE_SECOND_REPLY')",
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
      4,
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
    const resultPath = join(root, "rewrite-result.json");
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
    writeFileSync(
      join(root, "rewrite-main.jsonl"),
      readFileSync(join(data, "logs/main.jsonl"), "utf8"),
    );
    console.log(
      `PASS: cold recovery stays read-only and content stays accessible. Evidence: ${root}`,
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
