const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const data = mkdtempSync(join(tmpdir(), "d-pi-viewer-validation-"));
app.setPath("userData", data);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let window;
let failure = false;
async function evaluate(source) {
  return window.webContents.executeJavaScript(source);
}
async function waitFor(predicate, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const snapshot = await evaluate("window.viewerProbe?.snapshot()");
    if (snapshot && predicate(snapshot)) return snapshot;
    await delay(25);
  }
  throw Error(
    `Timeout: ${label}; ${JSON.stringify(await evaluate("window.viewerProbe?.snapshot()"))}`,
  );
}
app.whenReady().then(async () => {
  try {
    window = new BrowserWindow({
      width: 860,
      height: 640,
      show: false,
      title: "d-pi Viewer validation",
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("console-message", (event) => {
      if (event.level === "error" || /worker/i.test(event.message))
        console.log(event.message);
    });
    await window.loadURL("http://127.0.0.1:5179");
    window.showInactive();
    const first = await waitFor(
      (state) => state.visible === "visible",
      "ready",
    );
    assert.equal(first.reads, 0);
    assert.equal(first.models, 0);
    assert.equal(first.created, 0);
    const evidence = [first];
    for (const kind of ["file", "diff"]) {
      await evaluate("window.viewerProbe.active(true)");
      await waitFor((state) => state.fileTargets > 0, "browser");
      await evaluate(`window.viewerProbe.open(${JSON.stringify(kind)})`);
      evidence.push(
        await waitFor(
          (state) => state.models === (kind === "file" ? 1 : 2),
          `${kind} models and Worker`,
        ),
      );
      await evaluate("window.viewerProbe.active(false)");
      evidence.push(
        await waitFor(
          (state) =>
            state.models === 0 &&
            state.activeWorkers === 0 &&
            state.queries === 0,
          `${kind} retired`,
        ),
      );
      await evaluate("window.viewerProbe.active(true)");
      evidence.push(
        await waitFor(
          (state) => state.models === (kind === "file" ? 1 : 2),
          `${kind} target restored`,
        ),
      );
      window.hide();
      evidence.push(
        await waitFor(
          (state) =>
            state.visible === "hidden" &&
            state.models === 0 &&
            state.activeWorkers === 0 &&
            state.queries === 0,
          "window hidden",
        ),
      );
      window.showInactive();
      evidence.push(
        await waitFor(
          (state) => state.models === (kind === "file" ? 1 : 2),
          "window visible",
        ),
      );
      await evaluate("window.viewerProbe.active(false)");
      evidence.push(
        await waitFor(
          (state) =>
            state.models === 0 &&
            state.activeWorkers === 0 &&
            state.queries === 0,
          "end of round",
        ),
      );
    }
    console.log(
      JSON.stringify({
        kind: "viewer-resource-validation",
        electron: process.versions.electron,
        evidence,
      }),
    );
  } catch (error) {
    console.error(error);
    failure = true;
  } finally {
    window?.destroy();
    rmSync(data, { recursive: true, force: true });
    app.exit(failure ? 1 : 0);
  }
});
app.on("quit", () => rmSync(data, { recursive: true, force: true }));
