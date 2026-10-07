import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";
import { createCdpClient } from "./cdp.mjs";
import { captureClipboard } from "./clipboard.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-reading-loop-" });
const output = resolve(".scratch/m2-first-release/evidence/reading-loop");
mkdirSync(output, { recursive: true });
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const dirty =
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
    .length > 0;
const vite = await createViteServer({
  configFile: false,
  root: resolve("."),
  cacheDir: join(isolated.root, "vite-cache"),
  optimizeDeps: { entries: [resolve("validation/m2/reading-loop.html")] },
  plugins: [react(), tailwindcss()],
  define: {
    __D_PI_BUILD__: JSON.stringify({
      version: "reading-fixture",
      commit,
      dirty,
      id: "reading-loop",
    }),
  },
  resolve: { alias: { "@": resolve("src/app/renderer") } },
  server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
});
await vite.listen();
const ports = createServer();
await new Promise((done) => ports.listen(0, "127.0.0.1", done));
const port = ports.address().port;
await new Promise((done) => ports.close(done));
const url =
  "http://127.0.0.1:" +
  vite.httpServer.address().port +
  "/validation/m2/reading-loop.html?thread-layout";
const main = join(isolated.root, "main.cjs");
writeFileSync(
  main,
  "const {app,BrowserWindow}=require('electron');app.setPath('userData'," +
    JSON.stringify(isolated.data) +
    ");app.whenReady().then(()=>{const w=new BrowserWindow({width:1180,height:812,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});w.loadURL(" +
    JSON.stringify(url) +
    ");});app.on('window-all-closed',()=>app.quit());",
);
const child = spawn(
  realpathSync(
    "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
  ),
  [main, "--remote-debugging-port=" + port],
  { env: isolated.env, stdio: ["ignore", "ignore", "pipe"] },
);
let stderr = "";
child.stderr.on("data", (data) => {
  stderr = (stderr + data).slice(-8192);
});
let socket;
let clipboard;
const results = [];
let passed = false;
async function wait(fn) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    const result = await fn();
    if (result) return result;
    if (child.exitCode !== null) throw Error("Electron exited: " + stderr);
    await new Promise((done) => setTimeout(done, 40));
  }
  throw Error("Reading loop probe timeout: " + stderr);
}
try {
  const target = await wait(async () => {
    try {
      return (
        await (await fetch("http://127.0.0.1:" + port + "/json/list")).json()
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
  const { call } = createCdpClient(socket);
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
  const frames = () =>
    evaluate(
      "new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(done))))",
    );
  async function click(text) {
    await evaluate(
      "(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===" +
        JSON.stringify(text) +
        "&&!b.disabled&&b.getClientRects().length);if(!b)throw Error('Missing button '+ " +
        JSON.stringify(text) +
        ");b.focus({preventScroll:true});b.click()})()",
    );
    await frames();
  }
  async function check(name, expression) {
    const value = await evaluate(expression);
    assert.ok(value, name + ": " + JSON.stringify(value));
    results.push({ name, result: value });
  }
  async function shot(name) {
    const result = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(
      join(output, name + ".png"),
      Buffer.from(result.data, "base64"),
    );
  }
  const pane = "document.querySelector('.reading-pane:not([hidden])')";
  const row = (id) =>
    pane + ".querySelector('[data-reading-row=\"" + id + "\"]')";
  const offset = (id) =>
    "(()=>{const p=" +
    pane +
    ",r=" +
    row(id) +
    ";return p.scrollTop-(r.getBoundingClientRect().top-p.getBoundingClientRect().top-p.clientTop+p.scrollTop)})()";
  await wait(() =>
    evaluate(
      "!!window.readingProbe && document.querySelectorAll('.conversation article').length===25 && !!document.querySelector('.tiptap')",
    ),
  );
  await evaluate(
    "window.__editor=document.querySelector('.tiptap');window.__source=document.querySelector('.conversation').dataset.readingSource",
  );
  // Follow starts only after an explicit list-bottom action or captured end.
  await evaluate(pane + ".scrollTop=99999999");
  await frames();
  await evaluate("window.readingProbe.append()");
  await frames();
  await check(
    "R1 retained live end follows a same-item update",
    "Math.abs(" +
      pane +
      ".scrollHeight-" +
      pane +
      ".scrollTop-" +
      pane +
      ".clientHeight)<=2",
  );
  await evaluate(
    "(()=>{const p=" +
      pane +
      ",r=" +
      row(10) +
      ";p.scrollTop=r.getBoundingClientRect().top-p.getBoundingClientRect().top-p.clientTop+p.scrollTop+40})()",
  );
  await frames();
  await evaluate("window.__offset=" + offset(10));
  await evaluate("window.readingProbe.sameSnapshot()");
  await frames();
  await check(
    "unchanged snapshot does not announce output",
    "!document.querySelector('[data-live-reading-controls]')?.textContent.includes('New output')",
  );
  await evaluate("window.readingProbe.append(1,'\\nMore effective text')");
  await frames();
  await check(
    "R2离尾同实体正文更新提示且不拉回",
    "Math.abs((" +
      offset(10) +
      ")-window.__offset)<=2 && document.querySelector('[data-live-reading-controls]')?.textContent.includes('New output')",
  );
  await shot("away-new-output-light");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 960,
    height: 640,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await frames();
  await check(
    "R2 width change keeps row offset",
    "Math.abs((" + offset(10) + ")-window.__offset)<=2",
  );
  await click("Back to list bottom");
  await check(
    "R14 list bottom does not turn the raw segment",
    "document.querySelector('.conversation [data-reading-segment]').dataset.readingSegment==='0'",
  );
  await click("Latest segment");
  await check(
    "R14 manual latest selects effective final segment",
    "Number(document.querySelector('.conversation [data-reading-segment]').dataset.readingSegment)>250",
  );
  await evaluate(
    "window.__page=document.querySelector('.conversation [data-reading-segment]').dataset.readingSegment;window.readingProbe.append()",
  );
  await frames();
  await check(
    "R14 append does not change chosen segment",
    "document.querySelector('.conversation [data-reading-segment]').dataset.readingSegment===window.__page",
  );
  await click("Previous segment");
  await evaluate(
    "(()=>{const p=document.querySelector('.conversation [data-reading-text]');window.__raw=p;window.__rawNode=p.firstChild;p.scrollTop=25;window.__rawTop=p.scrollTop;const r=document.createRange();r.setStart(p.firstChild,0);r.setEnd(p.firstChild,12);getSelection().removeAllRanges();getSelection().addRange(r);window.__rawSelection=getSelection().toString()})()",
  );
  await evaluate("window.readingProbe.append()");
  await frames();
  await check(
    "R6 closed raw node range and inner scroll survive append",
    "document.querySelector('.conversation [data-reading-text]')===window.__raw && window.__raw.firstChild===window.__rawNode && getSelection().toString()===window.__rawSelection && window.__raw.scrollTop===window.__rawTop",
  );
  await evaluate(
    "(()=>{const p=" +
      pane +
      ",r=" +
      row(10) +
      ";p.scrollTop=r.getBoundingClientRect().top-p.getBoundingClientRect().top-p.clientTop+p.scrollTop+40})()",
  );
  await frames();
  await evaluate(
    "window.__offset=" +
      offset(10) +
      ";window.__rawPage=document.querySelector('.conversation [data-reading-segment]').dataset.readingSegment;window.readingProbe.gap()",
  );
  await frames();
  await click("View native history");
  await wait(() => evaluate("!!document.querySelector('[role=dialog]')"));
  await check(
    "R8 gap opens existing tools and identifies history",
    "[...document.querySelectorAll('[role=dialog]')].some(d=>d.getClientRects().length && d.textContent.includes('Native history'))",
  );
  await click("Native history");
  await wait(() => evaluate("!!document.querySelector('.history article')"));
  await wait(() =>
    evaluate(
      "![...document.querySelectorAll('[role=dialog]')].some(d=>d.getClientRects().length)",
    ),
  );
  await frames();
  await check(
    "R13 history navigation returns keyboard focus to visible Thread tools",
    "document.activeElement?.matches('[data-thread-tools-trigger]') && document.activeElement.getClientRects().length>0",
  );
  await check(
    "R8 native partial saved-order scope",
    "document.querySelector('.history').textContent.includes('read-only and paged in saved order') && document.querySelector('.history').textContent.includes('incomplete')",
  );
  await click("Next page");
  await wait(() =>
    evaluate(
      "document.querySelector('.history article')?.textContent.includes('page 200')",
    ),
  );
  await evaluate("window.readingProbe.historyReason('changed')");
  await click("Refresh");
  await wait(() =>
    evaluate(
      "document.querySelector('.history').textContent.includes('records changed')",
    ),
  );
  await check(
    "R10 changed is not empty and refresh scope remains clear",
    "!document.querySelector('.history').textContent.includes('No complete text messages') && document.querySelector('.history').textContent.includes('first page')",
  );
  await evaluate("window.readingProbe.historyReason(null)");
  await click("Refresh");
  await wait(() =>
    evaluate(
      "document.querySelector('.history article')?.textContent.includes('page 0')",
    ),
  );
  await click("Return to live reading");
  await check(
    "R13 returning live keeps a visible keyboard focus",
    "document.activeElement?.matches('[data-thread-tools-trigger]') && document.activeElement.getClientRects().length>0",
  );
  await check(
    "R8R15 same live source anchor and body choice return",
    "document.querySelector('.conversation').dataset.readingSource===window.__source && Math.abs((" +
      offset(10) +
      ")-window.__offset)<=2 && document.querySelector('.conversation [data-reading-segment]').dataset.readingSegment===window.__rawPage && document.querySelector('.tiptap')===window.__editor",
  );
  await evaluate(
    "window.__offset=" +
      offset(10) +
      ";window.__rawPage=document.querySelector('.conversation [data-reading-segment]').dataset.readingSegment",
  );
  await evaluate("window.probe.model.selectThread(window.probe.secondId)");
  await frames();
  await check(
    "R5 Thread B owns a separate source and hint",
    "document.querySelector('.conversation').dataset.readingSource!==window.__source && !document.querySelector('[data-live-reading-controls]')?.textContent.includes('New output')",
  );
  await evaluate("window.probe.model.selectThread(window.probe.firstId)");
  await frames();
  await check(
    "R5 Thread A returns to its source row and raw page",
    "document.querySelector('.conversation').dataset.readingSource===window.__source && Math.abs((" +
      offset(10) +
      ")-window.__offset)<=2 && document.querySelector('.conversation [data-reading-segment]').dataset.readingSegment===window.__rawPage",
  );
  await evaluate("void(window.__editor=document.querySelector('.tiptap'))");
  await evaluate(
    "(()=>{const p=" +
      pane +
      ";p.scrollTop=0;const first=p.querySelector('[data-reading-row=\"1\"]');const strong=first.querySelector('[data-streamdown=\"strong\"]');if(!strong)throw Error('Synthetic Markdown not present: '+first.outerHTML.slice(0,2500));window.__md=strong.firstChild;const code=first.querySelector('pre');window.__code=code;code.scrollLeft=40;window.__codeLeft=code.scrollLeft;const r=document.createRange();r.setStart(strong.firstChild,0);r.setEnd(strong.firstChild,8);getSelection().removeAllRanges();getSelection().addRange(r);window.__mdSelection=getSelection().toString()})()",
  );
  await evaluate("window.readingProbe.complete()");
  await frames();
  await check(
    "R7 final Markdown preserves stable node range and code scroll",
    "window.__md.isConnected && getSelection().toString()===window.__mdSelection && window.__code.isConnected && window.__codeLeft>0 && window.__code.scrollLeft===window.__codeLeft && document.querySelector('[data-reading-row=\"1\"]').textContent.includes('FINAL_MARKDOWN_TAIL')",
  );
  clipboard = captureClipboard({
    env: isolated.env,
    temporary: isolated.temporary,
  });
  clipboard.beforeCopy();
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "c",
    code: "KeyC",
    modifiers: 4,
    commands: ["copy"],
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "c",
    code: "KeyC",
    modifiers: 4,
  });
  clipboard.markOwnedCopy(await evaluate("window.__mdSelection"));
  results.push({
    name: "R7R12 final stable Selection copies to native pasteboard",
    result: true,
  });
  const expectedCopy = await evaluate("window.readingProbe.text(25)");
  const point = await evaluate(
    "(()=>{const b=document.querySelector('[data-reading-row=\"25\"] .message-heading button');b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
  );
  clipboard.beforeCopy();
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    ...point,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    ...point,
  });
  await frames();
  clipboard.markOwnedCopy(expectedCopy);
  results.push({
    name: "R12 whole long body Copy includes undisplayed segments",
    result: { copiedCharacters: expectedCopy.length, owned: true },
  });
  results.push({
    name: "native clipboard restoration",
    result: clipboard.restore().kind,
  });
  await click("Thread tools");
  await click("Native history");
  await click("Return to live reading");
  await check(
    "R13 editor identity remains through tools and history",
    "document.querySelector('.tiptap')===window.__editor",
  );
  await evaluate("window.readingProbe.generation()");
  await frames();
  await check(
    "R5 new generation resets source position and hint",
    "document.querySelector('.conversation').dataset.readingSource!==window.__source && " +
      pane +
      ".scrollTop<=2 && !document.querySelector('[data-live-reading-controls]')?.textContent.includes('New output')",
  );
  await evaluate("window.probe.model.preference('theme','dark')");
  await frames();
  await shot("dark-final-markdown");
  await evaluate("window.readingProbe.manyRows()");
  await wait(() =>
    evaluate(
      "document.querySelectorAll('.conversation article').length===1000",
    ),
  );
  const performance = await evaluate(
    "(async()=>{const samples=[];const e=document.querySelector('.tiptap');e.focus();for(let i=0;i<20;i++){const start=performance.now();document.execCommand('insertText',false,'x');await new Promise(done=>requestAnimationFrame(done));samples.push(performance.now()-start)}samples.sort((a,b)=>a-b);return {retainedItems:1000,mountedItems:document.querySelectorAll('.conversation article').length,nodes:document.querySelectorAll('*').length,inputFrameP95:samples[18],samples}})()",
  );
  results.push({
    name: "1000 retained short rows input frame sample",
    result: performance,
  });
  assert.ok(performance.inputFrameP95 <= 50, JSON.stringify(performance));
  await evaluate("window.readingProbe.unmount()");
  await frames();
  await check(
    "R11 fixture root unmount completes",
    "!document.querySelector('.reading-pane')",
  );
  passed = true;
} finally {
  clipboard?.restore();
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(
      {
        commit,
        dirty,
        passed,
        platform: process.platform,
        mode: "real Electron, production components/models, isolated synthetic bridge; no provider or Main history I/O",
        results,
      },
      null,
      2,
    ) + "\n",
  );
  socket?.close();
  child.kill();
  if (child.exitCode === null)
    await new Promise((done) => child.once("exit", done));
  await vite.close();
  isolated.cleanup();
}
console.log(JSON.stringify({ passed, checks: results.length }));
