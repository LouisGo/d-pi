import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = realpathSync(mkdtempSync(join(tmpdir(), "d-pi-s3-package-")));
const bundle = join(root, "Package With Spaces", "d-pi.app");
cpSync(resolve("dist/s3-candidate/mac-arm64/d-pi.app"), bundle, {
  recursive: true,
  verbatimSymlinks: true,
});
const project = join(root, "project");
const data = join(root, "data");
const config = join(root, "config");
for (const dir of [project, data, config]) mkdirSync(dir);
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
  res.write(
    `data: ${JSON.stringify(frame({ role: "assistant", content: requests.length === 1 ? "PACKAGE_FIRST_REPLY\n\n```ts\nconst value = 1;\n```\n[GitHub](https://github.com/can1357/oh-my-pi)" : "PACKAGE_SECOND_REPLY" }, null))}\n\n`,
  );
  await new Promise((r) => setTimeout(r, 300));
  res.write(`data: ${JSON.stringify(frame({}, "stop"))}\n\n`);
  res.end("data: [DONE]\n\n");
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
const child = spawn(binary, [`--remote-debugging-port=${port}`], {
  env: {
    PATH: process.env.PATH,
    HOME: root,
    TMPDIR: tmpdir(),
    D_PI_DATA_DIR: data,
    PI_CODING_AGENT_DIR: config,
    PI_CONFIG_DIR: ".fixture-project",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", () => {});
child.stderr.on("data", (bytes) => process.stderr.write(bytes));
child.on("exit", (code, signal) => console.log("package exit", code, signal));
let socket;
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
  await new Promise((r, reject) => {
    socket.onopen = r;
    socket.onerror = reject;
  });
  let sequence = 0;
  const pending = new Map();
  socket.onclose = () => {
    for (const entry of pending.values()) entry.reject(Error("CDP closed"));
    pending.clear();
  };
  socket.onmessage = (e) => {
    const message = JSON.parse(e.data);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry?.reject(Error(message.error.message));
      else entry?.resolve(message.result);
    }
  };
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
  const click = (text) =>
    evaluate(
      `(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b || b.disabled)throw Error('Button unavailable');b.click();})()`,
    );
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
    requests.length !== 2 ||
    !requests[1].includes("PACKAGE_FIRST_INPUT") ||
    !requests[1].includes("PACKAGE_FIRST_REPLY")
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
  // Browser.close is used only after verified idle; product's before/will-quit guards remain installed.
  void call("Browser.close").catch(() => {});
  await wait(() => child.exitCode !== null);
} finally {
  socket?.close();
  if (child.exitCode === null) child.kill("SIGTERM");
  server.close();
  db.close();
}
