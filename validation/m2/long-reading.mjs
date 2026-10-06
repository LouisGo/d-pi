import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { captureClipboard } from "./clipboard.mjs";

const initialText =
  "M2_LONG_REPLY_START\n" +
  Array.from(
    { length: 240 },
    (_, index) =>
      `Reading ${index}: 中文🙂 ${"bounded original text ".repeat(6)}\n`,
  ).join("");
const appendedText =
  "\nM2_LONG_REPLY_APPENDED\n" +
  Array.from({ length: 160 }, (_, index) => `append ${index} 🙂 中文\n`).join(
    "",
  );
const toolBytes = 10 * 1024 * 1024;
const toolStart = "M2_TEN_MIB_TOOL_START";
const toolEnd = "M2_TEN_MIB_TOOL_END__";

export function prepareLongReadingExtension(config) {
  writeFileSync(
    join(config, "extensions", "long-reading.ts"),
    `export default function(pi) {
      pi.registerTool({name:'m2_long_output',label:'M2 long output',loadMode:'essential',description:'Isolated deterministic output fixture',parameters:pi.zod.object({}),
        async execute(){return {content:[{type:'text',text:${JSON.stringify(toolStart)}+ 'T'.repeat(${toolBytes - Buffer.byteLength(toolStart + toolEnd)})+${JSON.stringify(toolEnd)}}],details:{fixtureBytes:${toolBytes}}};}
      });
    }`,
  );
}

export function createLongReadingSupplier() {
  const requests = [];
  let append;
  function handle(request, response) {
    const user = request.messages
      .filter((message) => message.role === "user")
      .at(-1);
    const text =
      typeof user?.content === "string"
        ? user.content
        : (user?.content ?? [])
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n");
    const tool = text.includes("M2_LONG_TOOL_INPUT");
    if (!tool && !text.includes("M2_LONG_REPLY_INPUT")) return false;
    requests.push(request);
    const frame = (delta, finish = null) => ({
      id: "long-reading-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: request.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const write = (delta, finish) =>
      response.write(`data: ${JSON.stringify(frame(delta, finish))}\n\n`);
    const finish = (reason = "stop") => {
      write({}, reason);
      response.end("data: [DONE]\n\n");
    };
    if (tool) {
      if (request.messages.some((message) => message.role === "tool")) {
        write({ role: "assistant", content: "M2_LONG_TOOL_DONE" });
        finish();
      } else {
        write({
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "m2-long-output-call",
              type: "function",
              function: { name: "m2_long_output", arguments: "{}" },
            },
          ],
        });
        finish("tool_calls");
      }
    } else {
      write({ role: "assistant", content: initialText });
      append = () => {
        write({ content: appendedText });
        finish();
      };
    }
    return true;
  }
  return {
    handle,
    requests,
    append: () => {
      assert.ok(append);
      append();
    },
  };
}

