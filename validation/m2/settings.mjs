import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-settings-" });
const output = resolve(
  process.argv[2] ?? ".scratch/settings-ui/evidence/native.json",
);
const vite = await createViteServer({
  configFile: false,
  root: resolve("."),
  cacheDir: join(isolated.root, "vite-cache"),
  optimizeDeps: { entries: [resolve("validation/m2/settings.html")] },
  plugins: [react(), tailwindcss()],
  define: {
    __D_PI_BUILD__: JSON.stringify({
      version: "rendering-fixture",
      commit: "working-tree",
      dirty: true,
      id: "isolated-rendering",
    }),
  },
  resolve: { alias: { "@": resolve("src/app/renderer") } },
  server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
});
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/validation/m2/settings.html`;
const ports = createServer();
await new Promise((done) => ports.listen(0, "127.0.0.1", done));
const port = ports.address().port;
await new Promise((done) => ports.close(done));
const main = join(isolated.root, "main.cjs");
writeFileSync(
  main,
  `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(isolated.data)});app.whenReady().then(()=>{const w=new BrowserWindow({width:1120,height:820,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.loadURL(${JSON.stringify(url)});});app.on('window-all-closed',()=>app.quit());`,
);
const child = spawn(
  realpathSync(
    "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
  ),
  [main, `--remote-debugging-port=${port}`],
  { env: isolated.env, stdio: ["ignore", "pipe", "pipe"] },
);
let stderr = "";
child.stdout.resume();
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
let socket,
  sequence = 0;
const pending = new Map();
const pause = () => new Promise((done) => setTimeout(done, 40));
async function wait(fn) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await pause();
  }
  throw Error("Rendering probe timeout");
}
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const results = [];
try {
  const target = await wait(async () => {
    try {
      return (
        await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      ).find((t) => t.type === "page");
    } catch {
      return null;
    }
  });
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => {
    socket.onopen = done;
    socket.onerror = fail;
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data),
      request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error
      ? request.reject(Error(message.error.message))
      : request.resolve(message.result);
  };
  await wait(() =>
    evaluate("!!document.querySelector('.tiptap') && !!window.probe"),
  );
  const outputDirectory = resolve(output, "..");
  mkdirSync(outputDirectory, { recursive: true });
  const screenshots = [];
  const click = async (expression) => {
    const rect = await evaluate(
      `(()=>{const el=${expression};el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
    );
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"])
      await call("Input.dispatchMouseEvent", {
        type,
        ...rect,
        button: "left",
        clickCount: 1,
      });
  };
  const section = async (label) => {
    await click(
      `Array.from(document.querySelectorAll('.settings-navigation button')).find(b=>b.textContent.trim()===${JSON.stringify(label)})`,
    );
    await wait(() =>
      evaluate(
        `document.querySelector('.ui-settings-page:not([hidden]) h2').textContent===${JSON.stringify(label)}`,
      ),
    );
  };
  const shot = async (name) => {
    const result = await call("Page.captureScreenshot", { format: "png" });
    const file = join(outputDirectory, `${name}.png`);
    writeFileSync(file, Buffer.from(result.data, "base64"));
    screenshots.push(file);
  };
  await click("document.querySelector('button[aria-label=Settings]')");
  await wait(() => evaluate("!!document.querySelector('.ui-settings-modal')"));
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.ui-settings-page:not([hidden])').length",
    ),
    1,
  );
  const identity = await evaluate(
    "window.probe.model.getSnapshot().threadSelection.thread.context.threadId",
  );
  await shot("appearance-light");
  await section("General");
  const combobox =
    "document.querySelector('.ui-settings-page:not([hidden]) [role=combobox]')";
  await click(combobox);
  await wait(() => evaluate("!!document.querySelector('[role=option]')"));
  const portal = await evaluate(
    "({inDialog:!!document.querySelector('[role=option]').closest('.ui-settings-modal'),bounds:document.querySelector('.ui-select-popup').getBoundingClientRect().toJSON(),height:innerHeight})",
  );
  assert.equal(portal.inDialog, false);
  assert.ok(portal.bounds.bottom <= portal.height);
  await shot("general-select");
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowDown",
    code: "ArrowDown",
    windowsVirtualKeyCode: 40,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowDown",
    code: "ArrowDown",
    windowsVirtualKeyCode: 40,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await wait(() =>
    evaluate(
      "document.querySelector('.ui-settings-page:not([hidden]) [role=combobox]').getAttribute('aria-expanded')==='false' && !Array.from(document.querySelectorAll('.ui-select-positioner')).some(el=>el.getBoundingClientRect().width>0)",
    ),
  );
  assert.equal(
    await evaluate("document.activeElement.getAttribute('role')"),
    "combobox",
  );
  await section("Configuration");
  await wait(() =>
    evaluate(
      "document.querySelector('.ui-settings-page:not([hidden])').textContent.includes('/isolated/native-config')",
    ),
  );
  await shot("configuration-light");
  await section("Appearance");
  await click("document.querySelector('[role=radio][aria-label=Dark]')");
  await wait(() => evaluate("document.documentElement.dataset.theme==='dark'"));
  await shot("appearance-dark");
  await section("Notifications");
  await click("document.querySelector('[data-attention-system]')");
  await wait(() =>
    evaluate(
      "document.querySelector('[data-attention-system]').getAttribute('aria-checked')==='true'",
    ),
  );
  await shot("notifications-dark");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 640,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await section("Configuration");
  await shot("configuration-narrow-dark");
  const bounds = await evaluate(
    "Array.from(document.querySelectorAll('.ui-settings-page:not([hidden]) .ui-setting-row,.ui-settings-page:not([hidden]) input,.settings-modal-navigation')).map(el=>({name:el.className,...el.getBoundingClientRect().toJSON()}))",
  );
  assert.ok(
    bounds.every((b) => b.left >= 0 && b.right <= 640),
    JSON.stringify(bounds),
  );
  assert.equal(
    await evaluate(
      "window.probe.model.getSnapshot().threadSelection.thread.context.threadId",
    ),
    identity,
  );
  await click(
    "document.querySelector('.ui-settings-modal button[aria-label=Close]')",
  );
  await wait(() =>
    evaluate(
      "document.querySelector('.ui-settings-modal').hasAttribute('hidden')",
    ),
  );
  assert.equal(
    await evaluate("document.activeElement.getAttribute('aria-label')"),
    "Open or collapse project navigation",
  );
  writeFileSync(
    output,
    JSON.stringify(
      {
        kind: "isolated-Electron-App-fixture",
        screenshots,
        portal,
        bounds,
        checks: [
          "one-page",
          "select-portal",
          "keyboard-escape-focus",
          "explicit-theme-persistence",
          "notification-save",
          "narrow-bounds",
          "Thread-resource-preservation",
          "Modal-return-focus",
        ],
        limitations: [
          "mocked bridges; no real authentication or OS notification",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `PASS: settings Electron fixture; ${screenshots.length} captures; ${output}`,
  );
} finally {
  socket?.close();
  child.kill();
  await once(child, "exit").catch(() => {});
  await vite.close();
  isolated.cleanup();
}
