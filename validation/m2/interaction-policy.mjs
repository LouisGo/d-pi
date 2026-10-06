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

const isolated = createTestEnvironment({ prefix: "d-pi-interaction-" });
const output = resolve(
  process.argv[2] ?? ".scratch/interaction-policy/evidence/native.json",
);
const vite = await createViteServer({
  configFile: false,
  root: resolve("."),
  cacheDir: join(isolated.root, "vite-cache"),
  optimizeDeps: { entries: [resolve("validation/m2/interaction.html")] },
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
const url = `http://127.0.0.1:${vite.httpServer.address().port}/validation/m2/interaction.html`;
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
    evaluate(
      "!!document.querySelector('.tiptap') && !!window.interactionProbe",
    ),
  );
  const facts = { states: [], selection: [] };
  const cursors = await evaluate(
    `Array.from(document.querySelectorAll('button,summary,a[href],select')).filter(el => getComputedStyle(el).cursor === 'pointer').map(el=>el.outerHTML.slice(0,140))`,
  );
  assert.deepEqual(cursors, [], "production App must not expose hand cursors");
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.brand')).userSelect",
    ),
    "none",
  );
  for (const selector of [
    ".conversation pre",
    ".tiptap",
    ".directory-info > span",
  ]) {
    assert.equal(
      await evaluate(
        `getComputedStyle(document.querySelector(${JSON.stringify(selector)})).userSelect`,
      ),
      "text",
      `production content: ${selector}`,
    );
  }
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.message-heading button')).userSelect",
    ),
    "none",
  );
  await evaluate("window.interactionProbe.show()");
  await wait(() =>
    evaluate(
      "!!document.querySelector('#probe-file .view-line') && !!document.querySelector('#probe-diff .view-line')",
    ),
  );
  const selectors = [
    "#probe-body",
    "#probe-icon svg",
    "#probe-summary",
    "#probe-file-summary",
    "#probe-link",
    "#probe-navigation",
    "#probe-selected",
    "#probe-disabled",
    "#probe-portal",
    "#probe-reading-button",
    "#probe-check",
    "#probe-checkbox-label",
  ];
  for (const theme of ["light", "dark"])
    for (const density of ["normal", "compact"]) {
      await evaluate(
        `document.documentElement.dataset.theme=${JSON.stringify(theme)};document.documentElement.dataset.density=${JSON.stringify(density)}`,
      );
      const styles = await evaluate(
        `(${JSON.stringify(selectors)}).map(s => {const el=document.querySelector(s),c=getComputedStyle(el);return {selector:s,cursor:c.cursor,select:c.userSelect,background:c.backgroundColor,color:c.color};})`,
      );
      assert.ok(
        styles.every((s) => s.cursor === "default" && s.select === "none"),
        JSON.stringify(styles),
      );
      const hand = await evaluate(
        "Array.from(document.querySelectorAll('#interaction-fixture *,#probe-portal')).filter(el=>getComputedStyle(el).cursor==='pointer').map(el=>el.outerHTML.slice(0,120))",
      );
      assert.deepEqual(hand, [], "including late imported Monaco and Diff CSS");
      facts.states.push({ theme, density, styles });
    }
  for (const selector of [
    "#probe-text",
    "#probe-file-meta",
    "#probe-input",
    "#probe-textarea",
    "#probe-file .view-line",
    "#probe-diff .view-line",
  ]) {
    const style = await evaluate(
      `(()=>{const c=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));return {cursor:c.cursor,select:c.userSelect};})()`,
    );
    assert.equal(style.cursor, "text", selector);
    if (!selector.includes(".view-line"))
      assert.notEqual(style.select, "none", selector);
  }
  async function drag(selector) {
    await evaluate("getSelection().removeAllRanges()");
    const rect = await evaluate(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`,
    );
    const y = rect.y + rect.height / 2,
      x = rect.x + 3,
      end = rect.x + Math.min(rect.width - 3, 300);
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    for (let i = 1; i <= 10; i++)
      await call("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: x + ((end - x) * i) / 10,
        y,
        button: "left",
        buttons: 1,
      });
    await call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: end,
      y,
      button: "left",
      clickCount: 1,
    });
    const text = await evaluate("getSelection().toString()");
    facts.selection.push({ selector, text });
    return text;
  }
  assert.equal(await drag("#probe-body"), "");
  assert.equal(await drag("#probe-reading-button"), "");
  assert.ok(
    (await drag("#probe-text")).length > 5,
    "native mouse selection is available on opted-in content",
  );
  assert.ok(
    (await drag("#probe-file-meta")).length > 5,
    "expanded file sampling metadata supports native selection",
  );
  // Real keyboard selection is handled by the installed Monaco instance.
  const codeRect = await evaluate(
    "(()=>{const r=document.querySelector('#probe-file .view-line').getBoundingClientRect();return {x:r.x+20,y:r.y+8};})()",
  );
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...codeRect,
    button: "left",
    clickCount: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...codeRect,
    button: "left",
    clickCount: 1,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    modifiers: 4,
    windowsVirtualKeyCode: 65,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    modifiers: 4,
  });
  await evaluate("new Promise(done => requestAnimationFrame(done))");
  const selection = await evaluate("window.interactionProbe.selection");
  assert.equal(selection?.kind, "selection");
  assert.equal(selection.text, "const pointer = 1;\nconst selected = 2;");
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...codeRect,
    button: "right",
    clickCount: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...codeRect,
    button: "right",
    clickCount: 1,
  });
  // The app imports editor.api, whose currently registered contributions may not
  // include a context menu. Check it when present; do not enable new product UI.
  await evaluate("new Promise(done => requestAnimationFrame(done))");
  facts.monacoContextMenu = await evaluate(
    "!!document.querySelector('.monaco-menu-container')",
  );
  if (facts.monacoContextMenu) {
    const menuHands = await evaluate(
      "Array.from(document.querySelectorAll('.monaco-menu-container *')).filter(el=>getComputedStyle(el).cursor==='pointer').map(el=>el.outerHTML.slice(0,100))",
    );
    assert.deepEqual(
      menuHands,
      [],
      "Monaco context menu must use arrow cursors",
    );
  }
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
  const documentNode = await call("DOM.getDocument");
  async function state(selector, pseudoClasses) {
    const { nodeId } = await call("DOM.querySelector", {
      nodeId: documentNode.root.nodeId,
      selector,
    });
    await call("CSS.forcePseudoState", {
      nodeId,
      forcedPseudoClasses: pseudoClasses,
    });
    await new Promise((done) => setTimeout(done, 200));
    return evaluate(
      `(()=>{const c=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));return {background:c.backgroundColor,color:c.color,outline:c.outlineStyle,decoration:c.textDecorationLine,border:c.borderColor};})()`,
    );
  }
  await call("DOM.enable");
  await call("CSS.enable");
  for (const selector of [
    "#probe-button",
    "#probe-icon",
    "#probe-summary",
    "#probe-link",
    "#probe-navigation",
    "#probe-selected",
  ]) {
    const resting = await state(selector, []),
      hovered = await state(selector, ["hover"]),
      pressed = await state(selector, ["hover", "active"]),
      focused = await state(selector, ["focus-visible"]);
    assert.notDeepEqual(hovered, resting, `${selector}: hover feedback`);
    assert.notDeepEqual(pressed, hovered, `${selector}: press feedback`);
    assert.equal(focused.outline, "solid", `${selector}: keyboard focus`);
    facts.states.push({ selector, resting, hovered, pressed, focused });
    await state(selector, []);
  }
  assert.deepEqual(
    await state("#probe-disabled", []),
    await state("#probe-disabled", ["hover", "active"]),
  );
  await evaluate(
    "document.querySelector('#probe-button').click();document.querySelector('#probe-disabled').click();document.querySelector('#probe-summary').click()",
  );
  assert.equal(await evaluate("window.interactionProbe.clicks"), 1);
  assert.equal(
    await evaluate(
      "document.querySelector('#probe-summary').parentElement.open",
    ),
    true,
  );
  const sash = await evaluate(
    "getComputedStyle(document.querySelector('#probe-diff .monaco-sash.vertical')).cursor",
  );
  assert.ok(["ew-resize", "col-resize"].includes(sash), sash);
  await evaluate("window.interactionProbe.showReading()");
  await wait(() =>
    evaluate(
      "!!document.querySelector('#bounded-interaction-fixture [data-reading-text]')",
    ),
  );
  for (const theme of ["light", "dark"])
    for (const density of ["normal", "compact"]) {
      await evaluate(
        `document.documentElement.dataset.theme=${JSON.stringify(theme)};document.documentElement.dataset.density=${JSON.stringify(density)}`,
      );
      const styles = await evaluate(
        `(()=>{const p=document.querySelector('#bounded-interaction-fixture [data-reading-text]'),c=getComputedStyle(p);return {cursor:c.cursor,select:c.userSelect,length:p.textContent.length,controls:Array.from(document.querySelectorAll('#bounded-interaction-fixture .reading-segment-controls button')).map(b=>{const s=getComputedStyle(b);return {cursor:s.cursor,select:s.userSelect};})};})()`,
      );
      assert.equal(styles.cursor, "text");
      assert.equal(styles.select, "text");
      assert.ok(styles.length <= 8192);
      assert.ok(
        styles.controls.every(
          (c) => c.cursor === "default" && c.select === "none",
        ),
      );
      const selection = await drag(
        "#bounded-interaction-fixture [data-reading-text]",
      );
      assert.ok(selection.length > 5);
      facts.states.push({ boundedReading: true, theme, density, styles });
    }
  const next = await evaluate(
    "(()=>{const r=document.querySelector('#bounded-interaction-fixture .reading-segment-controls button:last-child').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()",
  );
  for (const type of ["mousePressed", "mouseReleased"])
    await call("Input.dispatchMouseEvent", {
      type,
      ...next,
      button: "left",
      clickCount: 1,
    });
  await wait(() =>
    evaluate(
      "document.querySelector('#bounded-interaction-fixture [data-long-reading]').dataset.readingSegment==='1'",
    ),
  );
  facts.boundedReadingNavigation = true;
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, JSON.stringify(facts, null, 2));
  const shot = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    resolve(output, "../interaction-dark-compact.png"),
    Buffer.from(shot.data, "base64"),
  );
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
  "PASS: isolated Electron App/portal/Monaco/Diff cursors, native drag selection, editor selection and visual interaction states",
);
