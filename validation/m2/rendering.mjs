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
const output = resolve(
  process.argv[2] ?? ".scratch/m2-first-release/evidence/rendering-native.json",
);
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
const results = [];
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
  await evaluate(
    "document.querySelector('.configuration-settings').open=true;document.querySelector('.model-controls').open=true",
  );
  await evaluate("window.probe.pause()");
  await evaluate(`document.querySelector('.reading-pane').scrollTop=300`);
  await evaluate(
    `window.begin=()=>{const original={shell:document.querySelector('.app-shell'),sidebar:document.querySelector('.sidebar'),toolbar:document.querySelector('.toolbar'),editor:document.querySelector('.tiptap'),body:document.querySelector('.conversation pre')};const buttons=[...document.querySelectorAll('button')];const opacities=buttons.map(b=>getComputedStyle(b).opacity);const samples=[];let running=true;const sample=()=>samples.push({shell:original.shell===document.querySelector('.app-shell'),sidebar:original.sidebar===document.querySelector('.sidebar'),toolbar:original.toolbar===document.querySelector('.toolbar'),editor:original.editor===document.querySelector('.tiptap'),body:original.body===document.querySelector('.conversation pre'),workspace:!!document.querySelector('.thread-workspace')?.getBoundingClientRect().height,scroll:document.querySelector('.reading-pane')?.scrollTop,buttonsStable:buttons.every(b=>b.isConnected),opacitiesStable:buttons.every((b,i)=>!b.isConnected||getComputedStyle(b).opacity===opacities[i]),opacityChanges:buttons.flatMap((b,i)=>b.isConnected&&getComputedStyle(b).opacity!==opacities[i]?[{text:b.textContent,navigationHistory:b.parentElement===document.querySelector('.toolbar > div'),original:opacities[i],current:getComputedStyle(b).opacity}]:[]),buttonDisabled:buttons.filter(b=>b.matches(':disabled')).length});const observer=new MutationObserver(sample);observer.observe(document.getElementById('root'),{subtree:true,childList:true,attributes:true});const tick=()=>{if(!running)return;sample();requestAnimationFrame(tick);};tick();window.end=()=>{running=false;observer.disconnect();return samples;};};`,
  );
  for (const key of ["theme", "sendKey", "density"]) {
    await evaluate("window.begin()");
    await evaluate(`window.probe.model.preference(${JSON.stringify(key)})`);
    await evaluate("window.probe.pause()");
    const samples = await evaluate("window.end()");
    assert.ok(samples.length > 3);
    assert.ok(
      samples.every(
        (s) =>
          s.shell &&
          s.sidebar &&
          s.toolbar &&
          s.editor &&
          s.body &&
          s.workspace &&
          s.buttonsStable &&
          s.opacitiesStable,
      ),
      `${key}: changed DOM or transient button opacity: ${JSON.stringify(samples.filter((s) => !(s.shell && s.sidebar && s.toolbar && s.editor && s.body && s.workspace && s.buttonsStable && s.opacitiesStable)))}`,
    );
    if (key !== "density")
      assert.ok(
        samples.every((s) => s.scroll === 300),
        `${key}: reading position changed`,
      );
    results.push({ operation: key, samples });
  }
  await evaluate("window.begin()");
  await evaluate(
    `(()=>{const s=document.querySelector('.toolbar select');s.value='zh-CN';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await wait(() => evaluate("document.documentElement.lang==='zh-CN'"));
  await evaluate("window.probe.pause()");
  const language = await evaluate("window.end()");
  assert.ok(
    language.every(
      (s) =>
        s.editor &&
        s.body &&
        s.workspace &&
        s.buttonsStable &&
        s.opacitiesStable,
    ),
    "language replaced stable content",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.reading-navigation').textContent.includes('原生历史')",
    ),
  );
  results.push({ operation: "language", samples: language });
  const screenshot = await call("Page.captureScreenshot", { format: "png" });
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(
    resolve(output, "..", "rendering-native.png"),
    Buffer.from(screenshot.data, "base64"),
  );
  await evaluate("window.begin()");
  await evaluate(
    "[...document.querySelectorAll('.thread-buttons button')][1].click()",
  );
  await wait(() =>
    evaluate(
      "document.querySelector('.tiptap').textContent==='B unsent draft'",
    ),
  );
  const navigation = await evaluate("window.end()");
  assert.ok(
    navigation.every(
      (s) =>
        s.shell &&
        s.sidebar &&
        s.toolbar &&
        s.workspace &&
        s.opacityChanges.every(
          (c) =>
            c.navigationHistory && c.original === "0.5" && c.current === "1",
        ),
    ),
    `Thread navigation cleared shell or workspace: ${JSON.stringify(navigation.filter((s) => !(s.shell && s.sidebar && s.toolbar && s.workspace && s.opacitiesStable)))}`,
  );
  results.push({ operation: "thread", samples: navigation });
  await evaluate("document.querySelector('.toolbar > button').click()");
  await wait(() =>
    evaluate("window.probe.model.runtime?.getSnapshot()?.phase==='ready'"),
  );
  assert.equal(
    await evaluate(
      "window.probe.runtimeCommands.filter(c=>c.kind==='start').length",
    ),
    1,
  );
  results.push({ operation: "new-thread", automaticallyStarted: true });
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(
    output,
    JSON.stringify(
      {
        electron: "44.4.5",
        fixture:
          "real App/Router/Zustand/Tiptap/Streamdown/Base UI, isolated deferred bridges; no OMP or provider",
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: results.map((r) => r.operation),
      samples: results.reduce((n, r) => n + (r.samples?.length ?? 0), 0),
      output,
    }),
  );
} catch (error) {
  console.error(stderr.slice(-6000));
  throw error;
} finally {
  socket?.close();
  const exited = new Promise((done) => child.once("exit", done));
  child.kill();
  await exited;
  await vite.close();
  isolated.cleanup();
}
