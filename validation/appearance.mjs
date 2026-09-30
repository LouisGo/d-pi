import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createTestEnvironment } from "../scripts/test-environment.mjs";

// Run the built application with isolated App/OMP/Git directories. No model or
// execution permission is configured; this checks only the affected GUI path.
const application = resolve(process.argv[2] ?? ".");
const packaged = application.endsWith(".app");
const sandbox = createTestEnvironment({ prefix: "d-pi-appearance-" });
const output = resolve(process.argv[3] ?? sandbox.root);
mkdirSync(output, { recursive: true });
const file = "appearance-fixture.ts";
const initial = Array.from(
  { length: 180 },
  (_, index) => `export const value${index} = ${index};`,
).join("\n");
writeFileSync(join(sandbox.cwd, file), initial);
for (const args of [
  ["init", "-q"],
  ["add", file],
  [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "appearance fixture",
  ],
]) {
  const result = spawnSync("/usr/bin/git", ["-C", sandbox.cwd, ...args], {
    env: sandbox.env,
  });
  assert.equal(result.status, 0, result.stderr?.toString());
}
writeFileSync(join(sandbox.cwd, file), initial.replace("= 12;", "= 1200;"));
const draft = Array.from(
  { length: 18 },
  (_, index) => `Draft line ${index}: preserve editor state.`,
).join("\n");
const db = new DatabaseSync(join(sandbox.data, "drafts.sqlite"));
db.exec(
  "CREATE TABLE workspace(id TEXT PRIMARY KEY,directory TEXT NOT NULL UNIQUE,execution_trust TEXT NOT NULL);CREATE TABLE thread(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL);CREATE TABLE desktop(id INTEGER PRIMARY KEY,active_thread TEXT,theme TEXT NOT NULL,density TEXT NOT NULL);PRAGMA user_version=1;",
);
const workspace = randomUUID();
const thread = randomUUID();
db.prepare("INSERT INTO workspace VALUES(?,?,'browse')").run(
  workspace,
  sandbox.cwd,
);
db.prepare("INSERT INTO thread VALUES(?,?,0,?)").run(thread, workspace, draft);
db.prepare("INSERT INTO desktop VALUES(1,?,'light','normal')").run(thread);

