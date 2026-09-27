const { app, BrowserWindow, ipcMain, clipboard } = require("electron");
const { readFileSync, mkdtempSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
app.setPath("userData", mkdtempSync(join(tmpdir(), "d-pi-paste-")));
const text = readFileSync(join(__dirname, "sample.md"), "utf8");
const html =
  '<p><strong>会被引导完成这个流程，但不会自动调用名为 <code>to-spec</code>、<code>to-ticket</code> 的特定 skill。</strong></p><p>目前仓库的引导链是：</p><p><strong>AGENTS.md → 功能开发 skill → 本地任务约定 → 当前 Spec 与 Tickets。</strong></p><p>它要求 AI：</p><ol><li>先读取或补齐当前切片的 Spec。</li><li>重要产品判断先与你同步，未确认前不实施依赖部分。</li><li>将明确的工作拆成有依赖、验收条件的 Tickets。</li><li>按票推进，更新状态，再逐段交付你试用。</li></ol><p>特定的 <code>to-tickets</code> 工具目前是可选的，<strong>规格和拆票这两项工作并非可选</strong>；已有合格产物则复用，不重复生成。</p><p>对于 <strong>S1，这个过程已经完成</strong>：<a href="/Users/louistation/MySpace/Life/d-pi/.scratch/m1-s1-project-draft/spec.md">S1 Spec</a>和四张任务票都已提交。新会话应先核对它们，再从 01 开始；如果验证导致 Spec 改变，就同步更新相关票，涉及重要产品选择仍须先问你。</p>';
app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 1000,
    height: 800,
    title: "S1 Markdown paste validation",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  ipcMain.handle("paste-fixture:copy", (event) => {
    if (event.sender !== window.webContents) throw Error("Invalid source");
    clipboard.write({ text, html });
    return { chars: text.length, types: ["text/plain", "text/html"] };
  });
  window.loadURL("http://127.0.0.1:5178");
});
app.on("window-all-closed", () => app.quit());
