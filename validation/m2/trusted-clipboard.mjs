import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { captureClipboard } from "./clipboard.mjs";

// Real Chromium copy/paste + native macOS pasteboard in an isolated production
// window. The helper preserves all original formats and skips newer user copies.
export async function validateTrustedClipboard({
  call,
  evaluate,
  wait,
  isolated,
  threadId,
  otherThreadId,
}) {
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
  const item = await evaluate(`(async()=>{
    const reply=await window.desktop.attachments.request({kind:'import-bytes',threadId:${JSON.stringify(threadId)},traceId:crypto.randomUUID(),name:'clipboard.png',mimeType:'image/png',dataBase64:${JSON.stringify(png)},source:'paste'});
    if(reply.kind!=='attachments'||reply.items[0]?.status!=='ready')throw Error('Fixture private image not ready');
    const draft=await window.desktop.request({kind:'restore',traceId:crypto.randomUUID()});
    if(draft.kind!=='ready'||draft.draft?.threadId!==${JSON.stringify(threadId)})throw Error('Fixture draft unavailable');
    const saved=await window.desktop.request({kind:'save',threadId:${JSON.stringify(threadId)},traceId:crypto.randomUUID(),expectedRevision:draft.draft.revision,text:'Structured QA '+reply.items[0].token+' tail'});
    if(saved.kind!=='saved')throw Error('Fixture save failed');
    return {id:reply.items[0].id,digest:reply.items[0].inputDigest};
  })()`);
  const reloadAt = Date.now();
  await call("Page.reload");
  await wait(() =>
    evaluate("!!document.querySelector('.tiptap [data-attachment-id]')"),
  );
  const logs = join(isolated.data, "logs", "main.jsonl");
  await wait(() => {
    if (!existsSync(logs)) return false;
    return readFileSync(logs, "utf8")
      .split("\n")
      .some((line) => {
        try {
          const record = JSON.parse(line);
          return (
            record.operation === "attachments:clipboard-reserve" &&
            record.stage === "completed" &&
            record.threadId === threadId &&
            Date.parse(record.time) >= reloadAt
          );
        } catch {
          return false;
        }
      });
  });
  const pasteboard = captureClipboard({
    env: isolated.env,
    temporary: isolated.root,
  });
  let restore;
  let result;
  try {
    await evaluate(`(()=>{
      const editor=document.querySelector('.tiptap');editor.focus();
      const range=document.createRange();range.selectNodeContents(editor);
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      document.addEventListener('copy',event=>{window.__qaCopied={plain:event.clipboardData.getData('text/plain'),ticket:!!event.clipboardData.getData('application/x-dpi-context-fragment+json')};},{once:true});
      return true;
    })()`);
    await evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
    pasteboard.beforeCopy();
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "c",
      code: "KeyC",
      modifiers: 4,
      windowsVirtualKeyCode: 67,
      commands: ["Copy"],
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "c",
      code: "KeyC",
      modifiers: 4,
      windowsVirtualKeyCode: 67,
    });
    const copied = await evaluate("window.__qaCopied");
    if (
      typeof copied?.plain === "string" &&
      copied.plain.includes("Structured QA")
    )
      pasteboard.markOwnedCopy(copied.plain);
    assert.equal(copied?.ticket, true);
    assert.ok(copied.plain.includes("Structured QA"));
    await evaluate(
      `document.querySelector('.thread-navigation button[title$="${otherThreadId}"]').click()`,
    );
    await wait(() =>
      evaluate(
        `document.querySelector('.thread-navigation button[aria-current=page]')?.title.endsWith('${otherThreadId}')`,
      ),
    );
    await evaluate(`(()=>{
      const editor=document.querySelector('.tiptap');editor.focus();
      const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      document.addEventListener('paste',event=>{window.__qaPasteTicket=event.clipboardData.types.includes('application/x-dpi-context-fragment+json')||event.clipboardData.getData('text/html').includes('data-dpi-context=');},{once:true});return true;
    })()`);
    await evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "v",
      code: "KeyV",
      modifiers: 4,
      windowsVirtualKeyCode: 86,
      commands: ["Paste"],
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "v",
      code: "KeyV",
      modifiers: 4,
      windowsVirtualKeyCode: 86,
    });
    await wait(() =>
      evaluate(
        "document.querySelectorAll('.tiptap [data-attachment-id]').length===1",
      ),
    );
    assert.equal(await evaluate("window.__qaPasteTicket"), true);
    const targetId = await evaluate(
      "document.querySelector('.tiptap [data-attachment-id]').dataset.attachmentId",
    );
    assert.notEqual(targetId, item.id);
    const privateClone = await evaluate(`(async()=>{
      const reply=await window.desktop.attachments.request({kind:'list',threadId:${JSON.stringify(otherThreadId)},traceId:crypto.randomUUID()});
      return reply.kind==='attachments'&&reply.items.some(item=>item.id===${JSON.stringify(targetId)}&&item.inputDigest===${JSON.stringify(item.digest)}&&item.status==='ready');
    })()`);
    assert.equal(privateClone, true);
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "z",
      code: "KeyZ",
      modifiers: 4,
      windowsVirtualKeyCode: 90,
      commands: ["Undo"],
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "z",
      code: "KeyZ",
      modifiers: 4,
      windowsVirtualKeyCode: 90,
    });
    await wait(() =>
      evaluate(
        "document.querySelectorAll('.tiptap [data-attachment-id]').length===0",
      ),
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.tiptap').textContent.includes('Structured QA')",
      ),
      false,
    );
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Z",
      code: "KeyZ",
      modifiers: 12,
      windowsVirtualKeyCode: 90,
      commands: ["Redo"],
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Z",
      code: "KeyZ",
      modifiers: 12,
      windowsVirtualKeyCode: 90,
    });
    await wait(() =>
      evaluate(
        "document.querySelectorAll('.tiptap [data-attachment-id]').length===1",
      ),
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.tiptap [data-attachment-id]').dataset.attachmentId",
      ),
      targetId,
    );
    result = {
      nativeTransport: true,
      newTargetId: true,
      sameDigest: true,
      singleUndo: true,
      redoSameId: true,
    };
  } finally {
    restore = pasteboard.restore();
  }
  return { ...result, pasteboardRestore: restore.kind };
}
