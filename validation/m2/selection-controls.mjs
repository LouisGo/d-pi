import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, relative, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-selection-" });
const output = resolve(
  process.argv[2] ?? ".scratch/selection-components/evidence/native.json",
);
const vite = await createViteServer({
  configFile: false,
  root: resolve("."),
  cacheDir: join(isolated.root, "vite-cache"),
  optimizeDeps: { entries: [resolve("validation/m2/selection-controls.html")] },
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
const url = `http://127.0.0.1:${vite.httpServer.address().port}/validation/m2/selection-controls.html`;
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
  await wait(() => evaluate("!!document.querySelector('#top')"));
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
  const shot = async (name) => {
    await evaluate(
      "Promise.all(document.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{}))).then(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))))",
    );
    const result = await call("Page.captureScreenshot", { format: "png" });
    const file = join(outputDirectory, `${name}.png`);
    writeFileSync(file, Buffer.from(result.data, "base64"));
    screenshots.push(relative(process.cwd(), file));
  };

  const key = async (key, code, keyCode) => {
    for (const type of ["keyDown", "keyUp"])
      await call("Input.dispatchKeyEvent", {
        type,
        key,
        code,
        windowsVirtualKeyCode: keyCode,
      });
  };
  const geometry = [];
  const detailFailures = [];
  for (const theme of ["light", "dark"]) {
    await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    for (const id of ["top", "bottom", "search"]) {
      await click(`document.getElementById('${id}')`);
      await wait(() =>
        evaluate(
          "!!document.querySelector('.ui-select-positioner:not([hidden])[data-side]') && document.querySelector('.ui-select-positioner:not([hidden]) .ui-select-popup').getBoundingClientRect().height>50",
        ),
      );
      const g = await evaluate(
        `(()=>{const a=document.getElementById('${id}').getBoundingClientRect(),p=document.querySelector('.ui-select-positioner:not([hidden]) .ui-select-popup').getBoundingClientRect();return {id:'${id}',theme:'${theme}',anchor:a.toJSON(),popup:p.toJSON(),side:document.querySelector('.ui-select-positioner:not([hidden])').dataset.side,width:innerWidth,height:innerHeight};})()`,
      );
      assert.equal(g.side, id === "bottom" ? "top" : "bottom");
      assert.ok(
        id === "bottom"
          ? g.popup.bottom <= g.anchor.top
          : g.popup.top >= g.anchor.bottom,
      );
      assert.ok(
        g.popup.left >= 0 &&
          g.popup.right <= g.width &&
          g.popup.bottom <= g.height,
      );
      const columns = await evaluate(`(()=>{
        const popup=document.querySelector('.ui-select-positioner:not([hidden]) .ui-select-popup');
        return Array.from(popup.querySelectorAll('[role=option]')).map(row=>{
          const text=row.querySelector('.ui-select-option-text');
          const indicator=row.querySelector('.ui-select-indicator');
          const r=row.getBoundingClientRect(),t=text?.getBoundingClientRect(),i=indicator?.getBoundingClientRect();
          return {label:row.textContent,text:t?.toJSON(),indicator:i?.toJSON(),row:r.toJSON()};
        });
      })()`);
      geometry.push({ ...g, columns });
      if (
        !columns.every(
          (row) =>
            row.text &&
            row.indicator &&
            row.text.right + 10 <= row.indicator.left,
        )
      )
        detailFailures.push(
          `${theme}/${id}: every label needs an independent check column with a readable gap`,
        );
      if (g.popup.width < 200)
        detailFailures.push(
          `${theme}/${id}: short trigger produces a cramped option popup (${g.popup.width}px)`,
        );
      await shot(`${theme}-${id}`);
      if (id === "search") {
        assert.equal(
          await evaluate("document.activeElement.getAttribute('aria-label')"),
          "Search models",
        );
        assert.equal(
          await evaluate(
            "getComputedStyle(document.activeElement).outlineStyle",
          ),
          "none",
          "pointer autofocus must not show an outline",
        );
        await call("Input.insertText", { text: "Fast" });
        await wait(() =>
          evaluate(
            "document.querySelectorAll('.ui-select-positioner:not([hidden]) [role=option]').length===1 && document.querySelector('.ui-select-positioner:not([hidden]) [role=option]').textContent==='Fast'",
          ),
        );
        await key("ArrowDown", "ArrowDown", 40);
        await key("Enter", "Enter", 13);
        await wait(() =>
          evaluate(
            "!document.querySelector('.ui-select-positioner:not([hidden]) .ui-select-popup') && document.querySelector('#search').textContent==='Fast'",
          ),
        );
        assert.equal(await evaluate("document.activeElement.id"), "search");
        await click("document.getElementById('search')");
        await wait(() =>
          evaluate(
            "document.activeElement.getAttribute('aria-label')==='Search models'",
          ),
        );
        await call("Input.insertText", { text: "zzzz" });
        await wait(() =>
          evaluate(
            "document.querySelector('.ui-select-empty')?.textContent==='No matches' && document.querySelectorAll('.ui-select-positioner:not([hidden]) [role=option]').length===0",
          ),
        );
        await shot(`${theme}-search-empty`);
      }
      await key("Escape", "Escape", 27);
      if (
        await evaluate(
          "!!document.querySelector('.ui-select-positioner:not([hidden]) .ui-select-popup')",
        )
      )
        await key("Escape", "Escape", 27);
      await wait(() =>
        evaluate(
          "!document.querySelector('.ui-select-positioner:not([hidden]) .ui-select-popup')",
        ),
      );
      assert.equal(await evaluate("document.activeElement.id"), id);
    }
  }
  await call("Emulation.setDeviceMetricsOverride", {
    width: 400,
    height: 540,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click("document.getElementById('search')");
  await wait(() =>
    evaluate(
      "!!document.querySelector('.ui-select-positioner:not([hidden]) .ui-select-popup')",
    ),
  );
  assert.ok(
    await evaluate(
      "(()=>{const r=document.querySelector('.ui-select-positioner:not([hidden]) .ui-select-popup').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth;})()",
    ),
  );
  await shot("dark-narrow-search");
  await key("Escape", "Escape", 27);
  await wait(() =>
    evaluate(
      "!document.querySelector('.ui-select-positioner:not([hidden]) .ui-select-popup') && document.activeElement.id==='search'",
    ),
  );
  await key("Tab", "Tab", 9);
  await evaluate("document.getElementById('search').focus();true");
  await key("ArrowDown", "ArrowDown", 40);
  await wait(() =>
    evaluate("document.activeElement.matches('.ui-select-search')"),
  );
  assert.ok(
    await evaluate(
      "document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle!=='none' && parseFloat(getComputedStyle(document.activeElement).outlineWidth)>0",
    ),
    "keyboard-opened search preserves visible focus",
  );
  await shot("keyboard-search-focus");
  await key("Escape", "Escape", 27);

  await click("document.querySelector('[role=radio][aria-label=Default]')");
  await key("ArrowRight", "ArrowRight", 39);
  await wait(() =>
    evaluate(
      "document.querySelector('[role=radio][aria-label=Fast]').getAttribute('aria-checked')==='true'",
    ),
  );
  assert.ok(await evaluate("document.activeElement.matches(':focus-visible')"));
  const overflow = await evaluate(`(()=>{
    const section=document.querySelector('[data-detail-fixture]');
    return Array.from(section.querySelectorAll('*')).filter(el=>{
      if(el.getAttribute('aria-hidden')==='true') return false;
      const r=el.getBoundingClientRect(),s=section.getBoundingClientRect();
      const unclipped=getComputedStyle(el).overflowX==='visible';
      return r.width>0 && (r.right>s.right+1 || r.left<s.left-1 || (unclipped && el.scrollWidth>el.clientWidth+1));
    }).map(el=>({tag:el.tagName,class:el.className,width:el.clientWidth,scroll:el.scrollWidth}));
  })()`);
  if (overflow.length)
    detailFailures.push(
      `narrow shared compositions overflow: ${JSON.stringify(overflow)}`,
    );
  assert.deepEqual(detailFailures, [], "shared control geometry regressions");
  await evaluate(
    "document.querySelector('[data-detail-fixture]').scrollIntoView({block:'end'})",
  );
  await shot("dark-narrow-details");
  for (const [trigger, popup] of [
    ["#long-option", ".ui-select-popup"],
    ['[aria-label="Actions"]', ".ui-action-menu"],
    ['[aria-label="More actions"]', ".ui-hover-menu"],
  ]) {
    const visiblePopup = `${popup}:not([data-closed])`;
    await click(`document.querySelector('${trigger}')`);
    await wait(() => evaluate(`!!document.querySelector('${visiblePopup}')`));
    await evaluate(
      "Promise.all(document.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{})))",
    );
    const bounds = await evaluate(`(()=>{
      const el=document.querySelector('${visiblePopup}'),r=el.getBoundingClientRect();
      return {popup:'${popup}',rect:r.toJSON(),viewport:innerWidth,overflow:el.scrollWidth>el.clientWidth+1};
    })()`);
    assert.ok(
      bounds.rect.left >= 0 && bounds.rect.right <= bounds.viewport + 1,
      JSON.stringify(bounds),
    );
    assert.equal(bounds.overflow, false, JSON.stringify(bounds));
    geometry.push(bounds);
    await shot(`dark-narrow-${popup.slice(1)}`);
    await key("Escape", "Escape", 27);
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    await wait(() => evaluate(`!document.querySelector('${visiblePopup}')`));
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        kind: "isolated-Electron-real-controls",
        geometry,
        screenshots,
        checks: [
          "bottom placement",
          "edge flip",
          "no trigger overlap",
          "search filtering",
          "keyboard selection",
          "empty state",
          "escape focus",
          "pointer autofocus without outline",
          "keyboard search focus retained",
          "radio arrow keys",
          "light/dark",
          "narrow bounds",
          "stable label/check columns",
          "independent popup width",
          "narrow multi-control setting rows",
          "unbroken disclosure/empty-state/action text",
          "long Select and menu viewport bounds",
        ],
        limitations: ["isolated controls; no real provider requests"],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `PASS: selection controls Electron; ${screenshots.length} captures; ${output}`,
  );
} finally {
  socket?.close();
  child.kill();
  await once(child, "exit").catch(() => {});
  await vite.close();
  isolated.cleanup();
}
