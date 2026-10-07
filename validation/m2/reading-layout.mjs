// Bounded real-Electron probe with isolated synthetic project/history. Optional
// clipboard mode writes a private fixture and restores the native pasteboard.
// No credential input, execution approval, model request or computer-use loop.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";
import { validateTrustedClipboard } from "./trusted-clipboard.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-reading-layout-" });
const output = resolve("out/qa-convergence");
mkdirSync(output, { recursive: true });
const threadId = randomUUID();
const otherThreadId = randomUUID();
const directoryId = randomUUID();
const frozenReferences = process.argv.includes("--frozen-references");
const targetDirectory = frozenReferences
  ? join(isolated.root, "clipboard-target")
  : isolated.cwd;
const targetDirectoryId = frozenReferences ? randomUUID() : directoryId;
const clipboardThreadId = frozenReferences ? randomUUID() : otherThreadId;
if (frozenReferences) mkdirSync(targetDirectory, { recursive: true });
const db = new DatabaseSync(join(isolated.data, "drafts.sqlite"));
db.exec(
  "CREATE TABLE workspace(id TEXT PRIMARY KEY,directory TEXT NOT NULL UNIQUE,execution_trust TEXT NOT NULL);CREATE TABLE thread(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL);CREATE TABLE desktop(id INTEGER PRIMARY KEY,active_thread TEXT,theme TEXT NOT NULL,density TEXT NOT NULL);PRAGMA user_version=1;",
);
db.prepare("INSERT INTO workspace VALUES(?,?,'browse')").run(
  directoryId,
  isolated.cwd,
);
if (frozenReferences)
  db.prepare("INSERT INTO workspace VALUES(?,?,'browse')").run(
    targetDirectoryId,
    targetDirectory,
  );
db.prepare("INSERT INTO thread VALUES(?,?,0,?)").run(
  threadId,
  directoryId,
  "Synthetic QA draft\nline two\nline three",
);
db.prepare("INSERT INTO thread VALUES(?,?,0,?)").run(
  otherThreadId,
  directoryId,
  "Other synthetic QA draft",
);
if (frozenReferences)
  db.prepare("INSERT INTO thread VALUES(?,?,0,?)").run(
    clipboardThreadId,
    targetDirectoryId,
    "Frozen target synthetic QA draft",
  );
