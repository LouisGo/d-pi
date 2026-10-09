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

const isolated = createTestEnvironment({
  prefix: "d-pi-conversation-display-",
});
const anchorPreview = process.argv.includes("--anchor-preview");
const output = resolve(
  ".scratch/m2-first-release/evidence/" +
    (anchorPreview ? "conversation-anchor-preview" : "conversation-feedback"),
);
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
  optimizeDeps: {
    entries: [resolve("validation/m2/conversation-display.html")],
  },
  plugins: [react(), tailwindcss()],
  define: {
    __D_PI_BUILD__: JSON.stringify({
      version: "reading-fixture",
      commit,
      dirty,
      id: "conversation-display",
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
  "/validation/m2/conversation-display.html?thread-layout" +
  (anchorPreview ? "&anchor-preview" : "");
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
const capture = !process.argv.includes("--no-capture");
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
  await call("Page.bringToFront");
  await call("Emulation.setFocusEmulationEnabled", { enabled: true });
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
      "new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))",
    );
  async function shot(name) {
    if (!capture) return;
    const result = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(
      join(output, name + ".png"),
      Buffer.from(result.data, "base64"),
    );
  }
  const pane = "document.querySelector('[data-reading-pane=conversation]')";
  await wait(() =>
    evaluate(
      "document.querySelectorAll('[data-conversation-turn]').length===3 && !!document.querySelector('.tiptap')",
    ),
  );
  await evaluate("window.displayProbe.locale()");
  await wait(() =>
    evaluate(
      "!!document.querySelector('[data-streamdown=code-block-body] span[style]')",
    ),
  );
  if (anchorPreview) {
    for (const theme of ["light", "dark"]) {
      await evaluate(
        "window.probe.model.preference('theme'," + JSON.stringify(theme) + ")",
      );
      for (const width of [1440, 720]) {
        await call("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await frames();
        await evaluate(pane + ".scrollTop=0");
        await call("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: width - 20,
          y: 30,
        });
        const turn = await evaluate(
          "(()=>{const r=document.querySelectorAll('[data-turn-target]')[1].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
        );
        await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...turn });
        await wait(() =>
          evaluate(
            "!!document.querySelector('[data-slot=hover-card]') && getComputedStyle(document.querySelector('[data-slot=hover-card]')).opacity==='1'",
          ),
        );
        await evaluate("new Promise(done=>setTimeout(done,200))");
        const card = await evaluate(
          `(()=>{const popup=document.querySelector('[data-slot=hover-card]'),body=popup.querySelector('.turn-preview-question'),r=popup.getBoundingClientRect(),b=body.getBoundingClientRect(),question=document.querySelectorAll('.user-message-bubble')[1].textContent;return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,x:b.x+b.width/2,y:b.y+b.height/2,fullQuestion:body.textContent===question,length:body.textContent.length,wrap:getComputedStyle(body).whiteSpace,scrollable:body.scrollHeight>body.clientHeight,overflow:popup.scrollWidth>popup.clientWidth,paneScroll:${pane}.scrollTop}})()`,
        );
        assert.ok(
          card.fullQuestion &&
            card.length > 240 &&
            card.wrap === "pre-wrap" &&
            card.scrollable,
          JSON.stringify(card),
        );
        assert.ok(
          card.left >= 0 &&
            card.right <= width &&
            card.top >= 0 &&
            card.bottom <= 900 &&
            !card.overflow,
          JSON.stringify(card),
        );
        await shot(theme + "-" + width + "-question");
        await call("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: (turn.x + card.x) / 2,
          y: (turn.y + card.y) / 2,
        });
        await call("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: card.x,
          y: card.y,
        });
        await call("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: card.x,
          y: card.y,
          deltaX: 0,
          deltaY: 180,
        });
        await evaluate("new Promise(done=>setTimeout(done,350))");
        const retained = await evaluate(
          `(()=>{const p=document.querySelector('.turn-preview-question');return {open:!!p,scroll:p?.scrollTop,paneScroll:${pane}.scrollTop}})()`,
        );
        assert.ok(
          retained.open &&
            retained.scroll > 0 &&
            retained.paneScroll === card.paneScroll,
          JSON.stringify(retained),
        );
        await call("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: width - 20,
          y: 30,
        });
        await wait(() =>
          evaluate("!document.querySelector('[data-slot=hover-card]')"),
        );
        await evaluate(
          "document.querySelectorAll('[data-turn-target]')[1].focus()",
        );
        await wait(() =>
          evaluate("!!document.querySelector('[data-slot=hover-card]')"),
        );
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
          evaluate("!document.querySelector('[data-slot=hover-card]')"),
        );
        assert.ok(
          await evaluate(
            "document.activeElement===document.querySelectorAll('[data-turn-target]')[1]",
          ),
        );
        await evaluate("document.activeElement.blur()");
        results.push({
          name:
            theme +
            " " +
            width +
            " complete question, pointer bridge, scroll and keyboard",
          card,
          retained,
        });
      }
    }
  } else {
    for (const theme of ["light", "dark"]) {
      await evaluate(
        "window.probe.model.preference('theme'," + JSON.stringify(theme) + ")",
      );
      for (const width of [1440, 720]) {
        await call("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await frames();
        await evaluate(
          pane + ".scrollTop=0;" + pane + ".dispatchEvent(new Event('scroll'))",
        );
        await frames();
        await wait(() =>
          evaluate(
            "document.querySelectorAll('[data-message-media] img').length===2 && [...document.querySelectorAll('[data-message-media] img')].every(image=>image.naturalWidth>0)",
          ),
        );
        const geometry = await evaluate(
          `(()=>{const pane=${pane},timeline=document.querySelector('.conversation'),composer=document.querySelector('.composer:not([hidden])');const r=e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width}};return {timeline:r(timeline),composer:r(composer),pane:r(pane),pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,bubbles:[...document.querySelectorAll('.user-message-bubble')].map(r),visibleOMP:document.body.innerText.includes('OMP')}})()`,
        );
        assert.ok(
          Math.abs(geometry.timeline.left - geometry.composer.left) <= 1 &&
            Math.abs(geometry.timeline.right - geometry.composer.right) <= 1,
          JSON.stringify(geometry),
        );
        assert.equal(geometry.pageOverflow, false);
        assert.equal(geometry.visibleOMP, false);
        const media = await evaluate(
          "(()=>{const row=document.querySelector('[data-conversation-turn]'),media=row.querySelector('[data-message-media]'),bubble=row.querySelector('.user-message-bubble'),time=row.querySelector('time');return {above:media.getBoundingClientRect().bottom<=bubble.getBoundingClientRect().top,clean:!bubble.textContent.includes('[/attachment]'),time:time?.dateTime,timeVisible:getComputedStyle(time.parentElement).opacity,noQueue:!document.querySelector('.thread-reading .runtime-panel'),stop:!!document.querySelector('[aria-label=\"停止回复\"]'),thumbnails:[...media.querySelectorAll('img')].map(image=>({natural:image.naturalWidth,overflow:image.getBoundingClientRect().right>media.getBoundingClientRect().right+1}))}})()",
        );
        assert.ok(
          media.above && media.clean && media.noQueue && media.stop,
          JSON.stringify(media),
        );
        assert.equal(media.time, "2026-10-09T09:00:00.000Z");
        assert.equal(media.timeVisible, "0");
        assert.ok(
          media.thumbnails.every(
            (image) => image.natural > 0 && !image.overflow,
          ),
        );
        const codeStyle = await evaluate(
          "(()=>{const css=part=>{const s=getComputedStyle(document.querySelector('[data-streamdown=code-block'+part+']'));return {border:s.borderTopWidth,padding:s.padding,background:s.backgroundColor}};return {frame:css(''),body:css('-body'),actions:css('-actions')}})()",
        );
        assert.equal(codeStyle.frame.padding, "0px");
        assert.equal(codeStyle.body.border, "0px");
        assert.equal(codeStyle.actions.border, "0px");
        assert.equal(codeStyle.actions.padding, "0px");
        for (const b of geometry.bubbles)
          assert.ok(
            b.right <= geometry.timeline.right + 1 &&
              b.left >= geometry.timeline.left - 1,
          );
        results.push({
          name: theme + " " + width + " alignment and overflow",
          geometry,
          codeStyle,
          media,
        });
        await shot(theme + "-" + width);
      }
    }
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate("window.probe.model.preference('theme','light')");
    await call("Page.bringToFront");
    await frames();
    await evaluate(pane + ".scrollTop=0");
    await frames();
    const userAction = await evaluate(
      `(()=>{const row=document.querySelector('[data-conversation-turn]'),bubble=row.querySelector('.user-message-bubble'),bar=row.querySelector('.message-action-bar'),r=bubble.getBoundingClientRect();return {opacity:getComputedStyle(bar).opacity,height:row.getBoundingClientRect().height,x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    assert.equal(Number(userAction.opacity), 0);
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 1200,
      y: 50,
    });
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: userAction.x,
      y: userAction.y,
    });
    await frames();
    await evaluate("new Promise(done=>setTimeout(done,200))");
    const hovered = await evaluate(
      `(()=>{const row=document.querySelector('[data-conversation-turn]');return {opacity:getComputedStyle(row.querySelector('.message-action-bar')).opacity,height:row.getBoundingClientRect().height,hover:row.matches(':hover'),hit:document.elementFromPoint(${userAction.x},${userAction.y})?.outerHTML}})()`,
    );
    assert.equal(
      Number(hovered.opacity),
      1,
      JSON.stringify({ userAction, hovered }),
    );
    assert.equal(hovered.height, userAction.height);
    await evaluate(
      "document.querySelector('[data-conversation-turn] .message-action-bar button').focus()",
    );
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 1200,
      y: 50,
    });
    await evaluate("new Promise(done=>setTimeout(done,200))");
    const focused = await evaluate(
      "getComputedStyle(document.querySelector('[data-conversation-turn] .message-action-bar')).opacity",
    );
    assert.equal(Number(focused), 1);
    results.push({
      name: "hover and keyboard actions without layout shift",
      hidden: userAction.opacity,
      hovered: hovered.opacity,
      focused,
      stableHeight: hovered.height,
    });
    await evaluate(
      "document.activeElement.blur();document.querySelector('.message-thinking summary').click()",
    );
    await wait(() => evaluate("!!document.querySelector('.thinking-content')"));
    assert.ok(
      await evaluate(
        "document.querySelector('.message-thinking details').open && document.querySelector('.thinking-content').textContent.includes('先明确内容层级')",
      ),
    );
    await evaluate(
      "document.querySelector('.message-thinking summary').click()",
    );
    results.push({ name: "native thinking disclosure", passed: true });
    await evaluate(
      "document.querySelectorAll('[data-turn-target]')[1].click()",
    );
    await frames();
    const jump = await evaluate(
      `(()=>{const p=${pane},u=document.querySelectorAll('[data-conversation-turn]')[1];return {top:u.getBoundingClientRect().top-p.getBoundingClientRect().top,scroll:p.scrollTop,active:document.querySelector('[aria-current=step]')?.dataset.turnTarget}})()`,
    );
    assert.ok(Math.abs(jump.top) <= 1, JSON.stringify(jump));
    await evaluate(
      "window.__displayScroll=" +
        pane +
        ".scrollTop;window.displayProbe.append()",
    );
    await frames();
    await evaluate("new Promise(done=>setTimeout(done,200))");
    const retained = await evaluate(
      `(()=>{const p=${pane},u=document.querySelectorAll('[data-conversation-turn]')[1];return {before:window.__displayScroll,after:p.scrollTop,top:u.getBoundingClientRect().top-p.getBoundingClientRect().top}})()`,
    );
    assert.ok(Math.abs(retained.top) <= 1, JSON.stringify(retained));
    results.push({
      name: "turn positioning and stream takeover",
      jump,
      retained,
    });
    const turn = await evaluate(
      "(()=>{const r=document.querySelectorAll('[data-turn-target]')[1].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
    );
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: turn.x,
      y: turn.y,
    });
    await frames();
    await wait(() => evaluate("!!document.querySelector('.turn-preview')"));
    await evaluate("new Promise(done=>setTimeout(done,200))");
    const hover = await evaluate(
      "(()=>{const p=document.querySelector('.turn-preview'),r=p.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:p.scrollWidth>p.clientWidth,question:!!p.querySelector('.turn-preview-question')}})()",
    );
    assert.ok(
      hover.left >= 0 &&
        hover.right <= 1440 &&
        hover.top >= 0 &&
        hover.bottom <= 900 &&
        !hover.overflow &&
        hover.question,
      JSON.stringify(hover),
    );
    results.push({ name: "turn question preview bounds", hover });
    await shot("turn-preview");
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 1200,
      y: 50,
    });
    await evaluate("document.querySelector('[data-list-bottom]').click()");
    await frames();
    assert.ok(
      await evaluate(
        pane +
          ".scrollHeight-" +
          pane +
          ".scrollTop-" +
          pane +
          ".clientHeight<=2",
      ),
    );
    results.push({ name: "back to bottom", passed: true });
    await shot("last-turn");
    await evaluate(pane + ".scrollTop=0");
    await frames();
    await wait(() =>
      evaluate(
        "document.querySelectorAll('[data-message-media] img').length===2",
      ),
    );
    await evaluate("document.querySelector('.message-file button').click()");
    await wait(() =>
      evaluate(
        "!!document.querySelector('[role=dialog] .message-file-preview')",
      ),
    );
    assert.ok(
      await evaluate(
        "document.querySelector('.message-file-preview').textContent.includes('发送时冻结的文件副本')",
      ),
    );
    await evaluate("new Promise(done=>setTimeout(done,200))");
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('[role=dialog]')).opacity",
      ),
      "1",
    );
    await shot("file-preview");
    await evaluate(
      "document.querySelector('[aria-label=\"关闭预览\"]').click()",
    );
    await frames();
    await evaluate(
      "document.querySelector('.message-image-tile button').click()",
    );
    await wait(() =>
      evaluate(
        "!!document.querySelector('[role=dialog] .message-image-preview')",
      ),
    );
    assert.ok(
      await evaluate(
        "document.querySelector('.message-image-preview').naturalWidth>0",
      ),
    );
    await evaluate("new Promise(done=>setTimeout(done,200))");
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('[role=dialog]')).opacity",
      ),
      "1",
    );
    await shot("image-preview");
    await evaluate(
      "document.querySelector('[aria-label=\"关闭预览\"]').click()",
    );
    await frames();
    results.push({
      name: "frozen file and saved image previews",
      passed: true,
    });
    await evaluate(
      "document.querySelector('[aria-label=\"停止回复\"]').click()",
    );
    await wait(() =>
      evaluate(
        "window.probe.runtimeCommands.some(command=>command.kind==='stop')",
      ),
    );
    assert.ok(
      await evaluate(
        "!document.querySelector('.thread-reading .runtime-panel')",
      ),
    );
    results.push({ name: "composer stop uses existing control", passed: true });
  }
  passed = true;
} finally {
  writeFileSync(
    join(output, capture ? "result.json" : "result-final.json"),
    JSON.stringify(
      {
        commit,
        dirty,
        passed,
        captured: capture,
        platform: process.platform,
        mode: "isolated Electron Renderer; production views and synthetic bridge; no provider requests",
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