const ports = createServer();
await new Promise((accept) => ports.listen(0, "127.0.0.1", accept));
const port = ports.address().port;
await new Promise((accept) => ports.close(accept));
const binary = packaged
  ? join(application, "Contents/MacOS/d-pi")
  : join(
      application,
      "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    );
const child = spawn(
  binary,
  [
    ...(packaged ? [] : [application]),
    "--lang=en-US",
    `--remote-debugging-port=${port}`,
  ],
  {
    env: sandbox.env,
    cwd: packaged ? dirname(application) : application,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const log = createWriteStream(join(output, "electron.log"));
child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });
let socket;
let captureFailure;
const pause = (ms) => new Promise((accept) => setTimeout(accept, ms));
async function wait(fn) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    const result = await fn();
    if (result) return result;
    if (child.exitCode !== null || child.signalCode !== null)
      throw Error("Electron exited before GUI validation completed");
    await pause(50);
  }
  throw Error("Appearance GUI timeout");
}
try {
  const target = await wait(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1000),
      });
      return (await response.json()).find((item) => item.type === "page");
    } catch {
      return null;
    }
  });
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((accept, reject) => {
    socket.onopen = accept;
    socket.onerror = reject;
  });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry?.reject(Error(message.error.message));
    else entry?.accept(message.result);
  };
  socket.onclose = () => {
    for (const entry of pending.values()) entry.reject(Error("CDP closed"));
    pending.clear();
  };
  const call = (method, params = {}) =>
    new Promise((accept, reject) => {
      const id = ++sequence;
      pending.set(id, { accept, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const settle = () =>
    evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
  const screenshot = async (name) => {
    const shot = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(output, name), Buffer.from(shot.data, "base64"));
  };
  captureFailure = () => screenshot("failure.png");
  const click = (selector, includes) =>
    evaluate(
      `(()=>{const button=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(item=>item.textContent.includes(${JSON.stringify(includes)}));if(!button||button.disabled)throw Error('Button unavailable');button.click();})()`,
    );
  await wait(() => evaluate("!!document.querySelector('.toolbar select')"));
  await evaluate(
    "(()=>{const select=document.querySelector('.toolbar select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'en-US');select.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await wait(() => evaluate("document.documentElement.lang==='en-US'"));
  await wait(() => evaluate("!!document.querySelector('.tiptap')"));
  await call("Page.bringToFront");
  await evaluate(
    "(()=>{const editor=document.querySelector('.tiptap');editor.focus();const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);})()",
  );
  const marker = " APPEARANCE_UNDO_MARKER";
  await call("Input.insertText", { text: marker });
  await wait(() =>
    evaluate(
      `document.querySelector('.tiptap').textContent.endsWith(${JSON.stringify(marker)})`,
    ),
  );
  await evaluate(
    "(()=>{window.appearanceComposer=document.querySelector('.tiptap');const range=document.createRange();range.setStart(appearanceComposer.lastChild.firstChild,3);range.setEnd(appearanceComposer.lastChild.firstChild,14);getSelection().removeAllRanges();getSelection().addRange(range);appearanceComposer.scrollTop=100;})()",
  );
  const composerSelection = await evaluate("getSelection().toString()");
  const composerScroll = await evaluate("appearanceComposer.scrollTop");
  await click(".file-list button", file);
  await wait(() =>
    evaluate("!!document.querySelector('.monaco-editor .view-line')"),
  );
  await settle();
  await call("Performance.enable");
  const metrics = async () => {
    const result = await call("Performance.getMetrics");
    const selected = new Set([
      "LayoutCount",
      "LayoutDuration",
      "RecalcStyleCount",
      "RecalcStyleDuration",
      "ScriptDuration",
      "TaskDuration",
    ]);
    return Object.fromEntries(
      result.metrics
        .filter((entry) => selected.has(entry.name))
        .map((entry) => [entry.name, entry.value]),
    );
  };
  const toggle = async (field, pointer = false) => {
    const before = await evaluate(`document.documentElement.dataset.${field}`);
    const selector = `.toolbar button:nth-of-type(${field === "theme" ? 1 : 2})`;
    if (pointer) {
      const point = await evaluate(
        `(()=>{const button=document.querySelector(${JSON.stringify(selector)});button.scrollIntoView({block:'center'});const rect=button.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};})()`,
      );
      for (const type of ["mousePressed", "mouseReleased"])
        await call("Input.dispatchMouseEvent", {
          type,
          ...point,
          button: "left",
          clickCount: 1,
        });
    } else
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).click()`,
      );
    await wait(() =>
      evaluate(
        `document.documentElement.dataset.${field}!==${JSON.stringify(before)}`,
      ),
    );
    await settle();
  };
  const cycles = [];
  const geometry = [];
  const checkGeometry = async (kind) => {
    const size = await evaluate(
      "(()=>{const outer=document.querySelector('.monaco-readonly');const inner=appearanceMonaco.getBoundingClientRect();const parent=outer.parentElement;if(!parent.matches('.file-workspace'))throw Error('Unexpected Monaco host parent');const style=getComputedStyle(parent);const host=getComputedStyle(outer);const allocatedWidth=parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-parseFloat(host.borderLeftWidth)-parseFloat(host.borderRightWidth);return {density:document.documentElement.dataset.density,outerWidth:outer.clientWidth,innerWidth:inner.width,outerHeight:outer.clientHeight,innerHeight:inner.height,allocatedWidth,parentWidth:parent.clientWidth,padding:style.paddingLeft};})()",
    );
    assert.ok(
      Math.abs(size.outerWidth - size.innerWidth) <= 1,
      JSON.stringify(size),
    );
    assert.ok(
      Math.abs(size.outerHeight - size.innerHeight) <= 1,
      JSON.stringify(size),
    );
    assert.ok(
      Math.abs(size.allocatedWidth - size.outerWidth) <= 1,
      JSON.stringify(size),
    );
    geometry.push({ kind, ...size });
  };
  const verify = async (kind) => {
    const roots =
      kind === "diff"
        ? ".monaco-diff-editor"
        : ".monaco-readonly > .monaco-editor";
    await evaluate(
      `void (window.appearanceMonaco=document.querySelector(${JSON.stringify(roots)}))`,
    );
    await evaluate("appearanceMonaco.scrollIntoView({block:'center'})");
    const center = await evaluate(
      "(()=>{const rect=appearanceMonaco.getBoundingClientRect();return {x:rect.x+rect.width*0.75,y:rect.y+rect.height/2};})()",
    );
    await call("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      ...center,
      deltaX: 0,
      deltaY: 350,
    });
    await settle();
    const monacoScroll = () =>
      evaluate(
        "Array.from(appearanceMonaco.querySelectorAll('.scrollbar.vertical .slider')).map(item=>item.style.top)",
      );
    const scrollBefore = await monacoScroll();
    assert.ok(scrollBefore.some((top) => Number.parseFloat(top) > 0));
    const text = await evaluate("appearanceComposer.textContent");
    const before = await metrics();
    // Fixed content/build path/operation count; aggregate metrics are evidence,
    // not a frame-time or user-perceived speed benchmark.
    for (let index = 0; index < 6; index++) await toggle("theme");
    const themed = await metrics();
    for (let index = 0; index < 6; index++) await toggle("density");
    const compacted = await metrics();
    const delta = (from, to) =>
      Object.fromEntries(
        Object.keys(from).map((key) => [key, to[key] - from[key]]),
      );
    assert.equal(
      await evaluate("appearanceComposer===document.querySelector('.tiptap')"),
      true,
    );
    assert.equal(
      await evaluate(
        `appearanceMonaco===document.querySelector(${JSON.stringify(roots)})`,
      ),
      true,
    );
    assert.equal(await evaluate("appearanceComposer.textContent"), text);
    assert.equal(
      await evaluate("appearanceComposer.scrollTop"),
      composerScroll,
    );
    assert.deepEqual(await monacoScroll(), scrollBefore);
    const dimension = await evaluate(
      "(()=>{const outer=document.querySelector('.monaco-readonly').getBoundingClientRect();const inner=appearanceMonaco.getBoundingClientRect();return {outer:outer.width,inner:inner.width};})()",
    );
    assert.ok(
      Math.abs(dimension.outer - dimension.inner) <= 3,
      JSON.stringify(dimension),
    );
    cycles.push({
      kind,
      operationsPerPreference: 6,
      theme: delta(before, themed),
      density: delta(themed, compacted),
      dimension,
    });
  };
  await verify("file");
  await checkGeometry("file");
  assert.equal(await evaluate("getSelection().toString()"), composerSelection);
  // Supplement the fixed-operation metrics with real mouse-down/up events,
  // verifying the toolbar's focus behavior while selection is still active.
  await toggle("theme", true);
  await toggle("density", true);
  assert.equal(await evaluate("getSelection().toString()"), composerSelection);
  await checkGeometry("file");
  await evaluate(
    "document.querySelector('.file-workspace').scrollIntoView({block:'center'})",
  );
  await screenshot("file-dark-compact.png");
  await toggle("theme");
  await toggle("density");
  await click(".change-list button", file);
  await wait(() =>
    evaluate("!!document.querySelector('.monaco-diff-editor .view-line')"),
  );
  await settle();
  await verify("diff");
  await checkGeometry("diff");
  await evaluate(
    "Array.from(document.querySelectorAll('.monaco-editor .native-edit-context,.monaco-editor textarea.inputarea')).at(-1).focus()",
  );
  for (const type of ["keyDown", "keyUp"])
    await call("Input.dispatchKeyEvent", {
      type,
      key: "a",
      code: "KeyA",
      modifiers: 4,
      windowsVirtualKeyCode: 65,
    });
  await wait(() =>
    evaluate(
      "Array.from(document.querySelectorAll('.file-workspace button')).some(item=>item.textContent.includes('Attach selection')&&!item.disabled)",
    ),
  );
  const selectionState = await evaluate(
    "document.querySelector('.file-workspace').textContent",
  );
  await toggle("theme", true);
  await toggle("density", true);
  await checkGeometry("diff");
  assert.equal(
    await evaluate("document.querySelector('.file-workspace').textContent"),
    selectionState,
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.monaco-editor .selected-text').length>0",
    ),
    true,
  );
  await evaluate("appearanceMonaco.scrollIntoView({block:'center'})");
  await screenshot("diff-dark-compact.png");
  await click(".file-workspace button", "Attach selection");
  await wait(() => evaluate("!!document.querySelector('.file-reference pre')"));
  const reference = await evaluate(
    "document.querySelector('.file-reference pre').textContent",
  );
  await toggle("theme");
  await toggle("density");
  assert.equal(
    await evaluate("document.querySelector('.file-reference pre').textContent"),
    reference,
  );
  assert.equal(
    await evaluate("appearanceComposer===document.querySelector('.tiptap')"),
    true,
  );
  // A real ProseMirror history command: undo the attachment, then the insertion.
  await evaluate("appearanceComposer.focus()");
  for (let index = 0; index < 2; index++) {
    for (const type of ["keyDown", "keyUp"])
      await call("Input.dispatchKeyEvent", {
        type,
        key: "z",
        code: "KeyZ",
        modifiers: 4,
        windowsVirtualKeyCode: 90,
      });
    await settle();
  }
  assert.equal(
    await evaluate(
      "appearanceComposer.textContent.includes('APPEARANCE_UNDO_MARKER')",
    ),
    false,
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.file-reference pre').length"),
    0,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS total FROM native_session").get().total,
    0,
  );
  for (const kind of ["file", "diff"]) {
    const normal = geometry.find(
      (size) => size.kind === kind && size.density === "normal",
    );
    const compact = geometry.find(
      (size) => size.kind === kind && size.density === "compact",
    );
    assert.ok(normal && compact);
    assert.notEqual(
      normal.outerWidth,
      compact.outerWidth,
      `fixture must exercise a real density size change: ${JSON.stringify(geometry)}`,
    );
  }
  const result = {
    application,
    build: await evaluate(
      "document.querySelector('.sidebar-bottom .trace').textContent",
    ),
    fixture: { fileLines: 180, draftLines: 18, sandbox: sandbox.root },
    checks: [
      "file/diff/editor identity",
      "draft and DOM selection",
      "composer scroll",
      "Monaco scroll",
      "editor geometry",
      "Monaco selection",
      "attachment preserved",
      "real undo",
      "no OMP session",
    ],
    cycles,
    geometry,
    limitations:
      "CDP automation of the built Electron GUI; no frame-time distribution, physical paint, font preference, system IME, real provider or user acceptance claim.",
  };
  writeFileSync(
    join(output, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(`PASS: affected appearance GUI. Evidence: ${output}`);
} catch (error) {
  await captureFailure?.().catch(() => {});
  console.error(`Appearance evidence: ${output}`);
  throw error;
} finally {
  socket?.close();
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((accept) => child.once("exit", accept)),
    pause(5000).then(() => child.kill("SIGKILL")),
  ]);
  db.close();
  log.end();
}
