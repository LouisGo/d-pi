const { app, BrowserWindow, dialog } = require("electron");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { createServer } = require("node:http");
const { DatabaseSync } = require("node:sqlite");
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
  const fs = require("node:fs");
  const assert = require("node:assert/strict");
  const models = JSON.parse(
    fs.readFileSync(join(config, "models.yml"), "utf8"),
  );
  models.providers.fixture.baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  writeFileSync(join(config, "models.yml"), JSON.stringify(models));
  await import(pathToFileURL(resolve("out/main/index.js")).href);
  const window = await wait(() => BrowserWindow.getAllWindows()[0]);
  const js = (code) => window.webContents.executeJavaScript(code);
  const click = async (text) => {
    await wait(() =>
      js(
        `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled)`,
      ),
    );
    await js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`,
    );
  };
  const input = async (text) => {
    await js(
      `(() => { const editor=document.querySelector('[contenteditable=true]'); editor.focus(); const range=document.createRange(); range.selectNodeContents(editor); const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range); })()`,
    );
    window.webContents.insertText(text);
    await wait(() =>
      js(
        `document.querySelector('[contenteditable=true]').textContent===${JSON.stringify(text)}`,
      ),
    );
  };
  await click("选择项目并创建草稿");
  await click("允许项目执行");
  await click("启动 OMP");
  await wait(() =>
    js("document.body.textContent.includes('模型：fixture/fixture')"),
  );
  await input("FIRST_PRODUCT_INPUT");
  await click("发送");
  await wait(() => requests.length === 1);
  await wait(() =>
    js(
      "document.querySelector('[contenteditable=true]').textContent === '' && document.body.textContent.includes('OMP 已就绪')",
    ),
  );
  const db = new DatabaseSync(join(root, "app", "drafts.sqlite"));
  const binding = db.prepare("SELECT * FROM native_session").get();
  assert.ok(binding);
  const history = fs.readFileSync(binding.session_file, "utf8");
  const otherProject = join(root, "other-project");
  mkdirSync(otherProject);
  for (const text of [
    `/move:${otherProject}`,
    "/wt isolated-branch",
    "/worktree:isolated-branch",
    "/session:DELETE",
  ]) {
    await input(text);
    await click("发送");
    await wait(() =>
      js(
        "document.body.textContent.includes('当前不支持通过原生命令迁移或删除')",
      ),
    );
    assert.equal(
      await js("document.querySelector('[contenteditable=true]').textContent"),
      text,
    );
    assert.deepEqual(db.prepare("SELECT * FROM native_session").get(), binding);
    assert.equal(fs.readFileSync(binding.session_file, "utf8"), history);
    assert.equal(db.prepare("SELECT count(*) AS n FROM submission").get().n, 1);
    assert.equal(requests.length, 1);
  }
  await input("SECOND_PRODUCT_INPUT");
  await click("发送");
  await wait(() => requests.length === 2);
  await wait(() =>
    js(
      "document.querySelector('[contenteditable=true]').textContent === '' && document.body.textContent.includes('OMP 已就绪')",
    ),
  );
  assert.deepEqual(db.prepare("SELECT * FROM native_session").get(), binding);
  const receipts = db
    .prepare("SELECT receipt FROM submission")
    .all()
    .map((r) => JSON.parse(r.receipt));
  assert.equal(receipts.length, 2);
  assert.ok(receipts.every((r) => r.state === "acknowledged"));
  assert.ok(
    fs
      .readFileSync(binding.session_file, "utf8")
      .includes("SECOND_PRODUCT_INPUT"),
  );
  db.close();
  console.log(
    "PASS: formal GUI/Main/Host/official SDK rejects move, wt/worktree and session delete; draft/history/binding unchanged; next ordinary input acknowledged in same session",
  );
  dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  passed = true;
  app.quit();
}
run().catch(async (error) => {
  console.error(error);
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      console.error(
        await window.webContents.executeJavaScript("document.body.textContent"),
      );
    } catch {}
  }
  app.exit(1);
});
