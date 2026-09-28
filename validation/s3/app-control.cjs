const { app, BrowserWindow, dialog } = require("electron");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { createServer } = require("node:http");
const { DatabaseSync } = require("node:sqlite");
const requests = [];
const evidenceDirectory = resolve(
  process.env.D_PI_VALIDATION_EVIDENCE_DIR ??
    ".scratch/m1-s3-control-recovery/evidence",
);
const server = createServer(async (req, res) => {
  let body = "";
  for await (const bytes of req) body += bytes.toString();
  requests.push(body);

  if (requests.length === 3) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: "isolated fixture failure",
          type: "invalid_request_error",
        },
      }),
    );
    return;
  }
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
  if (requests.length === 1) return;
  await new Promise((r) => setTimeout(r, 250));
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
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] });
let passed = false;
const deadline = setTimeout(() => {
  console.error("App startup GUI check timed out");
  app.exit(1);
}, 90000);
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
  mkdirSync(join(config, "extensions"));
  writeFileSync(
    join(config, "extensions", "s3.ts"),
    `import { writeFileSync } from 'node:fs';
export default function(pi) { pi.registerCommand('s3ask', { description: 'Fixture', handler: async (_, ctx) => {
  const a = await ctx.ui.confirm('S3 确认', '确认测试操作？');
  const b = await ctx.ui.select('S3 选择', ['选项甲', '选项乙']);
  const c = await ctx.ui.input('S3 输入');
  const d = await ctx.ui.editor('S3 编辑', '预填内容');
  writeFileSync(${JSON.stringify(join(project, "answers.json"))}, JSON.stringify([a,b,c,d]));
} }); }`,
  );
  await import(pathToFileURL(resolve("out/main/index.js")).href);
  let window = await wait(() => BrowserWindow.getAllWindows()[0]);
  const js = (code) => window.webContents.executeJavaScript(code);
  const body = () => js("document.body.textContent");
  const click = async (text) => {
    console.log("click", text);
    await wait(() =>
      js(
        `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled)`,
      ),
    );
    return js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`,
    );
  };
  const input = async (text) => {
    await js("document.querySelector('[contenteditable=true]').focus()");
    window.webContents.insertText(text);
    await wait(() =>
      js(
        `document.querySelector('[contenteditable=true]').textContent.includes(${JSON.stringify(text)})`,
      ),
    );
  };
  await click("选择项目并创建草稿");
  await click("允许项目执行");
  await click("启动 OMP");
  await wait(async () => (await body()).includes("模型：fixture/fixture"));
  await input("FIRST_PRODUCT_INPUT");
  await click("发送");
  await wait(() => requests.length === 1);
  await wait(() =>
    js("document.querySelector('[contenteditable=true]').textContent === ''"),
  );
  await input("SECOND_PRODUCT_INPUT");
  await click("排队发送");
  await wait(async () =>
    (await body()).includes("待处理：SECOND_PRODUCT_INPUT"),
  );
  await click("停止并暂缓队列");
  await wait(async () => (await body()).includes("队列已暂缓"));
  await new Promise((r) => setTimeout(r, 350));
  if (requests.length !== 1) throw Error("Queue consumed after stop");
  await window.webContents.reload();
  await wait(async () => (await body()).includes("队列已暂缓"));
  if (requests.length !== 1) throw Error("Reload replayed input");
  await click("明确继续");
  await wait(() => requests.length === 2);
  await wait(() =>
    js(
      "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='发送' && !b.disabled)",
    ),
  );
  if (!requests[1].includes("SECOND_PRODUCT_INPUT"))
    throw Error("Native queue lost content");
  console.log(
    "PASS: real GUI queue → stop → reload → explicit continue, no replay",
  );
  await input("/s3ask");
  await click("发送");
  await wait(async () => (await body()).includes("确认测试操作？"));
  await wait(() =>
    js("document.querySelector('[contenteditable=true]').textContent === ''"),
  );
  await input("PRESERVED_DURING_DIALOG");
  const blocked =
    await js(`Array.from(document.querySelectorAll('.composer button'))
    .filter(b => ['发送','排队发送','干预当前执行'].includes(b.textContent.trim()))
    .every(b => b.disabled)`);
  if (!blocked) throw Error("Submission enabled during native dialog");
  window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
  await new Promise((r) => setTimeout(r, 150));
  const duringDialog = new DatabaseSync(join(root, "app", "drafts.sqlite"));
  if (
    duringDialog.prepare("SELECT count(*) AS total FROM submission").get()
      .total !== 3
  )
    throw Error("Keyboard submission bypassed dialog admission");
  duringDialog.close();
  await click("确认");
  await click("选项乙");
  await wait(() =>
    js("!!document.querySelector('textarea[aria-label=\"S3 输入\"]')"),
  );
  await js(
    "document.querySelector('textarea[aria-label=\"S3 输入\"]').focus()",
  );
  window.webContents.insertText("测试回答");
  await click("提交回答");
  await wait(() =>
    js("!!document.querySelector('textarea[aria-label=\"S3 编辑\"]')"),
  );
  await click("紧凑密度");
  await js("document.querySelector('[aria-label=切换为深色主题]').click()");
  await wait(() =>
    js(
      "document.documentElement.dataset.theme === 'dark' && document.documentElement.dataset.density === 'compact'",
    ),
  );
  await js(
    "document.querySelector('textarea').scrollIntoView({block:'center'}); document.querySelector('textarea').focus()",
  );
  await js(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
  );
  mkdirSync(evidenceDirectory, {
    recursive: true,
  });
  writeFileSync(
    join(evidenceDirectory, "s3-dark.png"),
    (await window.webContents.capturePage()).toPNG(),
  );
  await click("正常密度");
  await js("document.querySelector('[aria-label=切换为浅色主题]').click()");
  await wait(() =>
    js(
      "document.documentElement.dataset.theme === 'light' && document.documentElement.dataset.density === 'normal'",
    ),
  );
  await js(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
  );
  writeFileSync(
    join(evidenceDirectory, "s3-light.png"),
    (await window.webContents.capturePage()).toPNG(),
  );
  await click("提交回答");
  await wait(() =>
    require("node:fs").existsSync(join(project, "answers.json")),
  );
  const answers = JSON.parse(
    require("node:fs").readFileSync(join(project, "answers.json"), "utf8"),
  );
  if (
    JSON.stringify(answers) !==
    JSON.stringify([true, "选项乙", "测试回答", "预填内容"])
  )
    throw Error(`Wrong answers: ${JSON.stringify(answers)}`);
  console.log(
    "PASS: official extension confirm/select/input/editor receive GUI answers",
  );
  const db = new DatabaseSync(join(root, "app", "drafts.sqlite"));
  const receipts = db
    .prepare("SELECT receipt FROM submission")
    .all()
    .map((r) => JSON.parse(r.receipt));
  if (receipts.length !== 3 || receipts.some((r) => r.state !== "acknowledged"))
    throw Error("Missing durable receipts");
  db.close();
  await wait(() =>
    js(
      "Array.from(document.querySelectorAll('button')).some(b => b.textContent === '发送' && !b.disabled) && document.querySelector('[aria-label=项目执行]').textContent.includes('OMP 已就绪')",
    ),
  );
  if (
    !(
      await js("document.querySelector('[contenteditable=true]').textContent")
    ).includes("PRESERVED_DURING_DIALOG")
  )
    throw Error("Blocked submission lost the draft");
  console.log(
    "PASS: dialog blocks buttons and Enter without freezing a receipt; draft survives and send re-enables",
  );
  // A last dialog answer may precede the native idle frame. Select the normal
  // wait intent if Quit races that frame; never bypass the product exit guard.
  dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  passed = true;
  app.quit();
}
run().catch((error) => {
  console.error(error);
  for (const w of BrowserWindow.getAllWindows())
    w.webContents
      .executeJavaScript("document.body.textContent")
      .then(console.error);
  setTimeout(() => app.exit(1), 100);
});
