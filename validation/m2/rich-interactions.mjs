import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-rich-interactions-" });
const output = resolve(
  process.argv[2] ??
    ".scratch/session-components/evidence/rich-interactions.json",
);
const vite = await createViteServer({
  configFile: false,
  root: resolve("."),
  cacheDir: join(isolated.root, "vite-cache"),
  optimizeDeps: { entries: [resolve("validation/m2/rich-interactions.html")] },
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
const url = `http://127.0.0.1:${vite.httpServer.address().port}/validation/m2/rich-interactions.html`;
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

const facts = {
  kind: "isolated-renderer-fixture",
  nativeOrProvider: false,
  systemIme: false,
  electron: "44.4.5",
  states: [],
  sourceCheckpoint: {
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty:
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim().length > 0,
    files: Object.fromEntries(
      [
        "src/app/renderer/workbench/attention-location.ts",
        "src/app/renderer/workbench/native-interaction.tsx",
        "src/app/renderer/workbench/decision-dock.tsx",
        "src/modules/execution/renderer/runtime/runtime-model.ts",
        "validation/m2/rich-interactions.tsx",
        "validation/m2/rich-interactions.mjs",
      ].map((path) => [
        path,
        createHash("sha256").update(readFileSync(path)).digest("hex"),
      ]),
    ),
  },
};
async function click(selector) {
  await call("Page.bringToFront");
  const point = await evaluate(
    `(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing target');e.scrollIntoView({block:'nearest'});await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
  );
  const hit = await evaluate(
    `(()=>{const e=document.elementFromPoint(${point.x},${point.y});return {hit:e?.outerHTML.slice(0,300),ok:Boolean(e?.closest(${JSON.stringify(selector)}))};})()`,
  );
  assert.equal(hit.ok, true, JSON.stringify({ selector, point, hit }));
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  for (const type of ["mousePressed", "mouseReleased"])
    await call("Input.dispatchMouseEvent", {
      type,
      ...point,
      button: "left",
      clickCount: 1,
    });
  await evaluate(
    "new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))",
  );
}
async function button(text, surface = "timeline") {
  const id = await evaluate(
    `(()=>{const e=[...document.querySelectorAll('[data-editor-surface="${surface}"][aria-label="确认迁移方案"] button')].find(e=>e.textContent===${JSON.stringify(text)});if(!e)throw Error('Missing button');document.querySelector('#rich-button')?.removeAttribute('id');e.id='rich-button';return '#rich-button';})()`,
  );
  await click(id);
}
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
    if (!request) {
      if (message.method === "Runtime.exceptionThrown")
        console.error(JSON.stringify(message));
      return;
    }
    pending.delete(message.id);
    message.error
      ? request.reject(Error(message.error.message))
      : request.resolve(message.result);
  };
  await call("Runtime.enable");
  await call("Page.reload", { ignoreCache: true });
  await wait(() =>
    evaluate(
      "!!window.richInteractionProbe && document.querySelectorAll('[role=radio]').length===4",
    ),
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[role=radio][aria-label=保留现有配置]').getAttribute('aria-checked')",
    ),
    "false",
  );
  await evaluate(
    "window.richClicks=[];for(const type of ['click','pointerdown','pointerup'])document.addEventListener(type,e=>window.richClicks.push({type,text:e.target.textContent.slice(0,30)}),true)",
  );
  await button("预览：保留现有配置");
  await wait(() =>
    evaluate("!!document.querySelector('.rich-ask-preview pre')"),
  );
  mkdirSync(resolve(output, ".."), { recursive: true });
  await evaluate(
    "document.querySelector('.rich-ask-preview').scrollIntoView({block:'nearest'})",
  );
  for (const theme of ["light", "dark"]) {
    await evaluate(
      `document.documentElement.dataset.theme=${JSON.stringify(theme)}`,
    );
    await evaluate(
      "new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))",
    );
    const geometry = await evaluate(
      "({width:innerWidth,scroll:document.documentElement.scrollWidth,preview:document.querySelector('.rich-ask-preview').getBoundingClientRect().toJSON(),cards:[...document.querySelectorAll('.native-interaction')].map(e=>e.getBoundingClientRect().toJSON())})",
    );
    assert.ok(geometry.scroll <= geometry.width, "No horizontal overflow");
    facts.states.push({ theme, geometry });
    const shot = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(
      resolve(output, `../rich-interactions-${theme}.png`),
      Buffer.from(shot.data, "base64"),
    );
  }
  await click('[role=radio][aria-label="保留现有配置"]');
  await button("下一题");
  await wait(() =>
    evaluate("!!document.querySelector('input[aria-label=读取历史]')"),
  );
  await click('input[aria-label="读取历史"]');
  await button("其他回答");
  await wait(() => evaluate("!!document.querySelector('textarea')"));
  await click("textarea");
  await call("Input.insertText", { text: "  中文组合草稿  " });
  const pointer = await evaluate(
    "({outline:getComputedStyle(document.activeElement).outlineStyle,visible:document.activeElement.matches(':focus-visible')})",
  );
  assert.equal(pointer.outline, "none", "Pointer input has no outline");
  await button("移到待办区");
  await wait(() =>
    evaluate(
      "document.querySelector('[data-editor-surface=dock] textarea')===document.activeElement",
    ),
  );
  assert.equal(
    await evaluate("document.querySelectorAll('textarea').length"),
    1,
  );
  assert.equal(
    await evaluate("document.querySelector('textarea').value"),
    "  中文组合草稿  ",
  );
  assert.equal(await evaluate("window.richInteractionProbe.writes.length"), 0);
  for (const type of ["keyDown", "keyUp"])
    await call("Input.dispatchKeyEvent", {
      type,
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
  const keyboard = await evaluate(
    "({outline:getComputedStyle(document.activeElement).outlineStyle,visible:document.activeElement.matches(':focus-visible')})",
  );
  assert.equal(keyboard.visible, true);
  assert.equal(keyboard.outline, "solid");
  facts.activation = await evaluate(`(()=>{
    const probe=window.richInteractionProbe, view=probe.model.getSnapshot();
    const key={threadId:view.threadId,nativeSessionKey:view.interactions.nativeSessionKey,connectionGeneration:view.interactions.connectionGeneration,requestId:'A'};
    const sample=k=>{const outcome=probe.locateRequest(k);return {outcome,surface:document.activeElement.dataset.editorSurface??null,owner:document.activeElement.dataset.editorOwner??null};};
    return {exact:sample(key),oldGeneration:sample({...key,connectionGeneration:crypto.randomUUID()}),otherSession:sample({...key,nativeSessionKey:'different native 中文'}),again:sample(key),draft:probe.model.interactionDraft('A').ask.answers.features.customInput,writes:probe.writes.length};
  })()`);
  assert.deepEqual(facts.activation.exact, {
    outcome: "located",
    surface: "dock",
    owner: "true",
  });
  assert.deepEqual(facts.activation.again, facts.activation.exact);
  assert.equal(facts.activation.oldGeneration.outcome, "target-unavailable");
  assert.equal(facts.activation.otherSession.outcome, "target-unavailable");
  assert.equal(facts.activation.oldGeneration.surface, null);
  assert.equal(facts.activation.otherSession.surface, null);
  assert.equal(facts.activation.draft, "  中文组合草稿  ");
  assert.equal(facts.activation.writes, 0);
  await button("检查全部回答", "dock");
  await wait(() =>
    evaluate(
      "!!document.querySelector('[data-editor-surface=dock] .rich-ask-review')",
    ),
  );
  await button("发送回答", "dock");
  await wait(() => evaluate("window.richInteractionProbe.writes.length===1"));
  const writes = await evaluate("window.richInteractionProbe.writes");
  assert.deepEqual(writes, [
    {
      id: "A",
      answer: {
        kind: "ask",
        answers: [
          { id: "mode", selectedOptions: ["保留现有配置"] },
          {
            id: "features",
            selectedOptions: ["读取历史"],
            customInput: "  中文组合草稿  ",
          },
        ],
      },
    },
  ]);
  assert.equal(
    await evaluate(
      "window.richInteractionProbe.model.interactionOperation('B')",
    ),
    null,
  );
  facts.pointer = pointer;
  facts.keyboard = keyboard;
  facts.writes = writes;
  facts.singleEditor = true;
  facts.concurrentRequestUnaffected = true;
  const shot = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    resolve(output, "../rich-interactions-written.png"),
    Buffer.from(shot.data, "base64"),
  );
  writeFileSync(output, JSON.stringify(facts, null, 2));
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN)
    console.error(
      await evaluate(
        "({probe:!!window.richInteractionProbe,radios:document.querySelectorAll('[role=radio]').length,text:document.body.innerText.slice(0,2000),title:document.title,draft:window.richInteractionProbe?.model.interactionDraft('A'),button:document.querySelector('#rich-button')?.outerHTML,clicks:window.richClicks})",
      ),
    );
  console.error(stderr.slice(-4000));
  throw error;
} finally {
  socket?.close();
  const stopped =
    child.exitCode === null && child.signalCode === null
      ? once(child, "close")
      : Promise.resolve();
  const killTimeout = setTimeout(() => child.kill("SIGKILL"), 5000);
  child.kill();
  await stopped;
  clearTimeout(killTimeout);
  await vite.close();
  isolated.cleanup();
}
console.log(
  "PASS: isolated Electron rich form, shared editor, preview, pointer/keyboard focus and exact grouped answer; no native/provider/system IME claim",
);