export async function validateLongReading({
  supplier,
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
  threadA,
  threadB,
  env,
  temporary,
}) {
  const metrics = {};
  await click("新会话");
  const threadId = await wait(() => {
    const id = db
      .prepare("SELECT active_thread FROM desktop")
      .get().active_thread;
    return id !== threadA && id !== threadB ? id : null;
  });
  await wait(() =>
    evaluate(
      "document.querySelector('.runtime-panel')?.textContent.includes('OMP 已就绪')",
    ),
  );
  await insert("M2_LONG_REPLY_INPUT");
  await click("发送");
  await wait(() =>
    evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_LONG_REPLY_START')",
    ),
  );
  const first = await evaluate(`(()=>{
    const p=[...document.querySelectorAll('.conversation [data-reading-text]')].find(el=>el.textContent.includes('M2_LONG_REPLY_START'));
    if(!p) return null;
    window.__longReadingText=p;window.__longReadingNode=p.firstChild;
    p.scrollTop=12;window.__longReadingTop=p.scrollTop;
    const range=document.createRange();range.setStart(p.firstChild,0);range.setEnd(p.firstChild,18);
    getSelection().removeAllRanges();getSelection().addRange(range);
    window.__longReadingSelected=getSelection().toString();
    return {length:p.textContent.length,height:p.getBoundingClientRect().height,scrollTop:p.scrollTop,text:getSelection().toString(),nodes:p.querySelectorAll('*').length};
  })()`);
  assert.ok(
    first,
    "long reply must enter the explicit bounded original-text reader",
  );
  assert.ok(first.length <= 16384 && first.length < initialText.length);
  assert.ok(first.height > 0 && first.height <= 600);
  supplier.append();
  await wait(
    () =>
      evaluate(
        "document.querySelector('.runtime-panel')?.textContent.includes('OMP 已就绪') && window.__longReadingText.closest('article').querySelector('.message-heading > span')?.textContent === ''",
      ),
    30000,
    "long reading finalized message",
  );
  assert.deepEqual(
    await evaluate(`(()=>{
    const p=window.__longReadingText;
    return {connected:p.isConnected,sameNode:p.firstChild===window.__longReadingNode,selected:getSelection().toString(),top:p.scrollTop};
  })()`),
    {
      connected: true,
      sameNode: true,
      selected: first.text,
      top: first.scrollTop,
    },
  );
  checks.push(
    "packaged native streaming appends without replacing the selected old long-message segment or its DOM/scroll position",
  );

  const expectedText =
    initialText +
    appendedText +
    "_FINALIZED\n\n" +
    Array.from(
      { length: 80 },
      (_, index) => `Reading fixture line ${index}`,
    ).join("\n\n");
  const clipboard = captureClipboard({ env, temporary });
  let completeObtainedText;
  try {
    await call("Page.bringToFront");
    await evaluate(
      "window.__longCopyFailure=null;window.__longCopyRejection=e=>{window.__longCopyFailure={name:e.reason?.name,message:e.reason?.message};e.preventDefault()};window.addEventListener('unhandledrejection',window.__longCopyRejection);true",
    );
    await evaluate(
      `window.__longReadingText.closest('article').querySelector('.message-heading button').scrollIntoView({block:'nearest'})`,
    );
    const point = await evaluate(
      "(()=>{const r=window.__longReadingText.closest('article').querySelector('.message-heading button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
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
    const obtained = await wait(async () => {
      const failure = await evaluate("window.__longCopyFailure");
      if (failure) return { failure };
      const result = spawnSync("/usr/bin/pbpaste", [], {
        env,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0);
      return result.stdout === expectedText ? { text: result.stdout } : null;
    });
    assert.equal(obtained.failure, undefined, "native Copy action rejected");
    const copied = obtained.text;
    clipboard.markOwnedCopy(expectedText);
    assert.equal(copied, expectedText);
    metrics.copiedLength = copied.length;
    completeObtainedText = copied;
    metrics.copiedSha256 = createHash("sha256").update(copied).digest("hex");
    checks.push(
      "real packaged copy action writes complete obtained long native reply to macOS clipboard including undisplayed later segments and finalization",
    );
  } finally {
    metrics.clipboardRestoration = clipboard.restore().kind;
    await evaluate(
      "window.removeEventListener('unhandledrejection',window.__longCopyRejection);true",
    );
  }
  await evaluate(
    "window.__longReadingContainer=window.__longReadingText.closest('[data-long-reading]');[...window.__longReadingContainer.querySelectorAll('button')].find(el=>el.textContent.trim()==='下一段').focus();true",
  );
  for (const type of ["keyDown", "keyUp"])
    await call("Input.dispatchKeyEvent", {
      type,
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 36,
      ...(type === "keyDown" ? { text: "\r", unmodifiedText: "\r" } : {}),
    });
  await wait(() =>
    evaluate("window.__longReadingContainer.dataset.readingSegment==='1'"),
  );
  await evaluate(
    "[...window.__longReadingContainer.querySelectorAll('button')].find(el=>el.textContent.trim()==='上一段').focus();true",
  );
  for (const type of ["keyDown", "keyUp"])
    await call("Input.dispatchKeyEvent", {
      type,
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 36,
      ...(type === "keyDown" ? { text: "\r", unmodifiedText: "\r" } : {}),
    });
  await wait(() =>
    evaluate("window.__longReadingContainer.dataset.readingSegment==='0'"),
  );
  checks.push(
    "trusted Chromium keyboard Enter activates packaged previous/next segment controls",
  );
  const segments = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    const current = await evaluate(`(()=>{
      const article=[...document.querySelectorAll('.conversation article')].find(el=>el.textContent.includes('M2_LONG_REPLY_START') || el.querySelector('[data-long-reading]')===window.__longReadingContainer);
      const container=article?.querySelector('[data-long-reading]');
      if(!container) return null;
      window.__longReadingContainer=container;
      const texts=container.querySelectorAll('[data-reading-text]');
      const next=[...container.querySelectorAll('button')].find(el=>el.textContent.trim()==='下一段');
      return {text:texts[0]?.textContent,count:texts.length,index:Number(container.dataset.readingSegment),next:!!next&&!next.disabled};
    })()`);
    assert.ok(current);
    assert.equal(current.count, 1);
    assert.ok(current.text.length <= 8192);
    segments.push(current.text);
    if (!current.next) break;
    await evaluate(
      "[...window.__longReadingContainer.querySelectorAll('button')].find(el=>el.textContent.trim()==='下一段').click()",
    );
    await wait(() =>
      evaluate(
        `window.__longReadingContainer.dataset.readingSegment==='${current.index + 1}'`,
      ),
    );
    assert.ok(attempt < 99, "reader pagination failed to terminate");
  }
  assert.equal(segments.join(""), completeObtainedText);
  metrics.segments = segments.map((text) => text.length);
  for (let attempt = 0; attempt < segments.length - 1; attempt++) {
    await evaluate(
      "[...window.__longReadingContainer.querySelectorAll('button')].find(el=>el.textContent.trim()==='上一段').click()",
    );
    await wait(() =>
      evaluate(
        `window.__longReadingContainer.dataset.readingSegment==='${segments.length - 2 - attempt}'`,
      ),
    );
  }
  await evaluate(
    "window.__longReadingText=window.__longReadingContainer.querySelector('[data-reading-text]');window.__longReadingNode=window.__longReadingText.firstChild;true",
  );
  checks.push(
    "actual packaged segment navigation reconstructs the copied obtained original exactly, including Chinese and emoji, with only one 8192-unit text segment mounted at a time",
  );
  await click("专注阅读");
  await evaluate(
    "window.__longReadingText.closest('article').scrollIntoView({block:'start'})",
  );
  screenshots.push(await shot("m2-long-reading-dark-normal"));
  await evaluate(
    "document.querySelector('button[aria-label=\"切换为浅色主题\"]').click()",
  );
  await click("紧凑密度");
  await evaluate("new Promise(r=>setTimeout(r,250))");
  assert.equal(
    await evaluate(
      "window.__longReadingText.firstChild===window.__longReadingNode",
    ),
    true,
  );
  screenshots.push(await shot("m2-long-reading-light-compact"));
  await evaluate(
    "document.querySelector('button[aria-label=\"切换为深色主题\"]').click()",
  );
  await click("正常密度");
  await click("恢复控件");

  await selectThread(threadB);
  assert.ok(
    !(await evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_LONG_REPLY_START')",
    )),
  );
  await selectThread(threadId);
  await call("Page.reload");
  await wait(() =>
    evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_LONG_REPLY_START')",
    ),
  );
  assert.equal(supplier.requests.length, 1);
  checks.push(
    "packaged long reading isolates Thread messages and reconnects to retained native content without resending",
  );

  await click("原生历史");
  await wait(() =>
    evaluate(
      "document.querySelector('.history select') && !document.querySelector('.history select').disabled",
    ),
  );
  await evaluate(
    "[...document.querySelectorAll('.history button')].find(el=>el.textContent.trim()==='读取原生记录'&&!el.disabled)?.click()",
  );
  await wait(() =>
    evaluate(
      "document.querySelector('.history')?.textContent.includes('M2_LONG_REPLY_START')",
    ),
  );
  assert.ok(
    await evaluate(
      "[...document.querySelectorAll('.history [data-reading-text]')].some(el=>el.textContent.includes('M2_LONG_REPLY_START')&&el.textContent.length<=16384)",
    ),
  );
  checks.push(
    "real native persisted long reply is read as bounded original segments through the packaged history page",
  );
  await click("会话");
  await insert("M2_LONG_TOOL_INPUT");
  await click("发送");
  await wait(
    () =>
      evaluate(
        "document.querySelector('.conversation')?.textContent.includes('M2_LONG_TOOL_DONE')",
      ),
    60000,
  );
  const toolRequest = supplier.requests.find((request) =>
    request.messages.some((message) => message.role === "tool"),
  );
  assert.ok(toolRequest, "SDK did not run the fixture tool");
  const toolContent = toolRequest.messages.find(
    (message) => message.role === "tool",
  ).content;
  assert.equal(typeof toolContent, "string");
  const sessionFile = db
    .prepare("SELECT session_file FROM native_session WHERE thread_id=?")
    .get(threadId).session_file;
  const nativeTool = readFileSync(sessionFile, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line).message)
    .find((message) => message?.toolName === "m2_long_output");
  assert.ok(nativeTool);
  const truncation = nativeTool.details.meta.truncation;
  assert.equal(truncation.totalBytes, toolBytes);
  assert.equal(truncation.direction, "middle");
  assert.equal(nativeTool.details.fixtureBytes, toolBytes);
  assert.match(truncation.artifactId, /^\d+$/);
  const artifact = readFileSync(
    join(
      dirname(sessionFile),
      basename(sessionFile, ".jsonl"),
      `${truncation.artifactId}.m2_long_output.log`,
    ),
  );
  assert.equal(artifact.length, toolBytes);
  assert.ok(
    artifact
      .subarray(0, Buffer.byteLength(toolStart))
      .equals(Buffer.from(toolStart)),
  );
  assert.ok(
    artifact.subarray(-Buffer.byteLength(toolEnd)).equals(Buffer.from(toolEnd)),
  );
  const nativeText = nativeTool.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  assert.equal(toolContent, nativeText);
  assert.ok(toolContent.includes("elided. Read artifact://"));
  const toolReader = await evaluate(`(()=>{
    const article=[...document.querySelectorAll('.conversation article')].find(el=>el.querySelector('details')&&el.textContent.includes('M2_TEN_MIB_TOOL_START'));
    if(!article) return null;
    window.__longToolContainer=article.querySelector('[data-long-reading]');
    article.querySelector('details').open=true;
    const p=article.querySelector('[data-reading-text]');
    return p?{length:p.textContent.length,height:p.getBoundingClientRect().height,truncated:article.textContent.includes('显示已截断'),endShown:article.textContent.includes('M2_TEN_MIB_TOOL_END__')}:null;
  })()`);
  assert.ok(toolReader);
  assert.ok(toolReader.length <= 8192 && toolReader.height <= 600);
  assert.equal(toolReader.truncated, false);
  assert.equal(toolReader.endShown, false);
  const toolSegments = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    const segment = await evaluate(`(()=>{
      const container=window.__longToolContainer;
      const texts=container.querySelectorAll('[data-reading-text]');
      const next=[...container.querySelectorAll('button')].find(el=>el.textContent.trim()==='下一段');
      return {text:texts[0]?.textContent,count:texts.length,index:Number(container.dataset.readingSegment),next:!!next&&!next.disabled};
    })()`);
    assert.equal(segment.count, 1);
    assert.ok(segment.text.length <= 8192);
    toolSegments.push(segment.text);
    if (!segment.next) break;
    await evaluate(
      "[...window.__longToolContainer.querySelectorAll('button')].find(el=>el.textContent.trim()==='下一段').click()",
    );
    await wait(() =>
      evaluate(
        `window.__longToolContainer.dataset.readingSegment==='${segment.index + 1}'`,
      ),
    );
    assert.ok(attempt < 99, "tool pagination failed to terminate");
  }
  assert.equal(toolSegments.join(""), nativeText);
  await click("专注阅读");
  await evaluate(
    "window.__longToolContainer.querySelector('[data-reading-text]').scrollIntoView({block:'center'});true",
  );
  await evaluate("new Promise(r=>setTimeout(r,250))");
  screenshots.push(await shot("m2-long-tool-native-gap"));
  await click("恢复控件");
  metrics.tool = {
    originalBytes: artifact.length,
    originalSha256: createHash("sha256").update(artifact).digest("hex"),
    obtainedBytes: Buffer.byteLength(nativeText),
    nativeTruncation: truncation,
    segments: toolSegments.map((text) => text.length),
    ...toolReader,
  };
  checks.push(
    "actual packaged SDK tool produces a verified 10 MiB native artifact; SDK middle truncation remains explicit and all obtained head/tail text reconstructs exactly through bounded segments without changing native or Host budgets",
  );
  await selectThread(threadA);
  return metrics;
}
