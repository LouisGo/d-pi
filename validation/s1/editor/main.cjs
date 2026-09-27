const { app, BrowserWindow } = require("electron");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const directory = mkdtempSync(join(tmpdir(), "d-pi-s1-editor-"));
app.setPath("userData", directory);
app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 900,
    height: 800,
    title: "d-pi S1 接入验证",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.loadURL("http://localhost:5178");
});
app.on("window-all-closed", () => app.quit());
app.on("quit", () => rmSync(directory, { recursive: true, force: true }));
