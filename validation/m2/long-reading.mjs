import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const initialText =
  "M2_LONG_REPLY_START\n" +
  Array.from(
    { length: 240 },
    (_, index) =>
      `Reading ${index}: 中文🙂 ${"bounded original text ".repeat(6)}\n`,
  ).join("");
const appendedText =
  "\nM2_LONG_REPLY_APPENDED\n" + "append 🙂 中文\n".repeat(160);
const toolBytes = 10 * 1024 * 1024;

export function prepareLongReadingExtension(config) {
  writeFileSync(
    join(config, "extensions", "long-reading.ts"),
    `export default function(pi) {
      pi.registerTool({name:'m2_long_output',label:'M2 long output',description:'Isolated deterministic output fixture',parameters:pi.zod.object({}),
        async execute(){return {content:[{type:'text',text:'M2_TEN_MIB_TOOL_START'+ 'T'.repeat(${toolBytes} - 42)+'M2_TEN_MIB_TOOL_END__'}],details:{fixtureBytes:${toolBytes}}};}
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
  await wait(() =>
    evaluate(
      "document.querySelector('.runtime-panel')?.textContent.includes('OMP 已就绪') && window.__longReadingText.closest('article').querySelector('.message-heading > span')?.textContent === ''",
    ),
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

  const savedClipboard = spawnSync("/usr/bin/pbpaste", [], { env }).stdout;
  let completeObtainedText;
  try {
    await call("Page.bringToFront");
    await evaluate(
      `window.__longReadingText.closest('article').querySelector('.message-heading button').scrollIntoView({block:'nearest'})`,
    );
    const point = await evaluate(
      "(()=>{const r=window.__longReadingText.closest('article').querySelector('.message-heading button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
    );
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
    const copied = await wait(() => {
      const text = spawnSync("/usr/bin/pbpaste", [], {
        env,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      }).stdout;
      return text?.includes("M2_LONG_REPLY_APPENDED") ? text : null;
    });
    assert.ok(copied.startsWith(initialText));
    assert.ok(copied.includes(appendedText));
    assert.ok(copied.includes("_FINALIZED"));
    metrics.copiedLength = copied.length;
    completeObtainedText = copied;
    metrics.copiedSha256 = createHash("sha256").update(copied).digest("hex");
    checks.push(
      "real packaged copy action writes complete obtained long native reply to macOS clipboard including undisplayed later segments and finalization",
    );
  } finally {
    spawnSync("/usr/bin/pbcopy", [], { env, input: savedClipboard });
  }
  const segments = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    const current = await evaluate(`(()=>{
      const article=[...document.querySelectorAll('.conversation article')].find(el=>el.textContent.includes('M2_LONG_REPLY_START') || el.querySelector('[data-long-reading]')===window.__longReadingContainer);
      const container=article?.querySelector('[data-long-reading]');
      if(!container) return null;
      window.__longReadingContainer=container;
      const texts=container.querySelectorAll('[data-reading-text]');
      const next=[...container.querySelectorAll('button')].find(el=>el.textContent.trim()==='下一段');
      return {text:texts[0]?.textContent,count:texts.length,next:!!next&&!next.disabled};
    })()`);
    assert.ok(current);
    assert.equal(current.count, 1);
    assert.ok(current.text.length <= 8192);
    segments.push(current.text);
    if (!current.next) break;
    await evaluate(
      "[...window.__longReadingContainer.querySelectorAll('button')].find(el=>el.textContent.trim()==='下一段').click()",
    );
    await evaluate("new Promise(r=>requestAnimationFrame(r))");
    assert.ok(attempt < 99, "reader pagination failed to terminate");
  }
  assert.equal(segments.join(""), completeObtainedText);
  metrics.segments = segments.map((text) => text.length);
  for (let attempt = 0; attempt < segments.length - 1; attempt++) {
    await evaluate(
      "[...window.__longReadingContainer.querySelectorAll('button')].find(el=>el.textContent.trim()==='上一段').click()",
    );
    await evaluate("new Promise(r=>requestAnimationFrame(r))");
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
  assert.equal(
    Buffer.byteLength(toolContent),
    toolBytes,
    "the actual SDK tool payload must be exactly 10 MiB",
  );
  assert.ok(toolContent.endsWith("M2_TEN_MIB_TOOL_END__"));
  const toolReader = await evaluate(`(()=>{
    const article=[...document.querySelectorAll('.conversation article')].find(el=>el.textContent.includes('m2_long_output')&&el.textContent.includes('M2_TEN_MIB_TOOL_START'));
    if(!article) return null;
    article.querySelector('details').open=true;
    const p=article.querySelector('[data-reading-text]');
    return p?{length:p.textContent.length,height:p.getBoundingClientRect().height,truncated:article.textContent.includes('显示已截断'),endShown:article.textContent.includes('M2_TEN_MIB_TOOL_END__')}:null;
  })()`);
  assert.ok(toolReader);
  assert.ok(toolReader.length <= 16384 && toolReader.height <= 600);
  assert.equal(toolReader.truncated, true);
  assert.equal(toolReader.endShown, false);
  metrics.tool = {
    originalBytes: Buffer.byteLength(toolContent),
    ...toolReader,
  };
  checks.push(
    "actual packaged SDK 10 MiB tool output stays within the existing Host projection budget, exposes truncation and renders one bounded original segment without expanding the main list",
  );
  await selectThread(threadA);
  return metrics;
}
