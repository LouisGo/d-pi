const { app, BrowserWindow, dialog } = require("electron");
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const root = mkdtempSync(join(tmpdir(), "d-pi-app-start-"));
const project = join(root, "project");
const config = join(root, "config");
mkdirSync(project);
mkdirSync(config);
const sentinel = join(root, "extension-loaded");
const extensions = join(project, ".omp", "extensions");
mkdirSync(extensions, { recursive: true });
writeFileSync(
  join(extensions, "sentinel.ts"),
  `import {writeFileSync} from "node:fs"; writeFileSync(${JSON.stringify(sentinel)},"loaded"); export default function() {}`,
);
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
}, 40000);
app.on("quit", () => {
  clearTimeout(deadline);
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
  await import(pathToFileURL(resolve("out/main/index.js")).href);
  const window = await wait(() => BrowserWindow.getAllWindows()[0]);
  await wait(() =>
    window.webContents
      .executeJavaScript("!!document.querySelector('button')")
      .catch(() => false),
  );
  const click = async (text) =>
    window.webContents.executeJavaScript(
      `(() => { const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button) throw Error('Button missing'); button.click(); })()`,
    );
  await click("选择项目并创建草稿");
  await wait(() =>
    window.webContents.executeJavaScript(
      "document.body.textContent.includes('允许项目执行')",
    ),
  );
  await click("读取原生记录");
  if (existsSync(sentinel)) throw Error("Browse loaded project extension");
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
  if (!existsSync(sentinel))
    throw Error("Trusted fixture extension was not discovered");
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
  const input = () =>
    window.webContents.executeJavaScript(
      "document.querySelector('[contenteditable=true]').innerHTML",
    );
  await window.webContents.executeJavaScript(
    "document.querySelector('[contenteditable=true]').focus()",
  );
  window.webContents.insertText(
    "https://github.com/a https://github.com.evil.test/b",
  );
  await wait(() =>
    window.webContents.executeJavaScript(
      "document.querySelectorAll('.url-icon').length === 2",
    ),
  );
  const before = await input();
  await window.webContents.executeJavaScript(
    "document.querySelector('[contenteditable=true]').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))",
  );
  await click("发送");
  await window.webContents.executeJavaScript(
    "document.querySelector('[contenteditable=true]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true,cancelable:true}))",
  );
  if ((await input()) !== before)
    throw Error("Composition Enter changed draft");
  await window.webContents.executeJavaScript(
    "document.querySelector('[contenteditable=true]').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))",
  );
  await click("展开编辑区");
  await window.webContents.executeJavaScript(
    "document.querySelector('[contenteditable=true]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}))",
  );
  await wait(() =>
    window.webContents.executeJavaScript(
      "document.querySelectorAll('[contenteditable=true] p').length > 1",
    ),
  );
  await click("收起编辑区");
  await click("切换发送快捷键");
  await wait(() =>
    window.webContents.executeJavaScript(
      "document.querySelector('.composer-footer').textContent.includes('⌘Enter 发送')",
    ),
  );
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(join(root, "app", "drafts.sqlite"));
  if (db.prepare("SELECT COUNT(*) AS n FROM submission").get().n !== 0)
    throw Error("IME or expanded Enter submitted input");
  if (
    db.prepare("SELECT send_key FROM desktop").get().send_key !==
    "enter-newline"
  )
    throw Error("Shortcut preference not durable");
  db.close();
  console.log(
    "PASS: real Composer composition guard, expanded newline, persisted shortcut preference and local URL icons",
  );
  passed = true;
  app.quit();
}
void run().catch((error) => {
  console.error(error.message);
  app.exit(1);
});
