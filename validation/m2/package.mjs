import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";
import {
  prepareAgedAttachment,
  validateAttachmentLifecycle,
} from "./attachment-lifecycle.mjs";
import {
  createSubagentSupplier,
  validateSubagentLifecycle,
} from "./subagent-lifecycle.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-m2-package-" });
const source = resolve(
  process.argv[2] ?? "dist/m2-entry-candidate/mac-arm64/d-pi.app",
);
const bundle = join(isolated.root, "Package With Spaces", "d-pi.app");
cpSync(source, bundle, { recursive: true, verbatimSymlinks: true });
const plist = join(bundle, "Contents/Info.plist");
assert.equal(
  spawnSync(
    "/usr/bin/plutil",
    [
      "-replace",
      "CFBundleIdentifier",
      "-string",
      "local.d-pi.m2-validation",
      plist,
    ],
    { env: isolated.env },
  ).status,
  0,
);
const a = randomUUID(),
  workspace = randomUUID();
const db = new DatabaseSync(join(isolated.data, "drafts.sqlite"));
db.exec(
  "CREATE TABLE workspace(id TEXT PRIMARY KEY,directory TEXT NOT NULL UNIQUE,execution_trust TEXT NOT NULL);CREATE TABLE thread(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL);CREATE TABLE desktop(id INTEGER PRIMARY KEY,active_thread TEXT,theme TEXT NOT NULL,density TEXT NOT NULL);PRAGMA user_version=1;",
);
db.prepare("INSERT INTO workspace VALUES(?,?,'browse')").run(
  workspace,
  isolated.cwd,
);
db.prepare("INSERT INTO thread VALUES(?,?,0,'')").run(a, workspace);
db.prepare("INSERT INTO desktop VALUES(1,?,'dark','normal')").run(a);
writeFileSync(join(isolated.cwd, "fixture.txt"), "M2 isolated project\n");
const secondProject = join(isolated.root, "Second Project");
mkdirSync(secondProject);
writeFileSync(join(secondProject, "second.txt"), "Second isolated project\n");
const requests = [];
const subagentSupplier = createSubagentSupplier();
let held = null;
const sockets = new Set();
const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  assert.equal(req.method, "POST");
  const request = JSON.parse(body);
  if (
    process.argv.includes("--lifecycle") &&
    subagentSupplier.handle(request, res)
  )
    return;
  requests.push(request);
  const frame = (delta, finish) => ({
    id: "fixture",
    object: "chat.completion.chunk",
    created: 1,
    model: requests.at(-1).model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.write(
    `data: ${JSON.stringify(frame({ role: "assistant", content: requests.length === 1 ? "M2_THREAD_A_REPLY" : "M2_THREAD_B_REPLY" }, null))}\n\n`,
  );
  const finish = () => {
    res.write(`data: ${JSON.stringify(frame({}, "stop"))}\n\n`);
    res.end("data: [DONE]\n\n");
  };
  if (requests.length === 1) held = finish;
  else setTimeout(finish, 100);
});
server.on("connection", (s) => {
  sockets.add(s);
  s.on("close", () => sockets.delete(s));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
writeFileSync(
  join(isolated.config, "models.yml"),
  JSON.stringify({
    providers: {
      fixture: {
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        apiKey: "fixture",
        api: "openai-completions",
        models: ["fixture-a", "fixture-b"].map((id) => ({
          id,
          name: id,
          reasoning: id === "fixture-b",
          input:
            process.argv.includes("--attachments") && id === "fixture-b"
              ? ["text", "image"]
              : ["text"],
          contextWindow: 128000,
          maxTokens: 1024,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        })),
      },
    },
  }),
);
writeFileSync(
  join(isolated.config, "config.yml"),
  JSON.stringify({
    autolearn: { enabled: false },
    modelRoles: {
      default: "fixture/fixture-a",
      smol: "fixture/fixture-a",
      ...(process.argv.includes("--lifecycle")
        ? { task: "fixture/fixture-a" }
        : {}),
    },
    ...(process.argv.includes("--lifecycle")
      ? { task: { batch: true }, async: { enabled: false } }
      : {}),
  }),
);
mkdirSync(join(isolated.config, "extensions"));
writeFileSync(
  join(isolated.config, "extensions", "finalized.ts"),
  `export default function(pi){pi.on('assistant_message',event=>({content:event.message.content.map(part=>part.type==='text'?{...part,text:part.text+'_FINALIZED\\n\\n'+Array.from({length:80},(_,i)=>'Reading fixture line '+i).join('\\n\\n')}:part)}));}`,
);
const ports = createServer();
await new Promise((r) => ports.listen(0, "127.0.0.1", r));
const port = ports.address().port;
await new Promise((r) => ports.close(r));
const binary = join(bundle, "Contents/MacOS/d-pi");
function launch() {
  const app = spawn(
    binary,
    ["--lang=zh-CN", `--remote-debugging-port=${port}`],
    { env: isolated.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  app.stdout.resume();
  app.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return app;
}
let child = launch(),
  socket;
let seq = 0;
const pending = new Map();
async function wait(fn, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("M2 package timeout");
}
async function connect() {
  const target = await wait(async () => {
    try {
      return (
        await (
          await fetch(`http://127.0.0.1:${port}/json/list`, {
            signal: AbortSignal.timeout(1000),
          })
        ).json()
      ).find((t) => t.type === "page");
    } catch {
      return null;
    }
  });
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    socket.onopen = r;
    socket.onerror = j;
  });
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const task = pending.get(m.id);
      pending.delete(m.id);
      m.error ? task?.reject(Error(m.error.message)) : task?.resolve(m.result);
    }
  };
  socket.onclose = () => {
    for (const task of pending.values()) task.reject(Error("CDP closed"));
    pending.clear();
  };
}
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const reply = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (reply.exceptionDetails)
    throw Error(JSON.stringify(reply.exceptionDetails));
  return reply.result.value;
}
async function click(text) {
  await wait(() =>
    evaluate(
      `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`,
    ),
  );
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`,
  );
}
async function selectThread(id) {
  if (process.argv.includes("--continuity"))
    await evaluate(`(()=>{
    const shell=document.querySelector('.app-shell');
    const sidebar=document.querySelector('.sidebar');
    const toolbar=document.querySelector('.toolbar');
    const samples=[];
    const sample=(phase="mutation")=>{
      samples.push({phase,shell:document.querySelector('.app-shell')===shell && shell.getBoundingClientRect().height>0,sidebar:document.querySelector('.sidebar')===sidebar,toolbar:document.querySelector('.toolbar')===toolbar,workspace:(document.querySelector('.thread-workspace')?.getBoundingClientRect().height??0)>0,editor:(document.querySelector('.tiptap')?.getBoundingClientRect().height??0)>0});
    };
    let running=true;
    const frame=()=>{if(running){sample("frame");requestAnimationFrame(frame);}};
    requestAnimationFrame(frame);
    const observer=new MutationObserver(()=>sample("mutation"));
    observer.observe(document.getElementById('root'),{subtree:true,childList:true,attributes:true,attributeFilter:['style']});
    window.__continuityStop=()=>{running=false;observer.disconnect();return samples;};
    return true;
  })()`);
  await wait(() =>
    evaluate(
      `!!document.querySelector('.thread-navigation button[title$="${id}"]')`,
    ),
  );
  await evaluate(
    `document.querySelector('.thread-navigation button[title$="${id}"]').click()`,
  );
  await wait(
    () =>
      db.prepare("SELECT active_thread FROM desktop").get().active_thread ===
      id,
  );
  await wait(() =>
    evaluate(
      `document.querySelector('.thread-navigation button[aria-current=page]')?.title.endsWith('${id}')`,
    ),
  );
  if (process.argv.includes("--continuity")) {
    await evaluate(
      "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
    );
    const samples = await evaluate("window.__continuityStop()");
    continuitySamples.push({ threadId: id, samples });
    assert.ok(samples.length > 0);
    assert.ok(
      samples.every(
        (s) => s.shell && s.sidebar && s.toolbar && s.workspace && s.editor,
      ),
      "Thread switch removed or hid the shell/workspace: " +
        JSON.stringify(samples),
    );
  }
}
async function insert(text) {
  await evaluate("document.querySelector('[contenteditable=true]').focus()");
  await call("Input.insertText", { text });
  await wait(() =>
    evaluate(
      `document.querySelector('[contenteditable=true]')?.editor.getText({blockSeparator:"\\n"}).includes(${JSON.stringify(text)})`,
    ),
  );
}
async function editorSelection(from, to = from) {
  await evaluate(`(()=>{
    const editor=document.querySelector('[contenteditable=true]');editor.focus();
    const node=editor.querySelector('p').firstChild, range=document.createRange();
    range.setStart(node,${from});range.setEnd(node,${to});
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  })()`);
  await evaluate(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
  );
}
async function historyKey(redo = false) {
  await evaluate("document.querySelector('[contenteditable=true]').focus()");
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "z",
    code: "KeyZ",
    modifiers: redo ? 12 : 4,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "z",
    code: "KeyZ",
    modifiers: redo ? 12 : 4,
  });
}
async function shot(name) {
  await evaluate(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
  );
  const result = await call("Page.captureScreenshot", { format: "png" });
  const path = join(isolated.root, name + ".png");
  writeFileSync(path, Buffer.from(result.data, "base64"));
  return path;
}
const routerValidation = process.argv.includes("--router");
const checks = [];
const imageFixture =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
async function dropAttachment(name, mimeType, data) {
  const sourceFile = join(isolated.cwd, name);
  writeFileSync(sourceFile, Buffer.from(data, "base64"));
  const point = await evaluate(
    `(()=>{const r=document.querySelector("[contenteditable=true]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  const dragData = { items: [], files: [sourceFile], dragOperationsMask: 1 };
  for (const type of ["dragEnter", "dragOver", "drop"]) {
    await call("Input.dispatchDragEvent", { type, ...point, data: dragData });
  }
  await wait(() =>
    evaluate(
      `!![...document.querySelectorAll('.composer button')].find(b=>b.textContent===${JSON.stringify("移除 " + name)})`,
    ),
  );
}

const screenshots = [];
const continuitySamples = [];
let agedAttachmentPath;
try {
  await connect();
  await wait(() =>
    evaluate("!!document.querySelector('[contenteditable=true]')"),
  );
  await evaluate("document.querySelector('.configuration-settings').open=true");
  await wait(() =>
    evaluate(
      "document.querySelector('.configuration-settings').textContent.includes('OpenAI') && !document.querySelector('.configuration-settings').textContent.includes('正在读取')",
    ),
  );
  await wait(() =>
    evaluate(
      "document.querySelector('.model-controls select')?.options.length===3",
    ),
  );
  await evaluate("document.querySelector('.model-controls').open=true");
  await evaluate(
    `(()=>{const s=document.querySelector('.model-controls select');s.value=${JSON.stringify(JSON.stringify(["fixture", "fixture-b"]))};s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await evaluate(
    "(()=>{const s=document.querySelectorAll('.model-controls select')[1];s.value='high';s.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await click("应用到当前会话");
  await wait(() =>
    evaluate(
      "document.querySelector('.model-controls').textContent.includes('fixture/fixture-b') && document.querySelector('.model-controls').textContent.includes('high')",
    ),
  );
  await evaluate(
    "document.querySelector('.configuration-settings').open=false",
  );
  await click("允许执行并启动");
  await wait(() =>
    evaluate(
      "document.querySelector('.runtime-panel')?.textContent.includes('OMP 已就绪')",
    ),
  );
  checks.push(
    "explicit project grant automatically starts OMP without a separate startup click",
  );
  await wait(() =>
    evaluate(
      "document.querySelector('.model-controls').textContent.includes('fixture/fixture-b')",
    ),
  );
  await insert("M2_FIRST_INPUT");
  if (process.argv.includes("--continuity")) {
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      modifiers: 8,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      modifiers: 8,
    });
    await insert("LINE_TWO");
    assert.equal(
      await evaluate(
        "document.querySelector('.tiptap').editor.getText({blockSeparator:'\\n'})",
      ),
      "M2_FIRST_INPUT\nLINE_TWO",
    );
    assert.equal(requests.length, 0);
  }
  if (process.argv.includes("--attachments")) {
    await dropAttachment(
      "large-source.txt",
      "text/plain",
      Buffer.from("PRIVATE_LARGE_SOURCE\n".repeat(250000)).toString("base64"),
    );
    await click("发送");
    await wait(() =>
      evaluate(
        "document.querySelector('.composer').textContent.includes('编码后输入超出原生传输限制')",
      ),
    );
    assert.equal(requests.length, 0);
    assert.ok(
      db
        .prepare("SELECT body FROM thread WHERE id=?")
        .get(a)
        .body.includes("[[dpi-attachment:"),
    );
    screenshots.push(await shot("m2-large-source-refused"));
    await click("移除 large-source.txt");
    checks.push(
      "valid large drag/paste bytes cross real preload/Main without Base64 stack overflow, stay private and in draft; actual encoded limit refuses sending without provider calls, and explicit removal permits continuing",
    );
    if (process.argv.includes("--lifecycle")) {
      await validateAttachmentLifecycle({
        db,
        data: isolated.data,
        threadId: a,
        evaluate,
        wait,
        click,
        dropAttachment,
        shot,
        screenshots,
        checks,
      });
    }
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    const stream = "BT /F1 12 Tf 30 200 Td (M2_PDF_ORIGINAL_TEXT) Tj ET\n";
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    let pdf = "%PDF-1.4\n",
      offsets = [0];
    for (const [i, object] of objects.entries()) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n ")
      .join(
        "\n",
      )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    await dropAttachment(
      "isolated.pdf",
      "application/pdf",
      Buffer.from(pdf).toString("base64"),
    );
    await wait(() =>
      evaluate(
        "document.querySelector('.composer').textContent.includes('仅使用抽取文字')",
      ),
    );
    await click("预览 isolated.pdf");
    await wait(() =>
      evaluate(
        "document.querySelector('dialog')?.textContent.includes('M2_PDF_ORIGINAL_TEXT')",
      ),
    );
    const previewBox = await evaluate(
      "(()=>{const r=document.querySelector('dialog').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight}})()",
    );
    assert.ok(
      Math.abs(
        previewBox.x + previewBox.width / 2 - previewBox.viewportWidth / 2,
      ) < 2,
    );
    assert.ok(
      Math.abs(
        previewBox.y + previewBox.height / 2 - previewBox.viewportHeight / 2,
      ) < 2,
    );
    assert.ok(
      previewBox.x >= 0 &&
        previewBox.y >= 0 &&
        previewBox.x + previewBox.width <= previewBox.viewportWidth &&
        previewBox.y + previewBox.height <= previewBox.viewportHeight,
    );
    screenshots.push(await shot("m2-pdf-coverage"));
    await click("关闭预览");
    await click("仅使用抽取文字");
    await wait(() =>
      evaluate(
        "document.querySelector('.composer').textContent.includes('仅文字 PDF')",
      ),
    );
    await click("移除 isolated.pdf");
    checks.push(
      "real packaged SDK converts PDF text, exposes unverified page coverage and requires explicit text-only choice; original PDF stays private after removing its draft reference",
    );
    await dropAttachment("isolated-image.png", "image/png", imageFixture);
    await click("预览 isolated-image.png");
    await wait(() =>
      evaluate("document.querySelector('dialog img')?.naturalWidth>0"),
    );
    screenshots.push(await shot("m2-attachment-preview"));
    await click("关闭预览");
    await evaluate(
      `window.desktop.runtime.request({kind:'select-model',threadId:${JSON.stringify(a)},traceId:crypto.randomUUID(),selection:{provider:'fixture',modelId:'fixture-a',thinking:{kind:'default'}}})`,
    );
    await click("发送");
    await wait(() =>
      evaluate("document.body.textContent.includes('不能完整保留图像输入')"),
    );
    assert.equal(requests.length, 0);
    assert.ok(
      db
        .prepare("SELECT body FROM thread WHERE id=?")
        .get(a)
        .body.includes("[[dpi-attachment:"),
    );
    await evaluate(
      `window.desktop.runtime.request({kind:'select-model',threadId:${JSON.stringify(a)},traceId:crypto.randomUUID(),selection:{provider:'fixture',modelId:'fixture-b',thinking:{kind:'effort',effort:'high'}}})`,
    );
    await wait(() =>
      evaluate(
        "document.querySelector('.model-controls').textContent.includes('fixture/fixture-b') && document.querySelector('.model-controls').textContent.includes('high')",
      ),
    );
    await evaluate("document.querySelector('[contenteditable=true]').focus()");
    for (const type of ["keyDown", "keyUp"])
      await call("Input.dispatchKeyEvent", {
        type,
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        modifiers: 8,
      });
    await insert("@fixture");
    assert.equal(
      await evaluate(
        "(()=>{const s=document.querySelector('.tiptap').editor.state.selection;return s.$from.parent.textBetween(0,s.$from.parentOffset)})()",
      ),
      "@fixture",
    );
    await wait(() =>
      evaluate("!!document.querySelector('.composer [role=option]')"),
    );
    await evaluate(
      "[...document.querySelectorAll('.composer [role=option]')].find(b=>b.textContent==='fixture.txt').click()",
    );
    await wait(() =>
      evaluate(
        "document.querySelector('.composer').textContent.includes('发送时读取')",
      ),
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.tiptap').editor.state.selection.$from.parent.textContent",
      ),
      "",
    );
    screenshots.push(await shot("m2-attachment-prepared"));
    checks.push(
      "packaged image preview decodes private original; text-only model refuses complete image input without a provider request or draft loss; @ project reference is inserted through real Composer search",
    );
  }
  await click("发送");
  await wait(() => requests.length === 1);
  if (process.argv.includes("--attachments")) {
    const blocks = requests[0].messages.flatMap((message) =>
      Array.isArray(message.content) ? message.content : [],
    );
    assert.ok(blocks.some((part) => part.type === "image_url"));
    assert.ok(
      blocks.some(
        (part) =>
          part.type === "text" && part.text.includes("M2 isolated project"),
      ),
    );
    const receipt = JSON.parse(
      db
        .prepare("SELECT receipt FROM submission ORDER BY rowid DESC LIMIT 1")
        .get().receipt,
    );
    assert.equal(receipt.content.images.length, 1);
    assert.ok(receipt.content.message.includes("M2 isolated project"));
    await dropAttachment("queue-image.png", "image/png", imageFixture);
    await insert("QUEUE_IMAGE_ORIGINAL");
    await click("排队发送");
    await wait(() =>
      evaluate("!!document.querySelector('[data-queue-entry]')"),
    );
    await evaluate(
      "document.querySelector('.runtime-panel details:has([data-queue-entry])').open=true",
    );
    await evaluate(
      "document.querySelector('[data-queue-action=begin-edit]').click()",
    );
    await wait(() =>
      evaluate(
        "document.querySelector('textarea[id^=queue-edit-]')?.value.includes('QUEUE_IMAGE_ORIGINAL')",
      ),
    );
    await evaluate(
      "document.querySelector('textarea[id^=queue-edit-]').select()",
    );
    await call("Input.insertText", { text: "QUEUE_IMAGE_CHANGED" });
    await wait(() =>
      evaluate(
        "!document.querySelector('[data-queue-action=save-edit]').disabled",
      ),
    );
    assert.equal(
      await evaluate(
        "document.querySelector('[data-queue-entry] input[type=checkbox]').checked",
      ),
      true,
    );
    await evaluate(
      "document.querySelector('[data-queue-entry] input[type=checkbox]').scrollIntoView({block:'center'})",
    );
    screenshots.push(await shot("m2-attachment-queue-edit"));
    await evaluate(
      "document.querySelector('[data-queue-action=save-edit]').click()",
    );
    await wait(() =>
      evaluate(
        "!document.querySelector('textarea[id^=queue-edit-]') && document.querySelector('[data-queue-entry]').textContent.includes('QUEUE_IMAGE_CHANGED')",
      ),
    );
    const journal = JSON.parse(
      db
        .prepare("SELECT record FROM queue_change ORDER BY rowid DESC LIMIT 1")
        .get().record,
    );
    assert.equal(journal.previousImages.length, 1);
    assert.equal(journal.command.retainedImageIds.length, 1);
    await wait(() =>
      evaluate(
        "document.querySelector('[data-queue-action=delete]')?.disabled === false",
      ),
    );
    await evaluate(
      "document.querySelector('[data-queue-action=delete]').click()",
    );
    await wait(() => evaluate("!document.querySelector('[data-queue-entry]')"));
    assert.equal(requests.length, 1);
    checks.push(
      "packaged private image and @ frozen text actually reach provider; native queued image survives text edit/save with original frozen receipt and typed change journal; delete adds no provider calls",
    );
    if (process.argv.includes("--lifecycle")) {
      const result = await evaluate(
        `window.desktop.attachments.request({kind:'clean-storage',threadId:${JSON.stringify(a)},traceId:crypto.randomUUID()})`,
      );
      assert.equal(result.kind, "storage-report");
      const hash = createHash("sha256")
        .update(Buffer.from(imageFixture, "base64"))
        .digest("hex");
      assert.ok(existsSync(join(isolated.data, "content", "objects", hash)));
      assert.ok(
        db
          .prepare(
            "SELECT reference_count FROM input_content_object WHERE digest=?",
          )
          .get(hash).reference_count > 0,
      );
      assert.equal(requests.length, 1);
      checks.push(
        "packaged cleanup retains private image originals referenced by frozen submission receipts and queue edit history after draft consumption and queue deletion",
      );
    }
  }
  assert.equal(requests[0].model, "fixture-b");
  if (process.argv.includes("--queue-subagent")) {
    const queueChangesBefore = db
      .prepare("SELECT COUNT(*) AS count FROM queue_change")
      .get().count;
    await wait(() =>
      evaluate(
        "document.querySelector('[name=subagent-agent]')?.options.length>0",
      ),
    );
    await evaluate(
      "document.querySelector('details[aria-label=\"子 Agent 设置\"]').open=true",
    );
    await evaluate(
      `(()=>{const s=document.querySelector('[name=subagent-model]');s.value=${JSON.stringify(JSON.stringify(["fixture", "fixture-b"]))};s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await evaluate(
      "(()=>{const s=document.querySelector('[name=subagent-thinking]');s.value='high';s.dispatchEvent(new Event('change',{bubbles:true}));})()",
    );
    await click("应用覆盖");
    await wait(() =>
      evaluate(
        "document.querySelector('details[aria-label=\"子 Agent 设置\"]').textContent.includes('子 Agent 设置已更新。')",
      ),
    );
    assert.ok(
      await evaluate(
        "document.querySelector('details[aria-label=\"子 Agent 设置\"]').textContent.includes('fixture/fixture-b · high')",
      ),
    );
    assert.equal(requests.length, 1);
    assert.ok(held);
    await click("清除覆盖");
    await wait(() =>
      evaluate(
        "document.querySelector('details[aria-label=\"子 Agent 设置\"]').textContent.includes('本实例覆盖: 沿用共享默认')",
      ),
    );
    await evaluate(
      "document.querySelector('details[aria-label=\"子 Agent 设置\"]').open=false",
    );
    const queuedOriginal = "a".repeat(250000);
    await insert(queuedOriginal);
    await click("排队发送");
    await wait(() =>
      evaluate(
        "document.querySelector('[data-queue-entry]')?.textContent.includes('aaaa')",
      ),
    );
    await evaluate(
      "document.querySelector('details[aria-label=\"待处理队列\"]').open=true",
    );
    await evaluate(
      "document.querySelector('[data-queue-action=begin-edit]').click()",
    );
    await wait(() =>
      evaluate("!!document.querySelector('textarea[id^=queue-edit-]')"),
    );
    assert.equal(
      await evaluate(
        "document.querySelector('textarea[id^=queue-edit-]').value.length",
      ),
      queuedOriginal.length,
    );
    await evaluate(
      "document.querySelector('textarea[id^=queue-edit-]').select()",
    );
    await call("Input.insertText", { text: "中".repeat(90000) });
    await wait(() =>
      evaluate(
        "document.querySelector('[data-queue-action=save-edit]').disabled && document.querySelector('[role=alert]')?.textContent.includes('256 KiB')",
      ),
    );
    assert.equal(
      await evaluate(
        "document.querySelector('textarea[id^=queue-edit-]').value.length",
      ),
      90000,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM queue_change").get().count,
      queueChangesBefore,
    );
    await evaluate(
      "document.querySelector('[role=alert]').scrollIntoView({block:'center'})",
    );
    screenshots.push(await shot("m2-queue-oversized"));
    await evaluate(
      "document.querySelector('textarea[id^=queue-edit-]').select()",
    );
    await call("Input.insertText", { text: "QUEUED_CHANGED" });
    await wait(() =>
      evaluate(
        "document.querySelector('textarea[id^=queue-edit-]')?.value==='QUEUED_CHANGED' && !document.querySelector('[data-queue-action=cancel-edit]').disabled",
      ),
    );
    await evaluate(
      "document.querySelector('textarea[id^=queue-edit-]').scrollIntoView({block:'center'})",
    );
    screenshots.push(await shot("m2-queue-edit"));
    await evaluate(
      "document.querySelector('[data-queue-action=save-edit]').click()",
    );
    await wait(() =>
      evaluate(
        "!document.querySelector('textarea[id^=queue-edit-]') && document.querySelector('[data-queue-entry]')?.textContent.includes('QUEUED_CHANGED')",
      ),
    );
    const journal = db
      .prepare("SELECT record FROM queue_change ORDER BY rowid DESC LIMIT 1")
      .get();
    // Shortening the acknowledged draft frees enough snapshot budget to show
    // the original again. The journal records the projection at save time.
    assert.equal(JSON.parse(journal.record).previousText, queuedOriginal);
    assert.equal(JSON.parse(journal.record).previousTruncated, false);
    assert.equal(JSON.parse(journal.record).command.text, "QUEUED_CHANGED");
    assert.equal(JSON.parse(journal.record).status, "acknowledged");
    const frozen = db
      .prepare("SELECT receipt FROM submission ORDER BY rowid DESC LIMIT 1")
      .get();
    assert.equal(JSON.parse(frozen.receipt).text, queuedOriginal);
    await wait(() =>
      evaluate(
        "document.querySelector('[data-queue-action=delete]')?.disabled === false",
      ),
    );
    await evaluate(
      "document.querySelector('[data-queue-action=delete]').click()",
    );
    await wait(() => evaluate("!document.querySelector('[data-queue-entry]')"));
    assert.equal(requests.length, 1);
    screenshots.push(await shot("m2-queue-subagent"));
    await evaluate(
      "document.querySelector('details[aria-label=\"待处理队列\"]').open=false",
    );
    checks.push(
      "packaged GUI applies and clears future subagent defaults during current execution; native queue edit/save/delete retains frozen journal and does not trigger another model request",
    );
    checks.push(
      "250000-character native draft remains editable after original projection truncation; oversized CJK input is retained with a visible unsaved warning and blocked save, then shortening saves with an honest journal",
    );
  }
  if (process.argv.includes("--continuity")) {
    assert.ok(
      JSON.stringify(requests[0]).includes("M2_FIRST_INPUT\\nLINE_TWO"),
    );
    checks.push(
      "trusted Electron Shift+Enter creates an editable newline without submitting; explicit send retains exact multiline input",
    );
  }
  await insert("A_UNSENT_DRAFT");
  await new Promise((resolve) => setTimeout(resolve, 600));
  await editorSelection(3);
  await insert("#");
  await editorSelection(2, 8);
  await click("新会话");
  const b = await wait(() => {
    const id = db
      .prepare("SELECT active_thread FROM desktop")
      .get().active_thread;
    return id !== a ? id : null;
  });
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent===''",
    ),
  );
  await wait(() =>
    evaluate(
      "document.querySelector('.model-controls').textContent.includes('fixture/fixture-a')",
    ),
  );
  checks.push(
    "new trusted Thread automatically starts its own native OMP session",
  );
  await insert("M2_SECOND_INPUT");
  await click("发送");
  await wait(() => requests.length === 2);
  assert.equal(requests[1].model, "fixture-a");
  await wait(() =>
    evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_THREAD_B_REPLY')",
    ),
  );
  await wait(() =>
    evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_THREAD_B_REPLY_FINALIZED')",
    ),
  );
  const readingPosition = await evaluate(`(()=>{
    const pane=document.querySelector('.reading-pane');
    pane.scrollTop=pane.scrollHeight-pane.clientHeight-20;
    return {top:pane.scrollTop,height:pane.scrollHeight,client:pane.clientHeight};
  })()`);
  assert.ok(readingPosition.height > readingPosition.client + 100);
  await insert("B_UNSENT_DRAFT");
  await evaluate(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
  );
  assert.equal(
    await evaluate("document.querySelector('.reading-pane').scrollTop"),
    readingPosition.top,
  );
  checks.push(
    "full message_end displays finalized native text; manual near-bottom reading position survives draft input",
  );
  assert.ok(
    !(await evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_THREAD_A_REPLY')",
    )),
  );
  if (routerValidation) {
    await evaluate(
      "window.__routerEditor=document.querySelector('[contenteditable=true]');window.__routerPanes=Array.from(document.querySelectorAll('.reading-pane'));true",
    );
    for (const [index, label] of [
      [1, "只读文件与当前差异"],
      [2, "提交原文"],
      [3, "原生历史"],
      [0, "会话"],
    ]) {
      await click(label);
      await wait(() =>
        evaluate(
          `Array.from(document.querySelectorAll('.reading-pane')).every((pane,i)=>pane.hidden===(i!==${index})) && document.querySelectorAll('.reading-navigation button')[${index}].getAttribute('aria-pressed')==='true'`,
        ),
      );
    }
    assert.equal(
      await evaluate(
        "window.__routerEditor===document.querySelector('[contenteditable=true]') && window.__routerPanes.every((pane,i)=>pane===document.querySelectorAll('.reading-pane')[i])",
      ),
      true,
    );
    assert.equal(
      await evaluate("document.querySelector('.reading-pane').scrollTop"),
      readingPosition.top,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('[contenteditable=true]').textContent",
      ),
      "B_UNSENT_DRAFT",
    );
    checks.push(
      "actual Router search navigation retains Composer and all reading-pane DOM, draft and manual scroll position",
    );
  }

  await selectThread(a);
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='A_U#NSENT_DRAFT'",
    ),
  );
  await evaluate("document.querySelector('[contenteditable=true]').focus()");
  assert.deepEqual(
    await evaluate(
      "({from:getSelection().anchorOffset,to:getSelection().focusOffset})",
    ),
    { from: 2, to: 8 },
  );
  await historyKey();
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='A_UNSENT_DRAFT'",
    ),
  );
  await historyKey(true);
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='A_U#NSENT_DRAFT'",
    ),
  );
  await historyKey();
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='A_UNSENT_DRAFT'",
    ),
  );
  checks.push(
    "native Electron editor restores middle selection and independent undo/redo across Thread switch",
  );
  if (routerValidation) {
    await click("后退");
    await wait(
      () =>
        db.prepare("SELECT active_thread FROM desktop").get().active_thread ===
        b,
    );
    await wait(() =>
      evaluate(
        "document.querySelector('[contenteditable=true]')?.textContent==='B_UNSENT_DRAFT'",
      ),
    );
    await click("前进");
    await wait(
      () =>
        db.prepare("SELECT active_thread FROM desktop").get().active_thread ===
        a,
    );
    await wait(() =>
      evaluate(
        "document.querySelector('[contenteditable=true]')?.textContent==='A_UNSENT_DRAFT'",
      ),
    );
    checks.push(
      "actual toolbar back/forward confirm Main selection and restore separate Thread drafts",
    );
  }

  await editorSelection(3);
  await evaluate(`(()=>{
    window.__fixtureIme={active:false,trusted:false};
    document.addEventListener('compositionstart',e=>{window.__fixtureIme.active=true;window.__fixtureIme.trusted=e.isTrusted;},{once:true});
    document.addEventListener('compositionend',()=>{window.__fixtureIme.active=false;},{once:true});
  })()`);
  await call("Input.imeSetComposition", {
    text: "中",
    selectionStart: 1,
    selectionEnd: 1,
  });
  await wait(() => evaluate("window.__fixtureIme.active"));
  await evaluate(
    `document.querySelector('.thread-navigation button[title$="${b}"]').click()`,
  );
  await evaluate(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
  );
  assert.equal(
    db.prepare("SELECT active_thread FROM desktop").get().active_thread,
    a,
  );
  assert.equal(await evaluate("window.__fixtureIme.trusted"), true);
  if (routerValidation) {
    await click("后退");
    await evaluate(
      "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
    );
    assert.equal(
      db.prepare("SELECT active_thread FROM desktop").get().active_thread,
      a,
    );
    checks.push(
      "trusted Chromium IME blocks actual toolbar POP and preserves Main selection",
    );
  }

  await call("Input.imeSetComposition", {
    text: "",
    selectionStart: 0,
    selectionEnd: 0,
  });
  await wait(() => evaluate("!window.__fixtureIme.active"));
  await selectThread(b);
  await selectThread(a);
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='A_UNSENT_DRAFT'",
    ),
  );
  checks.push(
    "trusted Chromium composition in native Electron blocks Thread switch until composition ends; system input source not exercised",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_THREAD_A_REPLY')",
    ),
  );
  assert.ok(
    !(await evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_THREAD_B_REPLY')",
    )),
  );
  const ps = spawnSync("/bin/ps", ["-ww", "-axo", "command="], {
    env: isolated.env,
    encoding: "utf8",
  }).stdout;
  assert.equal(
    ps
      .split("\n")
      .filter((line) =>
        line.includes(join(bundle, "Contents/Resources/sdk/host.mjs")),
      ).length,
    2,
  );
  assert.equal(db.prepare("SELECT count(*) n FROM native_session").get().n, 2);
  checks.push(
    "two parallel native OMP scopes; switching does not interrupt held work",
    "separate model/effort, messages, drafts and session identities",
  );
  held();
  await wait(() =>
    evaluate(
      "document.querySelector('.runtime-panel [role=status]')?.textContent==='OMP 已就绪'",
    ),
  );
  await selectThread(b);
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='B_UNSENT_DRAFT'",
    ),
  );
  if (process.argv.includes("--continuity")) {
    assert.equal(
      await evaluate("document.querySelector('.reading-pane').scrollTop"),
      readingPosition.top,
    );
    checks.push(
      "Thread switching preserves shell and workspace through every DOM mutation/frame; returning restores independent reading scroll",
    );
  }
  await call("Page.reload");
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='B_UNSENT_DRAFT'",
    ),
  );
  assert.equal(requests.length, 2);
  await selectThread(a);
  await wait(() =>
    evaluate(
      "document.querySelector('.model-controls')?.textContent.includes('fixture/fixture-b')",
    ),
  );
  checks.push(
    "renderer reload reconnects same native sessions without resending",
  );
  const inputLayout = await evaluate(`(()=>{
    const editor=document.querySelector('[contenteditable=true]');
    const send=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='发送');
    const e=editor.getBoundingClientRect(), b=send.getBoundingClientRect();
    return { editorTop:e.top, editorBottom:e.bottom, sendBottom:b.bottom, readingHeight:document.querySelector(".thread-reading").getBoundingClientRect().height, height:innerHeight };
  })()`);
  assert.ok(
    inputLayout.editorTop >= 0 &&
      inputLayout.editorBottom <= inputLayout.height &&
      inputLayout.sendBottom <= inputLayout.height &&
      inputLayout.readingHeight >= 100,
    JSON.stringify(inputLayout),
  );
  await click("只读文件与当前差异");
  assert.equal(
    await evaluate(
      "document.querySelector('[contenteditable=true]').textContent",
    ),
    "A_UNSENT_DRAFT",
  );
  await click("会话");
  checks.push(
    "composer and send action stay inside window; switching reading view preserves draft",
  );
  screenshots.push(await shot("m2-parallel-entry"));
  if (process.argv.includes("--lifecycle")) {
    await validateSubagentLifecycle({
      supplier: subagentSupplier,
      db,
      evaluate,
      wait,
      click,
      insert,
      selectThread,
      call,
      shot,
      checks,
      screenshots,
      threadA: a,
      threadB: b,
    });
  }
  if (process.argv.includes("--inspect")) {
    const checkpoint = join(isolated.root, "inspect-checkpoint.json"),
      resume = join(isolated.root, "inspect-continue");
    const expiresAt = new Date(Date.now() + 600000).toISOString();
    writeFileSync(
      checkpoint,
      JSON.stringify(
        {
          bundle,
          source,
          binary,
          root: isolated.root,
          project: isolated.cwd,
          secondProject,
          data: isolated.data,
          config: isolated.config,
          debugPort: port,
          threadA: a,
          threadB: b,
          resumeFile: resume,
          expiresAt,
          instructions:
            "Inspect only this isolated App. Test native Open Project with secondProject and cancel, system IME and cancel-login. Do not send real provider requests. Create resumeFile within 10 minutes.",
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ checkpoint, resumeFile: resume, expiresAt }));
    while (!existsSync(resume)) {
      if (Date.now() > Date.parse(expiresAt)) throw Error("Inspection timeout");
      await new Promise((r) => setTimeout(r, 250));
    }
    socket.onclose = null;
    socket.close();
    await connect();
    await selectThread(a);
    checks.push("native inspection checkpoint resumed");
  }
  if (process.argv.includes("--lifecycle")) {
    agedAttachmentPath = await prepareAgedAttachment({
      db,
      data: isolated.data,
      threadId: a,
      evaluate,
      wait,
      click,
      dropAttachment,
    });
  }
  child.kill("SIGKILL");
  await wait(() => child.signalCode !== null);
  socket.onclose = null;
  socket.close();
  child = launch();
  await connect();
  if (agedAttachmentPath) {
    await wait(() => !existsSync(agedAttachmentPath));
    checks.push(
      "automatic packaged attachment maintenance collects a seven-day released orphan without a cleanup command, including after cold restart",
    );
  }
  await wait(() =>
    evaluate(
      "document.querySelector('.runtime-panel')?.textContent.includes('当前只读历史')",
    ),
  );
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='发送').disabled",
    ),
    true,
  );
  assert.equal(requests.length, 2);
  await selectThread(b);
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent==='B_UNSENT_DRAFT'",
    ),
  );
  await click("新会话");
  await wait(
    () =>
      db.prepare("SELECT active_thread FROM desktop").get().active_thread !== b,
  );
  await wait(() =>
    evaluate(
      "document.querySelector('.runtime-panel')?.textContent.includes('OMP 已就绪')",
    ),
  );
  checks.push(
    "cold old native sessions remain read-only, preserve drafts; explicit new independent Thread is available",
  );
  screenshots.push(await shot("m2-cold-new-thread"));
  const logs = readFileSync(join(isolated.data, "logs/main.jsonl"), "utf8");
  assert.ok(!logs.includes("M2_FIRST_INPUT"));
  assert.ok(!logs.includes("fixture-original"));
  const build = JSON.parse(logs.trim().split("\n")[0]).build;
  assert.equal(build.dirty, process.argv.includes("--working-tree"));
  const result = {
    source,
    bundle,
    build,
    root: isolated.root,
    checks,
    screenshots,
    continuitySamples,
    providerCalls: requests.length,
    subagentProviderCalls: subagentSupplier.requests.length,
    subagentTitleProviderCalls: subagentSupplier.titleRequests.length,
    models: requests.map((r) => r.model),
    nativeSessions: db
      .prepare("SELECT session_id,thread_id FROM native_session")
      .all(),
    layout: inputLayout,
    sourceAsarSha256: createHash("sha256")
      .update(readFileSync(join(source, "Contents/Resources/app.asar")))
      .digest("hex"),
    limitations: [
      "localhost deterministic supplier, no real credentials/billing",
      "native inspection evidence recorded separately",
      "M2 V1-04 and queue/subagent/read-performance increments remain open",
    ],
  };
  writeFileSync(
    join(isolated.root, "m2-result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({ result: join(isolated.root, "m2-result.json"), checks }),
  );
  void call("Browser.close").catch(() => {});
  await wait(() => child.exitCode !== null);
} catch (error) {
  try {
    screenshots.push(await shot("m2-failure"));
    writeFileSync(
      join(isolated.root, "failure-dom.txt"),
      await evaluate("document.body.textContent"),
    );
  } catch {}
  writeFileSync(
    join(isolated.root, "supplier-requests.json"),
    JSON.stringify({
      execution: subagentSupplier.requests,
      titles: subagentSupplier.titleRequests,
    }),
  );
  console.error("Failure evidence: " + isolated.root);
  throw error;
} finally {
  socket?.close();
  if (child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
  server.close();
  for (const s of sockets) s.destroy();
  db.close();
}
