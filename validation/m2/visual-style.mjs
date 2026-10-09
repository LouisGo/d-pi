import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-rendering-" });
const output = resolve(process.argv[2] ?? ".scratch/ui-first-polish/evidence");
const vite = await createViteServer({
  configFile: false,
  root: resolve("."),
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
const url = `http://127.0.0.1:${vite.httpServer.address().port}/validation/m2/rendering.html`;
const ports = createServer();
await new Promise((done) => ports.listen(0, "127.0.0.1", done));
const port = ports.address().port;
await new Promise((done) => ports.close(done));
const main = join(isolated.root, "main.cjs");
writeFileSync(
  main,
  `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(isolated.data)});app.whenReady().then(()=>{const w=new BrowserWindow({width:1000,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.loadURL(${JSON.stringify(url)});});app.on('window-all-closed',()=>app.quit());`,
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
try {
  const target = await wait(async () => {
    try {
      return (
        await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      ).find((target) => target.type === "page");
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
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error
      ? request.reject(Error(message.error.message))
      : request.resolve(message.result);
  };
  await wait(() =>
    evaluate(
      "!!document.querySelector('.tiptap') && !!document.querySelector('.conversation pre span[style*=\"--shiki-dark\"]')",
    ),
  );
  await wait(() =>
    evaluate("document.querySelectorAll('.thread-buttons button').length===3"),
  );
  mkdirSync(output, { recursive: true });
  const captures = [];
  async function capture(name, width, height) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate("window.probe.pause()");
    const geometry = await evaluate(`(() => {
      const rect = s => {const r=document.querySelector(s)?.getBoundingClientRect();return r&&{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
      const root=document.documentElement;
      const controls=[...document.querySelectorAll('.composer-footer button')].map(b=>({text:b.textContent,bottom:b.getBoundingClientRect().bottom,right:b.getBoundingClientRect().right}));
      const selected=document.querySelector('.thread-buttons [aria-current]');
      return {width:innerWidth,height:innerHeight,scrollWidth:root.scrollWidth,reading:rect('.thread-reading'),setup:rect('.thread-setup'),runtimeStatus:rect('.runtime-panel > strong'),composer:rect('.composer'),controls,selected:selected&&{color:getComputedStyle(selected).color,background:getComputedStyle(selected).backgroundColor,metaColor:getComputedStyle(selected.querySelector('small')).color}};
    })()`);
    assert.ok(
      geometry.scrollWidth <= width,
      `${name}: page overflows horizontally`,
    );
    if (geometry.reading)
      assert.ok(
        geometry.reading.height >= 56,
        `${name}: reading squeezed: ${JSON.stringify(geometry)}`,
      );
    if (geometry.runtimeStatus && name !== "settings-light-compact")
      assert.ok(
        geometry.runtimeStatus.bottom <= geometry.setup.bottom + 1,
        `${name}: runtime status clipped by setup`,
      );
    if (geometry.composer)
      assert.ok(
        geometry.composer.bottom <= height + 1,
        `${name}: composer clipped`,
      );
    assert.ok(
      geometry.controls.every(
        (c) => c.bottom <= height + 1 && c.right <= width + 1,
      ),
      `${name}: composer control clipped`,
    );
    const shot = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(
      join(output, name + ".png"),
      Buffer.from(shot.data, "base64"),
    );
    captures.push({ name, ...geometry });
  }
  await capture("readonly-light-normal", 1000, 800);
  await capture("readonly-light-minimum-en", 720, 540);
  await evaluate("document.querySelector('.toolbar > button').click()");
  await wait(() =>
    evaluate("window.probe.model.runtime?.getSnapshot()?.phase==='ready'"),
  );
  await capture("ready-light-normal", 1440, 900);
  await evaluate("window.probe.model.preference('theme')");
  await capture("ready-dark-normal", 1000, 800);
  await evaluate("window.probe.model.preference('density')");
  await capture("ready-dark-compact", 720, 540);
  await evaluate("window.probe.model.preference('theme')");
  await evaluate(
    `(()=>{const s=document.querySelector('.toolbar select');s.value='zh-CN';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await wait(() => evaluate("document.documentElement.lang==='zh-CN'"));
  await capture("ready-light-compact-zh", 1000, 800);
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await evaluate("document.querySelector('.tiptap').focus()");
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.tiptap')).outlineStyle",
    ),
    "solid",
  );
  await capture("editor-focus-light-compact", 1000, 800);
  await evaluate(
    "document.querySelector('.configuration-settings').open=true;document.querySelector('.model-controls').open=true",
  );
  await capture("settings-light-compact", 1000, 800);
  await evaluate(
    "document.querySelector('.configuration-settings').open=false;document.querySelector('.model-controls').open=false",
  );
  await evaluate("window.probe.model.preference('density')");
  await evaluate(
    "document.querySelectorAll('.thread-buttons button')[1].click()",
  );
  await wait(() =>
    evaluate(
      "window.probe.model.runtime?.getSnapshot()?.phase==='interrupted'",
    ),
  );
  await capture("readonly-light-minimum", 720, 540);
  await evaluate(
    "window.probe.model.stateStore.setState({...window.probe.model.stateStore.getState(),threadSelection:{kind:'empty'}})",
  );
  await wait(() =>
    evaluate("!!document.querySelector('[data-slot=empty-state]')"),
  );
  await capture("empty-light-normal", 1000, 800);
  writeFileSync(
    join(output, "geometry.json"),
    JSON.stringify(
      {
        fixture:
          "real Renderer in isolated Electron, synthetic bridges, no provider",
        captures,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      captures.map(({ name, reading, composer }) => ({
        name,
        reading: reading?.height,
        composer: composer?.height,
      })),
    ),
  );
} finally {
  socket?.close();
  const exited = new Promise((done) => child.once("exit", done));
  child.kill();
  await exited;
  await vite.close();
  isolated.cleanup();
}
