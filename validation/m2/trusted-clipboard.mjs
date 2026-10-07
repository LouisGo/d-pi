import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  frozenReferences = false,
  targetDirectory,
}) {
  const fileName = "clipboard-source.txt";
  const directoryName = "clipboard-source-dir";
  if (frozenReferences) {
    assert.notEqual(targetDirectory, isolated.cwd);
    writeFileSync(join(isolated.cwd, fileName), "ORIGIN_BEFORE_COPY");
    mkdirSync(join(isolated.cwd, directoryName));
    writeFileSync(
      join(isolated.cwd, directoryName, "origin-entry.txt"),
      "DO_NOT_INLINE_THIS_BODY",
    );
    writeFileSync(join(targetDirectory, fileName), "TARGET_NEVER_READ");
    mkdirSync(join(targetDirectory, directoryName));
    writeFileSync(
      join(targetDirectory, directoryName, "target-only.txt"),
      "TARGET_NEVER_READ",
    );
  }
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
  const item = await evaluate(`(async()=>{
    const reply=await window.desktop.attachments.request({kind:'import-bytes',threadId:${JSON.stringify(threadId)},traceId:crypto.randomUUID(),name:'clipboard.png',mimeType:'image/png',dataBase64:${JSON.stringify(png)},source:'paste'});
    if(reply.kind!=='attachments'||reply.items[0]?.status!=='ready')throw Error('Fixture private image not ready');
    const draft=await window.desktop.request({kind:'restore',traceId:crypto.randomUUID()});
    if(draft.kind!=='ready'||draft.draft?.threadId!==${JSON.stringify(threadId)})throw Error('Fixture draft unavailable');
    const references=[];
    if(${JSON.stringify(frozenReferences)}){
      for(const [path,referenceKind] of ${JSON.stringify([
        [fileName, "file"],
        [directoryName, "directory"],
      ])}){
        const reference=await window.desktop.attachments.request({kind:'add-reference',threadId:${JSON.stringify(threadId)},traceId:crypto.randomUUID(),path,referenceKind});
        if(reference.kind!=='attachments'||reference.items[0]?.status!=='ready')throw Error('Fixture reference unavailable');
        references.push(reference.items[0]);
      }
    }
    const saved=await window.desktop.request({kind:'save',threadId:${JSON.stringify(threadId)},traceId:crypto.randomUUID(),expectedRevision:draft.draft.revision,text:'Structured QA '+[reply.items[0],...references].map(item=>item.token).join(' ')+' tail'});
    if(saved.kind!=='saved')throw Error('Fixture save failed');
    return {id:reply.items[0].id,digest:reply.items[0].inputDigest,ids:[reply.items[0],...references].map(item=>item.id)};
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
  let copyStartedAt;
  let copyReadyAt;
  try {
    await evaluate(`(()=>{
      const editor=document.querySelector('.tiptap');editor.focus();
      const range=document.createRange();range.selectNodeContents(editor);
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      document.addEventListener('copy',event=>{const envelope=event.clipboardData.getData('application/x-dpi-context-fragment+json');window.__qaCopied={plain:event.clipboardData.getData('text/plain'),ticket:!!envelope,envelope};},{once:true});
      return true;
    })()`);
    await evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
    pasteboard.beforeCopy();
    copyStartedAt = Date.now();
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
    if (frozenReferences) {
      // Await a real imported reply, then discard these unused clones. This
      // proves export is ready before changing the source, rather than racing
      // the copy request's bounded asynchronous freeze phase.
      const ready = await evaluate(`(async()=>{
        const reply=await window.desktop.attachments.request({kind:'clipboard-import',threadId:${JSON.stringify(otherThreadId)},traceId:crypto.randomUUID(),ticket:JSON.parse(window.__qaCopied.envelope)});
        if(reply.kind!=='clipboard-imported'||reply.degraded||reply.items.length!==3||reply.items.some(item=>item.status!=='ready'))throw Error('Frozen export unavailable');
        const ack=await window.desktop.attachments.request({kind:'clipboard-discard',threadId:${JSON.stringify(otherThreadId)},traceId:crypto.randomUUID(),ids:reply.items.map(item=>item.id)});
        if(ack.kind!=='cancelled')throw Error('Readiness clone cleanup unconfirmed');
        return true;
      })()`);
      assert.equal(ready, true);
      copyReadyAt = Date.now();
      rmSync(join(isolated.cwd, fileName));
      rmSync(join(isolated.cwd, directoryName, "origin-entry.txt"));
      writeFileSync(
        join(isolated.cwd, directoryName, "changed-entry.txt"),
        "ORIGIN_AFTER_COPY",
      );
    }
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
        `document.querySelectorAll('.tiptap [data-attachment-id]').length===${frozenReferences ? 3 : 1}`,
      ),
    );
    assert.equal(await evaluate("window.__qaPasteTicket"), true);
    const targetIds = await evaluate(
      "Array.from(document.querySelectorAll('.tiptap [data-attachment-id]'),node=>node.dataset.attachmentId)",
    );
    const targetId = targetIds[0];
    assert.notEqual(targetId, item.id);
    assert.equal(targetIds.length, item.ids.length);
    assert.ok(targetIds.every((id) => !item.ids.includes(id)));
    const privateClone = await evaluate(`(async()=>{
      const reply=await window.desktop.attachments.request({kind:'list',threadId:${JSON.stringify(otherThreadId)},traceId:crypto.randomUUID()});
      return reply.kind==='attachments'&&reply.items.some(item=>item.id===${JSON.stringify(targetId)}&&item.inputDigest===${JSON.stringify(item.digest)}&&item.status==='ready');
    })()`);
    assert.equal(privateClone, true);
    let frozen;
    if (frozenReferences) {
      const clones = await evaluate(`(async()=>{
        const reply=await window.desktop.attachments.request({kind:'list',threadId:${JSON.stringify(otherThreadId)},traceId:crypto.randomUUID()});
        if(reply.kind!=='attachments')throw Error('Frozen manifest unavailable');
        return ${JSON.stringify(targetIds.slice(1))}.map(id=>reply.items.find(item=>item.id===id));
      })()`);
      for (const [index, clone] of clones.entries()) {
        assert.equal(clone?.status, "ready");
        assert.equal(clone.source, "paste");
        assert.equal(clone.representation, "text");
        assert.equal(clone.frozenReference.projectPath, isolated.cwd);
        assert.equal(
          clone.frozenReference.path,
          index === 0 ? fileName : directoryName,
        );
        assert.equal(
          clone.frozenReference.kind,
          index === 0 ? "file" : "directory",
        );
        assert.equal(
          clone.frozenReference.version,
          `sha256:${clone.inputDigest}`,
        );
        const capturedAt = Date.parse(clone.frozenReference.capturedAt);
        assert.ok(capturedAt >= copyStartedAt && capturedAt <= copyReadyAt);
      }
      assert.equal(
        clones[0].inputDigest,
        createHash("sha256").update("ORIGIN_BEFORE_COPY").digest("hex"),
      );
      const previews = await evaluate(`(async()=>{
        const values=[];
        for(const id of ${JSON.stringify(targetIds.slice(1))})values.push(await window.desktop.attachments.request({kind:'preview',threadId:${JSON.stringify(otherThreadId)},traceId:crypto.randomUUID(),id}));
        return values;
      })()`);
      assert.equal(previews[0]?.kind, "text");
      assert.equal(previews[0]?.text, "ORIGIN_BEFORE_COPY");
      assert.equal(previews[1]?.kind, "text");
      assert.ok(previews[1].text.includes("origin-entry.txt"));
      assert.ok(!previews[1].text.includes("changed-entry.txt"));
      assert.ok(!previews[1].text.includes("target-only.txt"));
      assert.ok(!previews[1].text.includes("DO_NOT_INLINE_THIS_BODY"));
      await wait(() =>
        evaluate(
          "/复制时冻结|Frozen on copy/i.test(document.body.textContent)",
        ),
      );
      frozen = {
        differentProjects: true,
        deletedSourcePreserved: true,
        directorySnapshotPreserved: true,
        targetSamePathsIgnored: true,
        directEntriesOnly: true,
        frozenLabelVisible: true,
        provenanceVerified: true,
        fileVersion: clones[0].frozenReference.version,
        directoryVersion: clones[1].frozenReference.version,
      };
    }
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
        `document.querySelectorAll('.tiptap [data-attachment-id]').length===${frozenReferences ? 3 : 1}`,
      ),
    );
    assert.deepEqual(
      await evaluate(
        "Array.from(document.querySelectorAll('.tiptap [data-attachment-id]'),node=>node.dataset.attachmentId)",
      ),
      targetIds,
    );
    result = {
      nativeTransport: true,
      newTargetId: true,
      sameDigest: true,
      singleUndo: true,
      redoSameId: true,
      ...(frozen ? { frozenReferences: frozen } : {}),
    };
  } finally {
    restore = pasteboard.restore();
  }
  return { ...result, pasteboardRestore: restore.kind };
}
