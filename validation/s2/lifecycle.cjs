const { app, BrowserWindow, dialog } = require("electron");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { createServer } = require("node:http");
const { utilityProcess } = require("electron");
const originalFork = utilityProcess.fork;
utilityProcess.fork = (...args) => {
  const host = originalFork(...args);
  latestHost = host;
  return host;
};
const { DatabaseSync } = require("node:sqlite");
let releaseFirst;
let releaseThird;
let quitNotice = false;
let latestHost;
const requests = [];
const server = createServer(async (req, res) => {
  let body = "";
  for await (const bytes of req) body += bytes.toString();
  requests.push(body);

  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const frame = (delta, finish) => ({
    id: "fixture",
    object: "chat.completion.chunk",
    created: 1,
    model: "fixture",
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  res.write(
    `data: ${JSON.stringify(frame({ role: "assistant", content: requests.length === 1 ? "FIRST_PRODUCT_REPLY" : "SECOND_PRODUCT_REPLY" }, null))}\n\n`,
  );
  if (requests.length === 1)
    await new Promise((r) => {
      releaseFirst = r;
    });
  if (requests.length === 3)
    await new Promise((r) => {
      releaseThird = r;
    });
  res.write(`data: ${JSON.stringify(frame({}, "stop"))}\n\n`);
  res.end("data: [DONE]\n\n");
});
const root = mkdtempSync(join(tmpdir(), "d-pi-app-start-"));
const project = join(root, "project");
const config = join(root, "config");
mkdirSync(project);
mkdirSync(config);
const inheritedPath = process.env.PATH;
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, {
  PATH: inheritedPath || "/usr/bin:/bin",
  HOME: root,
  TMPDIR: tmpdir(),
  D_PI_DATA_DIR: join(root, "app"),
  PI_CODING_AGENT_DIR: config,
  PI_CONFIG_DIR: ".fixture-no-project-config",
});
writeFileSync(
  join(config, "models.yml"),
  JSON.stringify({
    providers: {
      fixture: {
        baseUrl: "http://127.0.0.1:1/v1",
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
dialog.showMessageBox = async (_window, options) => {
  quitNotice = options.message.includes("仍有原生工作");
  return { response: 0 };
};
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] });
let passed = false;
const deadline = setTimeout(() => {
  console.error("App startup GUI check timed out");
  app.exit(1);
}, 40000);
app.on("quit", () => {
  clearTimeout(deadline);
  server.close();
  rmSync(root, { recursive: true, force: true });
  if (!passed) process.exitCode = 1;
});
async function wait(fn) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Expected UI state not reached");
}
async function run() {
  await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
  const models = JSON.parse(
    require("node:fs").readFileSync(join(config, "models.yml"), "utf8"),
  );
  models.providers.fixture.baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  writeFileSync(join(config, "models.yml"), JSON.stringify(models));
  await import(pathToFileURL(resolve("out/main/index.js")).href);
  let window = await wait(() => BrowserWindow.getAllWindows()[0]);
  window.webContents.on("console-message", (event) =>
    console.log("renderer", event.message),
  );
  await wait(() =>
    window.webContents
      .executeJavaScript("!!document.querySelector('button')")
      .catch(() => false),
  );
  const click = async (text) => {
    console.log("click", text);
    return window.webContents.executeJavaScript(
      `(() => { const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button) throw Error('Button missing: '+document.body.textContent); button.click(); })()`,
    );
  };
  await click("选择项目并创建草稿");
  await wait(() =>
    window.webContents.executeJavaScript(
      "document.body.textContent.includes('允许项目执行')",
    ),
  );
  await click("允许项目执行");
  await wait(() =>
    window.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('button')).some(b=>b.textContent === '启动 OMP')",
    ),
  );
  await click("启动 OMP");
  await wait(() =>
    window.webContents.executeJavaScript(
      "document.body.textContent.includes('模型：fixture/fixture') && document.body.textContent.includes('OMP 已就绪')",
    ),
  );
  console.log(
    "PASS: product Renderer → validated preload/Main → trusted utility Host → official OMP ready",
  );
  for (const label of ["紧凑密度", "正常密度"]) await click(label);
  await window.webContents.executeJavaScript(
    "document.querySelector('[aria-label=\"切换为深色主题\"]').click()",
  );
  await wait(() =>
    window.webContents.executeJavaScript(
      "!!document.querySelector('[aria-label=\"切换为浅色主题\"]')",
    ),
  );
  console.log(
    "PASS: shared density and theme controls remain usable with runtime panel",
  );
  const body = () =>
    window.webContents.executeJavaScript("document.body.textContent");
  await window.webContents.executeJavaScript(
    "document.querySelector('[contenteditable=true]').focus()",
  );
  window.webContents.insertText("FIRST_PRODUCT_INPUT");
  await wait(() =>
    window.webContents.executeJavaScript(
      "document.querySelector('[contenteditable=true]').textContent.includes('FIRST_PRODUCT_INPUT')",
    ),
  );
  await click("发送");
  await wait(async () => (await body()).includes("FIRST_PRODUCT_REPLY"));
  app.quit();
  if (!quitNotice) throw Error("Active Quit was not protected");
  window.close();
  await wait(() => BrowserWindow.getAllWindows().length === 0);
  app.emit("activate");
  window = await wait(() => BrowserWindow.getAllWindows()[0]);
  await wait(() =>
    window.webContents
      .executeJavaScript(
        "document.body.textContent.includes('FIRST_PRODUCT_REPLY')",
      )
      .catch(() => false),
  );
  releaseFirst();
  console.log(
    "PASS: active Quit preserved task; close/reopen recovered direct-port snapshot while native streamed",
  );

  await wait(() =>
    window.webContents.executeJavaScript(
      "document.querySelector('[contenteditable=true]').textContent === ''",
    ),
  );
  await wait(() =>
    window.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('button')).some(b=>b.textContent === '发送' && !b.disabled)",
    ),
  );
  const db = new DatabaseSync(join(root, "app", "drafts.sqlite"));
  const session = db
    .prepare("SELECT session_id FROM native_session")
    .get().session_id;
  await window.webContents.executeJavaScript(
    "document.querySelector('[contenteditable=true]').focus()",
  );
  window.webContents.insertText("SECOND_PRODUCT_INPUT");
  await wait(() =>
    window.webContents.executeJavaScript(
      "document.querySelector('[contenteditable=true]').textContent.includes('SECOND_PRODUCT_INPUT')",
    ),
  );
  await click("发送");
  await window.webContents.executeJavaScript(
    "document.querySelector('[contenteditable=true]').focus()",
  );
  window.webContents.insertText("NEW_DRAFT_B");
  await wait(async () => (await body()).includes("SECOND_PRODUCT_REPLY"));
  await wait(() =>
    window.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('button')).some(b=>b.textContent === '发送' && !b.disabled)",
    ),
  );
  const text = await window.webContents.executeJavaScript(
    "document.querySelector('[contenteditable=true]').textContent",
  );
  if (!text.includes("NEW_DRAFT_B")) throw Error("New draft B was lost");
  if (
    requests.length !== 2 ||
    !requests[1].includes("FIRST_PRODUCT_INPUT") ||
    !requests[1].includes("FIRST_PRODUCT_REPLY")
  )
    throw Error("Two-turn native context missing");
  if (
    db.prepare("SELECT session_id FROM native_session").get().session_id !==
    session
  )
    throw Error("Native session changed");
  const receipts = db
    .prepare("SELECT receipt FROM submission")
    .all()
    .map((r) => JSON.parse(r.receipt));
  if (receipts.length !== 2 || receipts.some((r) => r.state !== "acknowledged"))
    throw Error("Durable ACK missing");
  await click("读取原生记录");
  await wait(() =>
    window.webContents.executeJavaScript(
      "document.querySelector('[aria-label=只读原生历史]').textContent.includes('SECOND_PRODUCT_REPLY')",
    ),
  );
  await window.webContents.executeJavaScript(
    "document.querySelector('[contenteditable=true]').focus()",
  );
  window.webContents.insertText("THIRD_FAULT_INPUT");
  await click("发送");
  await wait(() => requests.length === 3 && releaseThird);
  latestHost.kill();
  await wait(() =>
    window.webContents.executeJavaScript(
      "document.body.textContent.includes('原生状态待确认')",
    ),
  );
  releaseThird();
  const latest = JSON.parse(
    db
      .prepare("SELECT receipt FROM submission ORDER BY rowid DESC LIMIT 1")
      .get().receipt,
  );
  if (
    latest.outcome !== "unknown" ||
    !latest.text.includes("THIRD_FAULT_INPUT")
  )
    throw Error("Host failure did not preserve uncertain receipt/original");
  quitNotice = false;
  app.quit();
  if (!quitNotice) throw Error("Unknown active work was allowed to quit");
  console.log(
    "PASS: Host crash retains unknown receipt/original and blocks unsafe Quit",
  );
  db.close();
  console.log(
    "PASS: two product turns, same native context, durable ACK, A clear/B retained, direct-port reading and readonly native history",
  );
  passed = true;
  app.exit(0);
}
void run().catch((error) => {
  console.error(error.message);
  app.exit(1);
});
