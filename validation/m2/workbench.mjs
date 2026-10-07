import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";
import { parseValidationScenario } from "./scenario.mjs";

const { scenario, path: outputPath } = parseValidationScenario(
  process.argv.slice(2),
  {
    all: [],
    focus: [],
  },
);
const isolated = createTestEnvironment({ prefix: "d-pi-workbench-" });
const output = resolve(
  outputPath ?? ".scratch/codex-workbench-ui/evidence/native.json",
);
const vite = await createViteServer({
  configFile: false,
  root: resolve("."),
  cacheDir: join(isolated.root, "vite-cache"),
  optimizeDeps: { entries: [resolve("validation/m2/workbench.html")] },
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
const url = `http://127.0.0.1:${vite.httpServer.address().port}/validation/m2/workbench.html`;
const ports = createServer();
await new Promise((done) => ports.listen(0, "127.0.0.1", done));
const port = ports.address().port;
await new Promise((done) => ports.close(done));
const main = join(isolated.root, "main.cjs");
writeFileSync(
  main,
  `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(isolated.data)});app.whenReady().then(()=>{const w=new BrowserWindow({width:1440,height:900,minWidth:720,minHeight:540,titleBarStyle:"hiddenInset",webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.loadURL(${JSON.stringify(url)});require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const s=JSON.parse(line);if(s.focus)w.focus();else w.setSize(s.width,s.height);});});app.on('window-all-closed',()=>app.quit());`,
);
const child = spawn(
  realpathSync(
    "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
  ),
  [main, `--remote-debugging-port=${port}`],
  { env: isolated.env, stdio: ["pipe", "pipe", "pipe"] },
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
let passed = false;
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
      "!!document.querySelector('.tiptap') && document.querySelectorAll('.thread-buttons button').length===3",
    ),
  );
  await call("Page.enable");
  if (scenario === "focus") {
    await runFocusChecks();
  } else {
    await evaluate(
      "window.inputFrames=[];document.addEventListener('pointermove',e=>{if(e.buttons!==1)return;const start=performance.now();requestAnimationFrame(()=>window.inputFrames.push(performance.now()-start));})",
    );
    await runChecks();
    results.push({
      name: "scripted-input-to-next-frame-ms",
      value: await evaluate(
        "(()=>{const s=window.inputFrames.sort((a,b)=>a-b);return {count:s.length,median:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],maximum:s.at(-1)};})()",
      ),
      limitation:
        "CDP gesture input to rAF, not sustained frame-rate or system-input latency",
    });
  }
  passed = true;
  console.log(`PASS: ${results.length} Electron workbench checks. ${output}`);
} finally {
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(
    output,
    JSON.stringify(
      {
        version: "isolated-workbench",
        scenario,
        passed,
        checks: results,
        stderr,
        limitations:
          scenario === "focus"
            ? [
                "pointer/keyboard focus only; geometry, continuity and performance not run",
              ]
            : ["isolated GUI fixture; not packaged or system IME evidence"],
      },
      null,
      2,
    ),
  );
  socket?.close();
  const closed = new Promise((done) => child.once("close", done));
  child.kill();
  await closed;
  await vite.close();
  isolated.cleanup();
}
async function resize(width, height) {
  child.stdin.write(JSON.stringify({ width, height }) + "\n");
  await wait(() => evaluate(`innerWidth===${width}`));
  await evaluate("window.probe.pause()");
}
async function click(label) {
  await evaluate(
    `(()=>{const scope=document.querySelector('.ui-settings-modal:not([hidden])')??document;const button=[...scope.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}&&!b.disabled&&!b.closest('[hidden],[inert]')&&b.getBoundingClientRect().width>0);if(!button)throw Error('Missing visible action: '+${JSON.stringify(label)});button.click();})()`,
  );
  await evaluate("window.probe.pause()");
}
async function key(key, code, modifiers = 0) {
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: key === "Tab" ? 9 : undefined,
  });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers });
}
async function rect(selector) {
  return evaluate(
    `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`,
  );
}
async function drag(id, delta, axis = "x", cancel = false, reverse = false) {
  child.stdin.write(JSON.stringify({ focus: true }) + "\n");
  await call("Page.bringToFront");
  await evaluate("window.probe.pause()");
  const r = await rect(`#${id}`),
    x = r.x + r.width / 2,
    y = r.y + r.height / 2;
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
    buttons: 1,
  });
  for (let i = 1; i <= 5; i++)
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: x + (axis === "x" ? (delta * i) / 5 : 0),
      y: y + (axis === "y" ? (delta * i) / 5 : 0),
      button: "left",
      buttons: 1,
    });
  if (reverse)
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "left",
      buttons: 1,
    });
  if (cancel)
    await evaluate(
      `document.querySelector('#${id}').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1,isPrimary:true}))`,
    );
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: reverse ? x : x + (axis === "x" ? delta : 0),
    y: reverse ? y : y + (axis === "y" ? delta : 0),
    button: "left",
    clickCount: 1,
    buttons: 0,
  });
  await evaluate("window.probe.pause()");
}
async function check(name, expression, predicate = (value) => value === true) {
  const value = await evaluate(expression);
  assert.ok(predicate(value), `${name}: ${JSON.stringify(value)}`);
  results.push({ name, value });
}
async function capture(name) {
  await new Promise((done) => setTimeout(done, 300));
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 20, y: 400 });
  mkdirSync(resolve(output, ".."), { recursive: true });
  const screenshot = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    resolve(output, "..", `${name}.png`),
    Buffer.from(screenshot.data, "base64"),
  );
}
async function checkIconGeometry(name) {
  await check(
    name,
    "([...document.querySelectorAll('.ui-button-icon')].filter(b=>b.getBoundingClientRect().width>0&&getComputedStyle(b).visibility!=='hidden'&&!b.closest('[hidden],[inert],[aria-hidden=true]')).map(b=>{const r=b.getBoundingClientRect(),s=b.querySelector('svg').getBoundingClientRect(),i=b.querySelector('.ui-icon-button-indicator'),modal=document.querySelector('.ui-settings-modal:not([hidden])'),covered=!!modal&&!modal.contains(b);return {label:b.getAttribute('aria-label')||b.title,dx:s.x+s.width/2-r.x-r.width/2,dy:s.y+s.height/2-r.y-r.height/2,overlay:!i||(getComputedStyle(i).position==='absolute'&&getComputedStyle(i).pointerEvents==='none'),covered,hit:covered?document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')!==b:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===b};}))",
    (buttons) =>
      buttons.length > 0 &&
      buttons.every(
        (b) =>
          Math.abs(b.dx) < 0.5 && Math.abs(b.dy) < 0.5 && b.overlay && b.hit,
      ),
  );
}
async function checkPointerAndKeyboard(selector, name) {
  child.stdin.write(JSON.stringify({ focus: true }) + "\n");
  await call("Page.bringToFront");
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700, y: 20 });
  await evaluate("document.activeElement?.blur()");
  const style = () =>
    evaluate(
      `(()=>{const b=document.querySelector(${JSON.stringify(selector)}),c=getComputedStyle(b);return {outline:c.outlineStyle,width:c.outlineWidth,border:c.borderColor,shadow:c.boxShadow,focusVisible:b.matches(':focus-visible'),active:document.activeElement===b,current:document.activeElement.outerHTML.slice(0,180)};})()`,
    );
  const resting = await style();
  const r = await rect(selector),
    x = r.x + r.width / 2,
    y = r.y + r.height / 2;
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await new Promise((done) => setTimeout(done, 200));
  const hover = await style();
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  const active = await style();
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await evaluate("window.probe.pause()");
  const clicked = await style();
  for (const [state, value] of [
    ["hover", hover],
    ["active", active],
    ["clicked", clicked],
  ]) {
    assert.equal(value.outline, "none", `${name}: ${state} no outline`);
    assert.equal(
      value.border,
      resting.border,
      `${name}: ${state} stable border`,
    );
    assert.equal(
      value.shadow,
      resting.shadow,
      `${name}: ${state} no added shadow ring`,
    );
  }
  // Some actions legitimately hand focus to Composer; reach the target via real Tab navigation.
  let keyboard;
  for (let attempt = 0; attempt < 40; attempt++) {
    await key("Tab", "Tab");
    await evaluate("window.probe.pause()");
    keyboard = await style();
    if (keyboard.active) break;
  }
  await key("Tab", "Tab", 8);
  await evaluate("window.probe.pause()");
  await key("Tab", "Tab");
  await evaluate("window.probe.pause()");
  keyboard = await style();
  assert.ok(
    keyboard.active &&
      keyboard.focusVisible &&
      keyboard.outline === "solid" &&
      parseFloat(keyboard.width) >= 2,
    `${name}: Tab round-trip restores a visible keyboard outline ${JSON.stringify({ clicked, keyboard })}`,
  );
  results.push({ name, resting, hover, active, clicked, keyboard });
}
async function runNavigationFocusChecks() {
  for (const theme of ["light", "dark"]) {
    await evaluate(
      `document.documentElement.dataset.theme=${JSON.stringify(theme)}`,
    );
    await checkPointerAndKeyboard(
      '.activity-rail button[aria-pressed="true"]',
      `${theme}-rail-pointer-vs-keyboard-focus`,
    );
    await checkPointerAndKeyboard(
      '[data-thread-navigation][aria-current="page"]',
      `${theme}-thread-pointer-vs-keyboard-focus`,
    );
    await capture(`${theme}-keyboard-focus`);
  }
}
async function runFocusChecks() {
  await runNavigationFocusChecks();
  for (const theme of ["light", "dark"]) {
    await evaluate(
      `document.documentElement.dataset.theme=${JSON.stringify(theme)}`,
    );
    await click("Settings");
    await checkPointerAndKeyboard(
      ".settings-navigation button",
      `${theme}-settings-pointer-vs-keyboard-focus`,
    );
    await key("Escape", "Escape");
    await check(
      `${theme}-settings-escape-returns-focus`,
      "document.querySelector('.ui-settings-modal').hidden && document.activeElement.getAttribute('aria-label')==='Settings'",
    );
  }
}
async function runChecks() {
  await runNavigationFocusChecks();
  await evaluate("document.documentElement.dataset.theme='light'");
  await checkIconGeometry("all-icon-actions-centered-with-empty-attention");
  await check(
    "navigation-controls-follow-native-window-controls",
    "(()=>{const h=document.querySelector('.primary-sidebar > .panel-header'),b=h.querySelector('[title=Back]'),f=h.querySelector('[title=Forward]'),s=h.querySelector('[aria-label=\"Open or collapse project navigation\"]');return !!b&&!!f&&!!s&&b.getBoundingClientRect().left>=96&&b.getBoundingClientRect().left<f.getBoundingClientRect().left&&f.getBoundingClientRect().left<s.getBoundingClientRect().left&&!h.querySelector('strong')&&!document.querySelector('.conversation-header [title=Back]');})()",
  );
  await check(
    "production-empty-hosts-closed",
    "document.querySelector('[data-layout-region=workspace]').getBoundingClientRect().width<1 && document.querySelector('[data-layout-region=bottom]').getBoundingClientRect().height<1 && !document.querySelector('[aria-label=\"Restore workspace\"]')",
  );
  await check(
    "custom-header-shares-native-content-top",
    "innerHeight===900 && document.querySelector('.panel-header').getBoundingClientRect().top===0 && getComputedStyle(document.querySelector('.panel-header')).webkitAppRegion==='drag' && getComputedStyle(document.querySelector('.panel-header button')).webkitAppRegion==='no-drag'",
  );
  await check(
    "compact-default-from-legacy-normal",
    "getComputedStyle(document.querySelector('.toolbar button')).minHeight==='30px' && !document.documentElement.hasAttribute('data-density') && !document.body.textContent.includes('Compact density')",
  );
  await evaluate(
    "window.originalEditor=document.querySelector('.tiptap');window.originalController=window.probe.model.controller;window.originalReading=document.querySelector('.reading-pane');window.originalReading.scrollTop=150",
  );
  await evaluate("window.probe.pause()");

  await capture("production-light-desktop");
  await click("Settings");
  await check(
    "settings-modal-backdrop-focus-and-geometry",
    "(()=>{const p=document.querySelector('.ui-settings-modal'),r=p.getBoundingClientRect(),b=document.querySelector('.ui-overlay-backdrop').getBoundingClientRect();return p.getAttribute('role')==='dialog'&&p.contains(document.activeElement)&&r.left>0&&r.right<innerWidth&&r.top>0&&r.bottom<innerHeight&&b.width===innerWidth&&b.height===innerHeight&&!document.querySelector('.toolbar select')&&!!document.querySelector('.primary-sidebar [data-new-thread]')&&!!document.querySelector('.sidebar-label button');})()",
  );
  await capture("settings-light-desktop");
  await key("Escape", "Escape");
  await check(
    "settings-escape-returns-focus",
    "({hidden:document.querySelector('.ui-settings-modal').hidden,active:document.activeElement.outerHTML})",
    (v) => v.hidden && v.active.includes('aria-label=\"Settings\"'),
  );
  await click("Settings");
  await checkPointerAndKeyboard(
    ".settings-navigation button",
    "light-settings-pointer-vs-keyboard-focus",
  );
  await check(
    "settings-reuses-existing-capabilities",
    "document.querySelector('.ui-settings-modal').hidden===false && document.querySelector('.conversation-body').hidden===false && !!document.querySelector('#settings-configuration .configuration-settings') && !!document.querySelector('#settings-attention') && !!document.querySelector('#settings-diagnostics')",
  );

  await evaluate("window.attentionProbe.emit()");
  await evaluate("window.probe.pause()");
  await check(
    "hidden-settings-retains-unread-and-visible-rail-indicator",
    "window.attentionProbe.snapshot().entries[0].unread===true && document.querySelector('.activity-indicator').hidden===false",
  );
  await checkIconGeometry("all-icon-actions-centered-with-unread-attention");
  await evaluate("window.attentionProbe.emit(true)");
  await evaluate("window.probe.pause()");
  await check(
    "notification-intent-reveals-existing-conversation",
    "document.querySelector('.conversation-body').hidden===false && document.querySelector('.ui-settings-modal').hidden===true && window.originalEditor===document.querySelector('.tiptap')",
  );
  await click("Conversation");
  await check(
    "settings-keep-editor-and-reading",
    "({editor:window.originalEditor===document.querySelector('.tiptap'),controller:window.originalController===window.probe.model.controller,scroll:window.originalReading.scrollTop})",
    (v) => v.editor && v.controller && v.scroll === 150,
  );
  await drag("navigation-split-separator", 65);
  await check(
    "left-resize-persists-only-user-size",
    "JSON.parse(localStorage.getItem('d-pi.workbench-layout.v1')).sidebar.size",
    (value) => value > 320 && value < 360,
  );
  const beforeCancel = await rect(".primary-sidebar");
  const savedBeforeCancel = await evaluate(
    "localStorage.getItem('d-pi.workbench-layout.v1')",
  );
  await drag("navigation-split-separator", -90, "x", true);
  const afterCancel = await rect(".primary-sidebar");
  assert.ok(
    Math.abs(beforeCancel.width - afterCancel.width) < 2,
    "pointercancel must restore actual layout",
  );
  assert.equal(
    await evaluate("localStorage.getItem('d-pi.workbench-layout.v1')"),
    savedBeforeCancel,
    "cancel must not persist",
  );
  results.push({
    name: "pointercancel-restores-no-write",
    beforeCancel,
    afterCancel,
  });
  await evaluate(
    "document.querySelector('#navigation-split-separator').focus()",
  );
  await key("ArrowLeft", "ArrowLeft");
  await check(
    "keyboard-resize-after-cancel",
    "({width:document.querySelector('.primary-sidebar').getBoundingClientRect().width,saved:JSON.parse(localStorage.getItem('d-pi.workbench-layout.v1')).sidebar.size})",
    (value) =>
      value.width < beforeCancel.width - 1 &&
      Math.abs(value.saved - value.width) < 2,
  );
  await drag("navigation-split-separator", -400, "x", false, true);
  await check(
    "collapse-preview-drag-back",
    "JSON.parse(localStorage.getItem('d-pi.workbench-layout.v1')).sidebar.open",
  );
  await drag("navigation-split-separator", -400);
  await check(
    "left-threshold-collapse",
    "document.querySelector('.primary-sidebar').getBoundingClientRect().width<1 && JSON.parse(localStorage.getItem('d-pi.workbench-layout.v1')).sidebar.open===false",
  );
  await check(
    "left-collapse-returns-focus",
    "document.activeElement.getAttribute('aria-label')==='Open or collapse project navigation'",
  );
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    text: "\r",
    windowsVirtualKeyCode: 13,
  });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter" });
  await evaluate("window.probe.pause()");
  await check(
    "keyboard-sidebar-restore-retains-navigation-focus",
    "document.activeElement.getAttribute('aria-label')==='Open or collapse project navigation'",
  );
  await check(
    "left-explicit-restore",
    "({width:document.querySelector('.primary-sidebar').getBoundingClientRect().width,saved:localStorage.getItem('d-pi.workbench-layout.v1')})",
    (v) => v.width >= 220,
  );
  await evaluate("window.originalEditor.focus()");
  await resize(720, 540);
  await check(
    "navigation-relocation-does-not-steal-composer-focus",
    "document.activeElement===window.originalEditor",
  );
  await check(
    "minimum-window-protects-input-and-reading",
    "(()=>{const frame=document.querySelector('.window-frame'),r=document.querySelector('.reading-pane').getBoundingClientRect(),editor=document.querySelector('.composer').getBoundingClientRect();return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,nav:document.querySelector('.primary-sidebar').getBoundingClientRect().width,reading:r.height,editorBottom:editor.bottom,bodyHeight:frame.getBoundingClientRect().height};})()",
    (value) =>
      value.width === 720 &&
      !value.overflow &&
      value.nav < 1 &&
      value.reading > 40 &&
      value.editorBottom <= value.bodyHeight + 1,
  );
  await click("Open or collapse project navigation");
  await check(
    "narrow-navigation-overlay",
    "!!document.querySelector('.ui-navigation-overlay') && document.querySelector('.ui-navigation-overlay').getBoundingClientRect().right<innerWidth",
  );
  await key("Escape", "Escape");
  await check(
    "overlay-returns-focus",
    "!document.querySelector('.ui-navigation-overlay') && document.activeElement.getAttribute('aria-label')==='Open or collapse project navigation'",
  );
  await evaluate("window.probe.model.preference('theme')");
  await evaluate("window.probe.model.preference('theme')");
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  });
  await wait(() =>
    evaluate(
      "document.documentElement.dataset.theme==='dark' && !!document.querySelector('.toolbar [data-theme-preference=system] svg')",
    ),
  );
  await check(
    "system-theme-uses-own-icon-and-dark-OS-resolution",
    "window.probe.model.getSnapshot().preferences.theme==='system'&&document.documentElement.dataset.theme==='dark'&&!!document.querySelector('.toolbar [data-theme-preference=system] svg')",
  );
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }],
  });
  await wait(() =>
    evaluate("document.documentElement.dataset.theme==='light'"),
  );
  await check(
    "system-theme-follows-OS-without-changing-preference",
    "document.documentElement.dataset.theme==='light'&&window.probe.model.getSnapshot().preferences.theme==='system'",
  );
  await evaluate("window.probe.model.preference('theme');");
  await evaluate("window.probe.model.preference('theme');");
  await capture("production-dark-minimum");
  await click("Settings");
  await checkPointerAndKeyboard(
    ".settings-navigation button",
    "dark-settings-pointer-vs-keyboard-focus",
  );
  await capture("settings-dark-minimum");
  await key("Tab", "Tab");
  await check(
    "settings-actions-retain-keyboard-focus-outline",
    "[...document.querySelectorAll('.ui-settings-modal button,.ui-settings-modal select')].filter(b=>!b.disabled&&b.getBoundingClientRect().width>0).map(b=>{b.focus();return {label:b.textContent||b.getAttribute('aria-label'),visible:b.matches(':focus-visible'),outline:getComputedStyle(b).outlineStyle,width:getComputedStyle(b).outlineWidth};})",
    (controls) =>
      controls.length >= 5 &&
      controls.every(
        (c) => c.visible && c.outline === "solid" && parseFloat(c.width) >= 2,
      ),
  );
  await click("Close");
  await checkIconGeometry("all-icon-actions-centered-in-dark-narrow-window");
  await check(
    "responsive-preserves-user-intent",
    "JSON.parse(localStorage.getItem('d-pi.workbench-layout.v1')).sidebar.open",
  );
  await resize(1440, 900);
  await check(
    "automatic-sidebar-restore",
    "document.querySelector('.primary-sidebar').getBoundingClientRect().width>220",
  );
  await evaluate("window.hostProbe.enable()");
  await evaluate("window.probe.pause()");
  await click("Restore workspace");
  await click("Restore bottom panel");
  await check(
    "isolated-three-regions-open",
    "document.querySelector('[data-layout-region=workspace]').getBoundingClientRect().width>=320 && document.querySelector('[data-layout-region=bottom]').getBoundingClientRect().height>=140",
  );
  await evaluate(
    "window.monacoNode=document.querySelector('[data-layout-region=workspace] .monaco-editor')",
  );
  await drag("workspace-split-separator", -55);
  await drag("bottom-split-separator", -40, "y");
  await check(
    "right-and-bottom-user-resize",
    "(()=>{const s=JSON.parse(localStorage.getItem('d-pi.workbench-layout.v1'));return {right:s.workspace.size,bottom:s.bottom.size};})()",
    (value) => value.right > 450 && value.bottom > 240,
  );
  for (const [id, selector, region, axis, keyName, delta] of [
    [
      "workspace-split-separator",
      "[data-layout-region=workspace]",
      "workspace",
      "x",
      "ArrowLeft",
      45,
    ],
    [
      "bottom-split-separator",
      "[data-layout-region=bottom]",
      "bottom",
      "y",
      "ArrowUp",
      35,
    ],
  ]) {
    const before = await rect(selector);
    const persisted = await evaluate(
      "localStorage.getItem('d-pi.workbench-layout.v1')",
    );
    await drag(id, delta, axis, true);
    const after = await rect(selector);
    assert.ok(
      Math.abs(
        before[axis === "x" ? "width" : "height"] -
          after[axis === "x" ? "width" : "height"],
      ) < 2,
    );
    assert.equal(
      await evaluate("localStorage.getItem('d-pi.workbench-layout.v1')"),
      persisted,
    );
    results.push({ name: `${region}-cancel-no-write`, before, after });
    await evaluate(`document.getElementById(${JSON.stringify(id)}).focus()`);
    await key(keyName, keyName);
    await evaluate("window.probe.pause()");
    await check(
      `${region}-keyboard-persists`,
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {size:e.${axis === "x" ? "width" : "height"},saved:JSON.parse(localStorage.getItem('d-pi.workbench-layout.v1')).${region}.size};})()`,
      (v) => Math.abs(v.size - v.saved) < 2,
    );
    await key(
      axis === "x" ? "ArrowRight" : "ArrowDown",
      axis === "x" ? "ArrowRight" : "ArrowDown",
    );
    await evaluate("window.probe.pause()");
  }
  await evaluate(
    "window.originalReading.scrollTop=120;window.originalEditor.focus();window.bottomScroll=document.querySelector('[data-layout-region=bottom] .workspace-tab-content');window.bottomScroll.scrollTop=100;",
  );
  await evaluate("window.probe.pause()");
  await check(
    "bottom-scroll-independent",
    "window.bottomScroll.scrollTop===100 && window.originalReading.scrollTop===120",
  );
  await evaluate(`(async()=>{
    const root=document.documentElement,nav=document.querySelector('.activity-rail [aria-pressed=true]'),action=document.querySelector('.composer .ui-button-primary'),muted=document.querySelector('.save-status');
    const colors=()=>({action:getComputedStyle(action).backgroundColor,nav:getComputedStyle(nav).backgroundColor,text:getComputedStyle(muted).color});
    window.roleBefore=colors();root.style.setProperty('--primary','#895020');root.style.setProperty('--muted-foreground','#445566');
    await new Promise(r=>setTimeout(r,200));window.roleAfter=colors();root.style.removeProperty('--primary');root.style.removeProperty('--muted-foreground');
  })()`);
  await check(
    "central-primary-and-muted-propagate",
    "({before:window.roleBefore,after:window.roleAfter})",
    (v) => Object.keys(v.before).every((k) => v.before[k] !== v.after[k]),
  );
  await check(
    "headers-share-panel-geometry",
    "(()=>{const sidebar=document.querySelector('.primary-sidebar').getBoundingClientRect(),main=document.querySelector('.conversation-surface').getBoundingClientRect(),right=document.querySelector('[data-layout-region=workspace]').getBoundingClientRect(),headers=[...document.querySelectorAll('.panel-header')].filter(e=>e.getBoundingClientRect().width>1);return {top:[sidebar.y,main.y,right.y],height:headers.slice(0,3).map(e=>e.getBoundingClientRect().height),rightEdge:main.right,rightStart:right.x};})()",
    (value) =>
      Math.max(...value.top) - Math.min(...value.top) < 1 &&
      value.height.every((height) => height === 44) &&
      Math.abs(value.rightStart - value.rightEdge - 1) < 0.1,
  );
  await check(
    "drag-keeps-editor-controller-reading-and-monaco",
    "window.originalEditor===document.querySelector('.tiptap') && window.originalController===window.probe.model.controller && window.originalReading===document.querySelector('.reading-pane') && window.monacoNode===document.querySelector('[data-layout-region=workspace] .monaco-editor')",
  );
  await evaluate("document.querySelector('#workspace-tab-source').focus()");
  await key("ArrowRight", "ArrowRight");
  await check(
    "tab-keyboard-selection",
    "document.querySelector('#workspace-tab-details').getAttribute('aria-selected')==='true' && document.activeElement.id==='workspace-tab-details'",
  );
  await key("Home", "Home");
  await check(
    "tab-return-preserves-monaco",
    "window.monacoNode===document.querySelector('[data-layout-region=workspace] .monaco-editor') && document.querySelector('#workspace-tab-source').getAttribute('aria-selected')==='true'",
  );
  await drag("workspace-split-separator", 600);
  await check(
    "right-threshold-close",
    "JSON.parse(localStorage.getItem('d-pi.workbench-layout.v1')).workspace.open===false",
  );
  await check(
    "right-collapse-returns-focus",
    "document.activeElement.getAttribute('aria-label')==='Restore workspace'",
  );
  await click("Restore workspace");
  await drag("bottom-split-separator", 500, "y");
  await check(
    "bottom-threshold-close",
    "JSON.parse(localStorage.getItem('d-pi.workbench-layout.v1')).bottom.open===false",
  );
  await check(
    "bottom-collapse-returns-focus",
    "document.activeElement.getAttribute('aria-label')==='Restore bottom panel'",
  );
  await click("Restore bottom panel");
  await check(
    "restore-preserves-views",
    "window.originalEditor===document.querySelector('.tiptap') && window.monacoNode===document.querySelector('[data-layout-region=workspace] .monaco-editor')",
  );
  await evaluate(
    "window.originalEditor.focus();const s=getSelection(),r=document.createRange();r.selectNodeContents(window.originalEditor);r.collapse(false);s.removeAllRanges();s.addRange(r)",
  );
  await call("Input.insertText", { text: " geometry edit" });
  await key("z", "KeyZ", 4);
  await check(
    "undo-through-shell",
    "!window.originalEditor.textContent.includes('geometry edit')",
  );
  await key("z", "KeyZ", 12);
  await check(
    "redo-through-shell",
    "window.originalEditor.textContent.includes('geometry edit')",
  );
  await call("Input.imeSetComposition", {
    text: "中",
    selectionStart: 1,
    selectionEnd: 1,
  });
  await call("Input.imeSetComposition", {
    text: "中文",
    selectionStart: 2,
    selectionEnd: 2,
  });
  await call("Input.insertText", { text: "中文" });
  await check(
    "chromium-composition-does-not-recreate-editor",
    "window.originalEditor===document.querySelector('.tiptap') && window.originalEditor.textContent.includes('中文')",
  );
  await evaluate(
    "(async()=>{while(window.probe.model.getSnapshot().preferences.theme!=='light')await window.probe.model.preference('theme');})()",
  );
  await capture("isolated-light-desktop");
  await evaluate("window.bottomScroll.scrollTop=0");
  await checkIconGeometry(
    "all-icon-actions-centered-with-light-indicator-samples",
  );
  const saved = await evaluate(
    "localStorage.getItem('d-pi.workbench-layout.v1')",
  );
  await resize(720, 540);
  await check(
    "minimum-with-hosts-temporary-hidden-no-preference-loss",
    `document.querySelector('[data-layout-region=workspace]').getBoundingClientRect().width<1 && document.querySelector('.reading-pane').getBoundingClientRect().height>40 && localStorage.getItem('d-pi.workbench-layout.v1')===${JSON.stringify(saved)} && window.originalEditor===document.querySelector('.tiptap')`,
  );
  await evaluate("window.originalEditor.focus()");
  await call("Input.insertText", {
    text: "\n".repeat(50) + "长正文与附件区预算 Chinese long draft",
  });
  await evaluate("window.probe.pause()");
  await check(
    "minimum-long-draft-preserves-reading-budget",
    "(()=>{const read=document.querySelector('.reading-pane').getBoundingClientRect(),composer=document.querySelector('.composer').getBoundingClientRect(),editor=document.querySelector('.tiptap'),setup=document.querySelector('.thread-setup').getBoundingClientRect();return {reading:read.height,editorBottom:composer.bottom,height:innerHeight,editor:editor.getBoundingClientRect().height,maximum:getComputedStyle(editor).maxHeight,setup:setup.height,readingOuter:document.querySelector('.thread-reading').getBoundingClientRect().height};})()",
    (v) => v.reading > 40 && v.editorBottom <= v.height,
  );
  await key("z", "KeyZ", 4);
  await click("Settings");
  await check(
    "narrow-settings-modal-remains-bounded",
    "(()=>{const r=document.querySelector('.ui-settings-modal').getBoundingClientRect();return r.left>0&&r.right<innerWidth&&r.top>0&&r.bottom<innerHeight&&document.querySelector('.settings-surface').clientHeight>100;})()",
  );
  await evaluate(
    "(()=>{const s=document.querySelector('#settings-appearance select');s.value='zh-CN';s.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await capture("settings-light-minimum-chinese");
  await click("关闭");
  await evaluate("window.probe.pause()");
  await check(
    "minimum-chinese-actions-reachable",
    "document.querySelector('.activity-rail button[aria-label=设置]')!==null && document.documentElement.scrollWidth===innerWidth && document.querySelector('.reading-pane').getBoundingClientRect().height>40",
  );
  await capture("isolated-light-minimum");
  await checkIconGeometry("all-icon-actions-centered-in-chinese-narrow-window");
  await click("设置");
  await evaluate(
    "(()=>{const s=document.querySelector('#settings-appearance select');s.value='en-US';s.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await click("Close");
  await evaluate("window.probe.pause()");
  await resize(1440, 900);
  await evaluate("window.probe.model.preference('theme')");
  await evaluate("window.bottomScroll.scrollTop=0");
  await capture("isolated-dark-desktop");
  await checkIconGeometry(
    "all-icon-actions-centered-with-tabs-and-indicator-samples",
  );
  await resize(1920, 1080);
  await check(
    "work-area-is-not-reading-width-limited",
    "document.querySelector('.work-content').getBoundingClientRect().width===document.querySelector('.conversation-surface').getBoundingClientRect().width && document.querySelector('.work-content').getBoundingClientRect().width>896",
  );
  await check(
    "large-window-geometry",
    "document.querySelector('.conversation-surface').getBoundingClientRect().width>=480 && document.querySelector('.composer').getBoundingClientRect().width<=896 && document.documentElement.scrollWidth===innerWidth",
  );
  await resize(1440, 900);
  await evaluate("document.querySelector('#workspace-tab-source').focus()");
  await click("Close Isolated source container");
  await check(
    "close-tab-does-not-close-host-and-focuses-neighbor",
    "!document.querySelector('#workspace-tab-source') && document.querySelector('#workspace-tab-details').getAttribute('aria-selected')==='true' && document.activeElement.id==='workspace-tab-details' && document.querySelector('[data-layout-region=workspace]').getBoundingClientRect().width>=320",
  );
  await click("Close Isolated details container");
  await check(
    "last-tab-closes-empty-host",
    "document.querySelector('[data-layout-region=workspace]').getBoundingClientRect().width<1 && !document.querySelector('[aria-label=\"Restore workspace\"]') && document.activeElement.getAttribute('aria-label')==='Open or collapse project navigation'",
  );
}