db.prepare("INSERT INTO desktop VALUES(1,?,'light','normal')").run(threadId);
db.close();
writeFileSync(
  join(isolated.cwd, "README.md"),
  Array.from(
    { length: 80 },
    (_, i) => `Synthetic read-only QA line ${i + 1}`,
  ).join("\n"),
);
// Project history follows the SDK configuration source directory, rather than
// the separate execution-session override used by the isolation helper.
const historyRoot = join(isolated.config, "sessions");
mkdirSync(join(historyRoot, "fixture"), { recursive: true });
writeFileSync(
  join(historyRoot, "fixture", "history.jsonl"),
  [
    { type: "session", version: 3, id: "offline-qa", cwd: isolated.cwd },
    {
      type: "message",
      id: "qa-user",
      parentId: null,
      message: { role: "user", content: "OFFLINE QA / synthetic input" },
    },
    {
      type: "message",
      id: "qa-assistant",
      parentId: "qa-user",
      message: {
        role: "assistant",
        content:
          "OFFLINE QA / synthetic text, not model output.\n\n" +
          "Reading sample.\n\n".repeat(30),
      },
    },
    ...Array.from({ length: 24 }, (_, index) => ({
      type: "message",
      id: `anchor-${index}`,
      parentId: "qa-assistant",
      message: {
        role: "assistant",
        content:
          `Anchor fixture ${index}.\n\n` +
          "Synthetic offline geometry text that wraps when the viewport changes. ".repeat(
            16,
          ),
      },
    })),
  ]
    .map((value) => JSON.stringify(value))
    .join("\n") + "\n",
);
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const child = spawn(
  resolve("node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"),
  [resolve("out/main/index.js"), `--remote-debugging-port=${port}`],
  { cwd: isolated.cwd, env: isolated.env, stdio: ["ignore", "ignore", "pipe"] },
);
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr = (stderr + chunk).slice(-4096);
});
let socket;
let sequence = 0;
const pending = new Map();
const measurements = [];
async function wait(fn) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    const result = await fn();
    if (result) return result;
    if (child.exitCode !== null) throw Error(`Electron exited: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Reading layout probe timed out");
}
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const value = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (value.exceptionDetails)
    throw Error(JSON.stringify(value.exceptionDetails));
  return value.result.value;
}
async function click(text) {
  await evaluate(
    `(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!button)throw Error('Button missing');button.click();})()`,
  );
  await evaluate(
    "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
  );
}
async function measure(name) {
  await evaluate(
    "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
  );
  const value = await evaluate(`(()=>{
    const pane=document.querySelector('.reading-pane:not([hidden])');
    const focus=document.querySelector('.reading-focus button');
    const code=pane.querySelector('.monaco-readonly');
    const rect=pane.getBoundingClientRect();
    const focusRect=focus.getBoundingClientRect();
    const nav=document.querySelector('.reading-navigation').getBoundingClientRect();
    const codeRect=code?.getBoundingClientRect();
    return {width:innerWidth,height:innerHeight,readingHeight:rect.height,focusVisible:focusRect.left>=nav.left&&focusRect.right<=nav.right,codeVisible:codeRect?Math.max(0,Math.min(rect.bottom,codeRect.bottom)-Math.max(rect.top,codeRect.top)):null,focused:document.querySelector('.thread-workspace').dataset.readingFocus,editorPreserved:window.__qaEditor===document.querySelector('.tiptap'),draft:document.querySelector('.tiptap').textContent};
  })()`);
  assert.equal(value.focusVisible, true);
  assert.equal(value.editorPreserved, true);
  assert.ok(value.draft.includes("Synthetic QA draft"));
  if (value.focused === "true") assert.ok(value.readingHeight > 360);
  if (value.codeVisible !== null) assert.ok(value.codeVisible > 60);
  const screenshot = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    join(output, `${name}.png`),
    Buffer.from(screenshot.data, "base64"),
  );
  measurements.push({ name, ...value });
  return value;
}
try {
  const target = await wait(async () => {
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json();
      return targets.find((value) => value.type === "page");
    } catch {
      return null;
    }
  });
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = (event) => {
    const value = JSON.parse(event.data);
    const task = pending.get(value.id);
    if (!task) return;
    pending.delete(value.id);
    value.error
      ? task.reject(Error(value.error.message))
      : task.resolve(value.result);
  };
  await wait(() => evaluate("!!document.querySelector('.tiptap')"));
  await evaluate("window.desktop.locale.setPreference('en-US')");
  await wait(() =>
    evaluate(
      "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Conversation')",
    ),
  );
  await evaluate("window.__qaEditor=document.querySelector('.tiptap');true");
  // Electron's page endpoint lacks Browser window management; emulate only
  // renderer viewport geometry, leaving the OS window untouched.
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1180,
    height: 812,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (!process.argv.includes("--anchors")) {
    await click("Read-only files and current changes");
    await wait(() =>
      evaluate(
        "!![...document.querySelectorAll('.file-list button')].find(b=>b.textContent==='README.md')",
      ),
    );
    await click("README.md");
    await wait(() =>
      evaluate("!!document.querySelector('.monaco-readonly .monaco-editor')"),
    );
    const normal = await measure("files-light-normal");
    await click("Focus reading");
    const focused = await measure("files-light-normal-focused");
    assert.ok(focused.readingHeight > normal.readingHeight + 150);
  } else {
    await click("Focus reading");
  }
  await evaluate(
    "document.querySelector('button[aria-label=\"Switch to dark theme\"]').click()",
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 960,
    height: 640,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await measure(
    process.argv.includes("--anchors")
      ? "conversation-dark-minimum"
      : "files-dark-compact-minimum",
  );
  await click("Native history");
  await wait(() => evaluate("!!document.querySelector('.history article')"));
  assert.equal(
    await evaluate(
      "document.querySelector('.history').textContent.includes('synthetic text, not model output')",
    ),
    true,
  );
  await measure("history-dark-compact-minimum");
  await click("Restore controls");
  await measure("history-dark-compact-restored");
  const anchorMeasurements = [];
  const anchor = () =>
    evaluate(`(() => {
    const pane=document.querySelector('.reading-pane:not([hidden])');
    const row=pane.querySelector('[data-reading-row="anchor-10"]');
    if(!row)throw Error('Missing content anchor');
    const top=row.getBoundingClientRect().top-pane.getBoundingClientRect().top-pane.clientTop+pane.scrollTop;
    return {rowId:row.dataset.readingRow,offset:pane.scrollTop-top,scrollTop:pane.scrollTop,source:pane.querySelector('[data-reading-source]').dataset.readingSource};
  })()`);
  await evaluate(`(() => {
    const pane=document.querySelector('.reading-pane:not([hidden])');
    const row=pane.querySelector('[data-reading-row="anchor-10"]');
    pane.scrollTop=row.getBoundingClientRect().top-pane.getBoundingClientRect().top-pane.clientTop+pane.scrollTop+40;
    return true;
  })()`);
  await evaluate("new Promise(resolve=>setTimeout(resolve,80))");
  anchorMeasurements.push({ name: "before", ...(await anchor()) });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1180,
    height: 812,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate("new Promise(resolve=>setTimeout(resolve,100))");
  anchorMeasurements.push({ name: "width-change", ...(await anchor()) });
  await click("Focus reading");
  await evaluate("new Promise(resolve=>setTimeout(resolve,100))");
  anchorMeasurements.push({ name: "composer-hidden", ...(await anchor()) });
  await click("Conversation");
  await click("Native history");
  await evaluate("new Promise(resolve=>setTimeout(resolve,100))");
  anchorMeasurements.push({ name: "view-return", ...(await anchor()) });
  await evaluate(
    `document.querySelector('.thread-navigation button[title$="${otherThreadId}"]').click()`,
  );
  await wait(() =>
    evaluate(
      `document.querySelector('.thread-navigation button[aria-current=page]')?.title.endsWith('${otherThreadId}')`,
    ),
  );
  await click("Native history");
  await wait(() => evaluate("!!document.querySelector('.history article')"));
  await evaluate("new Promise(resolve=>setTimeout(resolve,100))");
  const other = await anchor();
  assert.notEqual(other.source, anchorMeasurements[0].source);
  assert.ok(other.scrollTop <= 1);
  await evaluate(
    `document.querySelector('.thread-navigation button[title$="${threadId}"]').click()`,
  );
  await wait(() =>
    evaluate(
      `document.querySelector('.thread-navigation button[aria-current=page]')?.title.endsWith('${threadId}')`,
    ),
  );
  await click("Native history");
  await wait(() => evaluate("!!document.querySelector('.history article')"));
  await evaluate("new Promise(resolve=>setTimeout(resolve,100))");
  anchorMeasurements.push({ name: "thread-return", ...(await anchor()) });
  for (const value of anchorMeasurements) {
    assert.equal(value.rowId, "anchor-10");
    assert.ok(Math.abs(value.offset - 40) <= 2, JSON.stringify(value));
    assert.equal(value.source, anchorMeasurements[0].source);
  }
  const clipboard = process.argv.includes("--clipboard")
    ? await validateTrustedClipboard({
        call,
        evaluate,
        wait,
        isolated,
        threadId,
        otherThreadId: clipboardThreadId,
        frozenReferences,
        targetDirectory,
      })
    : undefined;
  const finalDb = new DatabaseSync(join(isolated.data, "drafts.sqlite"), {
    readOnly: true,
  });
  assert.equal(
    finalDb.prepare("SELECT count(*) AS count FROM submission").get().count,
    0,
  );
  assert.equal(
    finalDb.prepare("SELECT count(*) AS count FROM native_session").get().count,
    0,
  );
  finalDb.close();
  const result = {
    platform: process.platform,
    mode: "built source Electron with emulated viewports; synthetic read-only project and v3 history",
    submissions: 0,
    nativeBindings: 0,
    modelGenerationRequests: 0,
    measurements,
    anchorMeasurements,
    ...(clipboard ? { clipboard } : {}),
  };
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  socket?.close();
  child.kill();
  if (child.exitCode === null)
    await new Promise((resolve) => child.once("exit", resolve));
  isolated.cleanup();
}
