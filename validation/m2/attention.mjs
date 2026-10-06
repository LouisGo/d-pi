import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dialogTitle = "M2 attention isolated confirmation";
const resultText = "M2_ATTENTION_COMPLETED_RESULT";
const marker = "M2_ATTENTION_";

/** A labelled extension invokes the fixed SDK's actual native UI path. */
export function prepareAttentionExtension(config, root) {
  writeFileSync(
    join(config, "extensions", "attention.ts"),
    `import {writeFileSync} from 'node:fs';
export default function(pi) {
  pi.registerCommand('m2-attention-dialog', {description:'Isolated native attention fixture', handler:async(_,ctx)=>{
    await new Promise(resolve=>setTimeout(resolve,1500));
    const confirmed=await ctx.ui.confirm(${JSON.stringify(dialogTitle)},'Isolated fixture: no account, payment or production mutation.');
    writeFileSync(${JSON.stringify(join(root, "attention-native-answer.json"))},JSON.stringify({confirmed}));
  }});
}`,
  );
}

/** Only the localhost provider is controlled; no Main/runtime event is fabricated. */
export function createAttentionSupplier() {
  const requests = [];
  const releases = new Map();
  return {
    requests,
    releases,
    handle(request, response) {
      const user = request.messages
        .filter((item) => item.role === "user")
        .at(-1);
      const text =
        typeof user?.content === "string"
          ? user.content
          : (user?.content ?? [])
              .filter((item) => item.type === "text")
              .map((item) => item.text)
              .join("\n");
      if (!text.includes(marker)) return false;
      const mode = text.includes("M2_ATTENTION_FAILED")
        ? "failed"
        : text.includes("M2_ATTENTION_CLOSED")
          ? "closed"
          : text.includes("M2_ATTENTION_NATIVE")
            ? "native"
            : "completed";
      requests.push({ mode, model: request.model });
      assert.ok(
        !releases.has(mode),
        `Duplicate controlled provider request: ${mode}`,
      );
      releases.set(mode, () => {
        releases.delete(mode);
        if (mode === "failed") {
          response.writeHead(400, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              error: {
                message: "Isolated attention provider failure",
                type: "invalid_request_error",
              },
            }),
          );
          return;
        }
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        const frame = (delta, finish_reason = null) => ({
          id: "attention-fixture",
          object: "chat.completion.chunk",
          created: 1,
          model: request.model,
          choices: [{ index: 0, delta, finish_reason }],
        });
        response.write(
          `data: ${JSON.stringify(frame({ role: "assistant", content: resultText }))}\n\n`,
        );
        response.write(`data: ${JSON.stringify(frame({}, "stop"))}\n\n`);
        response.end("data: [DONE]\n\n");
      });
      return true;
    },
    release(mode) {
      assert.ok(releases.has(mode), `Missing actual provider request: ${mode}`);
      releases.get(mode)();
    },
  };
}

async function snapshot(evaluate) {
  const traceId = randomUUID();
  const reply = await evaluate(
    `window.desktop.attention.request(${JSON.stringify({ kind: "snapshot", traceId })})`,
  );
  assert.equal(reply.traceId, traceId);
  assert.equal(reply.kind, "snapshot", JSON.stringify(reply));
  return reply.snapshot;
}

async function checkpoint(root, operation, instructions, detail = {}) {
  const resumeFile = join(root, `attention-${operation}-continue`);
  const evidenceFile = join(root, `attention-${operation}-observation.json`);
  const expiresAt = new Date(Date.now() + 300_000).toISOString();
  const notice = {
    root,
    operation,
    instructions,
    ...detail,
    evidenceFile,
    resumeFile,
    expiresAt,
  };
  const path = join(root, `attention-${operation}-checkpoint.json`);
  writeFileSync(path, JSON.stringify(notice, null, 2));
  console.log(JSON.stringify({ checkpoint: path, ...notice }));
  while (!existsSync(resumeFile)) {
    if (Date.now() > Date.parse(expiresAt))
      throw Error(`Native attention ${operation} checkpoint timeout`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(
    existsSync(evidenceFile),
    `Native ${operation} observation must be recorded, including unknown/unavailable`,
  );
  const evidence = JSON.parse(readFileSync(evidenceFile, "utf8"));
  assert.ok(["observed", "unavailable", "unknown"].includes(evidence.status));
  assert.equal(typeof evidence.notes, "string");
  assert.ok(evidence.notes.length > 0);
  return evidence;
}

async function clickSelector(evaluate, wait, selector) {
  await wait(() =>
    evaluate(
      `!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`,
    ),
  );
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}

async function newThread({ click, db, wait, evaluate }) {
  const before = db
    .prepare("SELECT active_thread FROM desktop")
    .get().active_thread;
  await click("新会话");
  const id = await wait(() => {
    const current = db
      .prepare("SELECT active_thread FROM desktop")
      .get().active_thread;
    return current !== before ? current : null;
  });
  await wait(() =>
    evaluate(
      `document.querySelector('.thread-navigation button[aria-current=page]')?.title.endsWith('${id}') && !!document.querySelector('[contenteditable=true]') && !document.querySelector('[contenteditable=true]').closest('[inert]') && document.querySelector('.runtime-panel')?.textContent.includes('OMP 已就绪')`,
    ),
  );
  return id;
}

async function retainedWorkspace(evaluate) {
  return evaluate(
    `(()=>{const editor=document.querySelector('[contenteditable=true]');const selection=getSelection();return {text:editor?.textContent,focus:document.activeElement===editor,from:selection?.anchorOffset,to:selection?.focusOffset}})()`,
  );
}

export async function validateAttention(context) {
  const {
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
    root,
    connect,
    nativeInspection,
  } = context;
  const metrics = {
    fixture: "fixed SDK extension + localhost provider; no fake runtime events",
    snapshots: {},
    native: {
      displayClick: { status: "not-exercised" },
      closedWindow: { status: "not-exercised" },
    },
  };
  const initial = await snapshot(evaluate);
  assert.deepEqual(initial.preferences, { system: false, completion: false });
  assert.equal(initial.system, "disabled");
  metrics.snapshots.initial = initial;

  const interactionThread = await newThread(context);
  await insert("/m2-attention-dialog");
  await click("发送");
  await wait(() =>
    evaluate(
      "document.querySelector('[contenteditable=true]')?.textContent===''",
    ),
  );
  await selectThread(threadA);
  await evaluate("document.querySelector('[contenteditable=true]').focus()");
  const workspace = await retainedWorkspace(evaluate);
  const nativeSessionsBefore = db
    .prepare(
      "SELECT session_id,thread_id FROM native_session ORDER BY thread_id",
    )
    .all();
  const answerFile = join(root, "attention-native-answer.json");
  const pending = await wait(async () => {
    const state = await snapshot(evaluate);
    return state.entries.some(
      (entry) =>
        entry.threadId === interactionThread &&
        entry.kind === "needs-answer" &&
        entry.unread,
    )
      ? state
      : null;
  });
  const pendingEntry = pending.entries.find(
    (entry) =>
      entry.threadId === interactionThread && entry.kind === "needs-answer",
  );
  assert.equal(
    existsSync(answerFile),
    false,
    "background interaction was silently answered",
  );
  assert.deepEqual(
    await retainedWorkspace(evaluate),
    workspace,
    "background attention stole draft/focus/selection",
  );
  await wait(() =>
    evaluate(
      `!!document.querySelector('[data-attention-open="${interactionThread}"]')`,
    ),
  );
  metrics.snapshots.pending = pending;
  screenshots.push(await shot("m2-attention-background-needs-answer"));
  await call("Page.reload");
  await wait(() =>
    evaluate(
      "!!window.desktop?.attention && !!document.querySelector('[contenteditable=true]')",
    ),
  );
  const reloaded = await snapshot(evaluate);
  assert.equal(reloaded.instanceId, pending.instanceId);
  assert.deepEqual(
    reloaded.entries.filter((entry) => entry.threadId === interactionThread),
    pending.entries.filter((entry) => entry.threadId === interactionThread),
  );
  assert.deepEqual(
    db
      .prepare(
        "SELECT session_id,thread_id FROM native_session ORDER BY thread_id",
      )
      .all(),
    nativeSessionsBefore,
  );
  assert.equal(existsSync(answerFile), false);
  metrics.snapshots.reloaded = reloaded;
  checks.push(
    "actual fixed-SDK background confirm preserves foreground draft/focus/selection, real native sessions and deduplicated Main event identity across Renderer reload; no answer is sent by attention",
  );
  await evaluate(`(()=>{
    const samples=[];
    const sample=(phase)=>{if(samples.length<150)samples.push({phase,time:performance.now(),focus:document.activeElement?.outerHTML.slice(0,500),inert:document.querySelector('.thread-workspace')?.inert,target:!!document.querySelector('[data-attention-target=interaction]'),route:location.hash})};
    const focus=(event)=>sample(event.type);
    document.addEventListener('focusin',focus,true);document.addEventListener('focusout',focus,true);
    const observer=new MutationObserver(()=>sample('mutation'));
    observer.observe(document.getElementById('root'),{subtree:true,childList:true,attributes:true,attributeFilter:['inert']});
    sample('before-click');
    window.__attentionFocusProbe=()=>{sample('finish');observer.disconnect();document.removeEventListener('focusin',focus,true);document.removeEventListener('focusout',focus,true);delete window.__attentionFocusProbe;return samples;};return true;
  })()`);
  await clickSelector(
    evaluate,
    wait,
    `[data-attention-open="${interactionThread}"]`,
  );
  await wait(() =>
    evaluate(
      `document.querySelector('.thread-navigation button[aria-current=page]')?.title.endsWith('${interactionThread}') && document.querySelector('.native-interactions')?.textContent.includes(${JSON.stringify(dialogTitle)})`,
    ),
  );
  try {
    await wait(() =>
      evaluate(
        "!!document.activeElement?.closest('[data-attention-target=interaction]')",
      ),
    );
  } finally {
    writeFileSync(
      join(root, "attention-focus-observations.json"),
      JSON.stringify(
        await evaluate("window.__attentionFocusProbe()"),
        null,
        2,
      ) + "\n",
    );
  }
  screenshots.push(await shot("m2-attention-click-native-dialog"));
  await click("确认");
  await wait(() => existsSync(answerFile));
  assert.deepEqual(JSON.parse(readFileSync(answerFile, "utf8")), {
    confirmed: true,
  });
  await wait(
    async () =>
      !(await snapshot(evaluate)).entries.some(
        (entry) => entry.eventId === pendingEntry.eventId && entry.unread,
      ),
  );
  await selectThread(threadA);
  const providerCallsBeforeOldClick = supplier.requests.length;
  const staleTraceId = randomUUID();
  const staleReply = await evaluate(
    `window.desktop.attention.request(${JSON.stringify({ kind: "seen", traceId: staleTraceId, threadId: interactionThread, eventId: pendingEntry.eventId })})`,
  );
  assert.equal(staleReply.kind, "failed");
  assert.equal(staleReply.code, "invalid-request");
  assert.equal(staleReply.traceId, staleTraceId);
  assert.equal((await snapshot(evaluate)).openRequest, null);
  assert.equal(supplier.requests.length, providerCallsBeforeOldClick);
  assert.deepEqual(JSON.parse(readFileSync(answerFile, "utf8")), {
    confirmed: true,
  });
  checks.push(
    "formal in-app attention click selects the correct Thread and focuses the actual native interaction; the shipped public bridge rejects a seen command for a nonactive Thread without reopening or resending the answered request (native stale-click handling is a separate evidence tier)",
  );

  const failThread = await newThread(context);
  await insert("M2_ATTENTION_FAILED");
  await click("发送");
  await wait(() => supplier.releases.has("failed"));
  await selectThread(threadA);
  await evaluate("document.querySelector('[contenteditable=true]').focus()");
  const failWorkspace = await retainedWorkspace(evaluate);
  supplier.release("failed");
  const failed = await wait(async () => {
    const state = await snapshot(evaluate);
    return state.entries.some(
      (entry) =>
        entry.threadId === failThread &&
        entry.kind === "failed" &&
        entry.unread,
    )
      ? state
      : null;
  });
  assert.deepEqual(await retainedWorkspace(evaluate), failWorkspace);
  metrics.snapshots.failed = failed;
  screenshots.push(await shot("m2-attention-background-failed"));
  await clickSelector(evaluate, wait, `[data-attention-open="${failThread}"]`);
  await wait(() =>
    evaluate(
      `document.querySelector('.thread-navigation button[aria-current=page]')?.title.endsWith('${failThread}')`,
    ),
  );
  const failedEntry = failed.entries.find(
    (entry) =>
      entry.threadId === failThread && entry.kind === "failed" && entry.unread,
  );
  const failureDetail = await wait(() =>
    evaluate(`(()=>{
    const el=document.querySelector('[data-attention-receipt-trace="${failedEntry.traceId}"]');
    if(!el) return null;
    const r=el.getBoundingClientRect();
    const pane=el.closest('.reading-pane');
    const status=el.querySelector('p');
    if(!pane || !status) return null;
    const pr=pane.getBoundingClientRect(), sr=status.getBoundingClientRect();
    const details=el.closest('details');
    if(!details?.open || document.activeElement!==el || !el.getClientRects().length || getComputedStyle(el).visibility!=='visible' || !el.textContent.includes('原生返回失败')) return null;
    if(r.top>=innerHeight || r.bottom<=0 || r.width<=0) return null;
    let top=0,bottom=innerHeight,left=0,right=innerWidth;
    for(let a=status.parentElement;a;a=a.parentElement){
      const style=getComputedStyle(a), ar=a.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,ar.top);bottom=Math.min(bottom,ar.bottom)}
      if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,ar.left);right=Math.min(right,ar.right)}
    }
    if(sr.top<top || sr.bottom>bottom || sr.left<left || sr.right>right || !status.textContent.includes('原生返回失败')) return null;
    return {traceId:${JSON.stringify(failedEntry.traceId)},text:el.textContent,focused:true,detailsOpen:details.open,top:r.top,bottom:r.bottom,viewport:innerHeight,readingTop:pr.top,readingBottom:pr.bottom,statusTop:sr.top,statusBottom:sr.bottom,visible:{top,bottom,left,right}};
  })()`),
  );
  metrics.failureDetail = failureDetail;
  screenshots.push(await shot("m2-attention-click-failed-receipt"));
  checks.push(
    "actual localhost HTTP400 travels through fixed SDK into a failed attention entry; background failure retains foreground work and click locates actual failure/result",
  );

  const completedThread = await newThread(context);
  await insert("M2_ATTENTION_COMPLETED");
  await click("发送");
  await wait(() => supplier.releases.has("completed"));
  await selectThread(threadA);
  supplier.release("completed");
  const completed = await wait(async () => {
    const state = await snapshot(evaluate);
    return state.entries.some(
      (entry) =>
        entry.threadId === completedThread &&
        entry.kind === "completed" &&
        entry.unread,
    )
      ? state
      : null;
  });
  assert.deepEqual(completed.preferences, { system: false, completion: false });
  metrics.snapshots.completed = completed;
  await wait(() =>
    evaluate(
      `!!document.querySelector('[data-attention-thread="${completedThread}"][data-attention-kind="completed"][data-attention-unread="true"]')`,
    ),
  );
  assert.equal(
    await evaluate(
      `!!document.querySelector('[data-attention-center] [data-attention-entry="${completed.entries.find((item) => item.threadId === completedThread && item.kind === "completed").eventId}"]')`,
    ),
    false,
    "completion is noisy by default",
  );
  await selectThread(completedThread);
  await wait(() =>
    evaluate(
      `document.querySelector('.conversation')?.textContent.includes(${JSON.stringify(resultText)})`,
    ),
  );
  await selectThread(threadA);
  checks.push(
    "actual completed receipt is retained as completed/unread, with system and completion alerts disabled by default; native reply remains readable in its own Thread",
  );

  // Previously visited Threads may legitimately be read when the native window
  // has focus. Produce an explicit unread workload instead of relying on that.
  metrics.budgetThreads = [];
  for (let index = 0; index < 4; index++) {
    const threadId = await newThread(context);
    await insert(`M2_ATTENTION_BUDGET_${index}`);
    await click("发送");
    await wait(() => supplier.releases.has("completed"));
    await selectThread(threadA);
    supplier.release("completed");
    await wait(async () =>
      (await snapshot(evaluate)).entries.some(
        (entry) =>
          entry.threadId === threadId &&
          entry.kind === "completed" &&
          entry.unread,
      ),
    );
    metrics.budgetThreads.push(threadId);
  }
  metrics.snapshots.budget = await snapshot(evaluate);

  await evaluate(
    "document.querySelector('details[data-attention-preferences]').open=true",
  );
  await wait(() =>
    evaluate("!!document.querySelector('[data-attention-system]')"),
  );
  const toggle = async (key) => {
    await clickSelector(evaluate, wait, `[data-attention-${key}]`);
    await wait(async () => (await snapshot(evaluate)).preferences[key]);
  };
  await toggle("system");
  await toggle("completion");
  metrics.persistedPreferences = { system: true, completion: true };
  metrics.systemCapability = (await snapshot(evaluate)).system;
  screenshots.push(await shot("m2-attention-preferences-dark-normal"));
  await validateReminderBudget({ evaluate, wait, shot, screenshots, metrics });
  await validateAppearance({
    evaluate,
    wait,
    call,
    shot,
    screenshots,
    metrics,
  });
  await validateReminderBudget({ evaluate, wait, shot, screenshots, metrics });
  checks.push(
    "shipped settings explicitly enable system/completion preferences; theme/density/language and representative narrow viewport remain bounded",
  );
  checks.push(
    "multiple real unread reminders preserve current reading space and draft across normal/compact and narrow layouts; the last reminder remains reachable through focus and internal scroll",
  );

  if (nativeInspection) {
    await evaluate(
      "document.querySelector('details[data-attention-preferences]').open=false",
    );
    const nativeThread = await newThread(context);
    await insert("M2_ATTENTION_NATIVE");
    await click("发送");
    await wait(() => supplier.releases.has("native"));
    await selectThread(threadA);
    metrics.native.prepare = await checkpoint(
      root,
      "background",
      "Observe only local.d-pi.m2-validation. Put another App in the foreground (do not quit d-pi). Record status observed and notes in evidenceFile, then create resumeFile. The harness releases the actual held provider response only after resume.",
      { nativeThread },
    );
    assert.equal(
      metrics.native.prepare.status,
      "observed",
      "background scenario requires actual foreground change",
    );
    await evaluate(
      "window.__attentionNativeOpens=[];window.__attentionNativeUnsubscribe=window.desktop.attention.subscribe(s=>{if(s.openRequest)window.__attentionNativeOpens.push(s.openRequest)});true",
    );
    supplier.release("native");
    const delivered = await wait(async () => {
      const state = await snapshot(evaluate);
      return state.entries.some(
        (entry) =>
          entry.threadId === nativeThread && entry.kind === "completed",
      )
        ? state
        : null;
    });
    metrics.snapshots.native = delivered;
    metrics.native.displayClick = await checkpoint(
      root,
      "display-click",
      "Inspect actual macOS Notification Center for the isolated d-pi completion notification, verify it contains only generic text and the Thread short ID, and click it. Write evidenceFile {status:'observed',notes:'...'} only if both actual display AND click were observed. Otherwise write unavailable/unknown with concrete OS observation; do not manufacture notification callbacks. Create resumeFile afterwards.",
      {
        nativeThread,
        expectedShortId: nativeThread.slice(0, 6),
        capability: delivered.system,
      },
    );
    metrics.native.openRequests = await evaluate(
      "window.__attentionNativeOpens",
    );
    if (metrics.native.displayClick.status === "observed") {
      await wait(() =>
        evaluate(
          `document.querySelector('.thread-navigation button[aria-current=page]')?.title.endsWith('${nativeThread}') && document.querySelector('.conversation')?.textContent.includes(${JSON.stringify(resultText)})`,
        ),
      );
      assert.ok(
        metrics.native.openRequests.some(
          (item) => item.threadId === nativeThread,
        ),
        "actual native click did not pass through Main openRequest",
      );
      checks.push(
        "actual macOS notification display and click are observed independently and shipped Main openRequest locates the real completed Thread",
      );
    }
    await evaluate("window.__attentionNativeUnsubscribe()");
    const closedThread = await newThread(context);
    await insert("M2_ATTENTION_CLOSED");
    await click("发送");
    await wait(() => supplier.releases.has("closed"));
    await selectThread(threadA);
    metrics.native.close = await checkpoint(
      root,
      "close-window",
      "Close the isolated d-pi window with its native close control, leaving the App running. Verify no d-pi window remains. Record evidenceFile status observed/notes, then create resumeFile. The actual provider response is still held until the window is closed.",
      { closedThread },
    );
    assert.equal(
      metrics.native.close.status,
      "observed",
      "closed-window scenario requires a real closed window",
    );
    supplier.release("closed");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    metrics.native.closedWindow = await checkpoint(
      root,
      "reopen",
      "Reopen the same running isolated d-pi App through its Dock icon or Finder double-click on this exact bundle (do not launch a second candidate). Record the actual route used. Record observed/notes, then create resumeFile. Harness then checks retained Main identity, completed event and no repeat supplier request.",
      { closedThread },
    );
    assert.equal(metrics.native.closedWindow.status, "observed");
    await connect();
    await wait(() => evaluate("!!window.desktop?.attention"));
    const reopened = await snapshot(evaluate);
    assert.equal(reopened.instanceId, initial.instanceId);
    assert.ok(
      reopened.entries.some(
        (item) =>
          item.threadId === closedThread &&
          item.kind === "completed" &&
          item.unread,
      ),
    );
    assert.equal(
      supplier.requests.filter((item) => item.mode === "closed").length,
      1,
    );
    metrics.snapshots.reopened = reopened;
    await validateReminderBudget({
      evaluate,
      wait,
      shot,
      screenshots,
      metrics,
    });
    checks.push(
      "actual native window close/reopen retains the independent Main observer and a real completed receipt, with the same Main instance and no repeated provider request",
    );
  }
  await selectThread(threadA);
  writeFileSync(
    join(root, "attention-result.json"),
    JSON.stringify(metrics, null, 2) + "\n",
  );
  return metrics;
}

async function validateReminderBudget({
  evaluate,
  wait,
  shot,
  screenshots,
  metrics,
}) {
  await wait(() =>
    evaluate(
      "document.querySelectorAll('[data-attention-center] [data-attention-entry]').length>=4 && !!document.querySelector('.reading-pane:not([hidden])')",
    ),
  );
  const bounds = await evaluate(`(()=>{
    const center=document.querySelector('[data-attention-center]');
    const pane=document.querySelector('.reading-pane:not([hidden])');
    if(!center || !pane) return null;
    const cr=center.getBoundingClientRect(), pr=pane.getBoundingClientRect();
    const wr=document.querySelector('.work-content').getBoundingClientRect();
    const er=document.querySelector('.composer').getBoundingClientRect();
    const readingVisible=pr.top>=Math.max(0,wr.top) && pr.bottom<=Math.min(innerHeight,wr.bottom);
    const editorVisible=er.top>=Math.max(0,wr.top) && er.bottom<=Math.min(innerHeight,wr.bottom) && er.left>=0 && er.right<=innerWidth;
    const style=getComputedStyle(pane);
    const previous=document.activeElement, scroll=center.scrollTop;
    const buttons=center.querySelectorAll('[data-attention-open]'), last=buttons[buttons.length-1];
    last?.focus();
    const lr=last?.getBoundingClientRect();
    const after=center.getBoundingClientRect();
    const focusBounds={before:cr.toJSON(),after:after.toJSON(),last:lr?.toJSON(),scrollTop:center.scrollTop,active:document.activeElement===last,pixelRatio:devicePixelRatio};
    const lastReachable=!!lr && document.activeElement===last && lr.top>=cr.top && lr.bottom<=cr.bottom && lr.left>=cr.left && lr.right<=cr.right;
    last?.blur();previous?.focus({preventScroll:true});center.scrollTop=scroll;
    const focusRestored=document.activeElement===previous;
    return {entries:center.querySelectorAll('[data-attention-entry]').length,theme:document.documentElement.dataset.theme,density:document.documentElement.dataset.density,viewport:innerWidth,centerHeight:cr.height,centerScrollHeight:center.scrollHeight,centerClientHeight:center.clientHeight,readingHeight:pr.height,lineHeight:parseFloat(style.lineHeight),lastReachable,focusBounds,focusRestored,priorFocus:previous?.tagName,readingVisible,editorVisible,draft:document.querySelector('.tiptap')?.textContent};
  })()`);
  assert.ok(
    bounds && bounds.entries >= 4,
    "actual multi-Thread reminder sample is missing",
  );
  assert.ok(
    bounds.readingHeight >= bounds.lineHeight * 4,
    `reminders squeezed current reading: ${JSON.stringify(bounds)}`,
  );
  assert.ok(
    bounds.readingVisible && bounds.editorVisible,
    "reading and Composer must stay inside the actual work viewport",
  );
  assert.ok(
    bounds.centerScrollHeight > bounds.centerClientHeight,
    "actual multi-Thread reminders must have independent internal scroll",
  );
  assert.equal(bounds.draft, "A_UNSENT_DRAFT");
  assert.ok(
    bounds.lastReachable,
    `last reminder must remain reachable by focus/scroll: ${JSON.stringify(bounds)}`,
  );
  assert.ok(
    bounds.focusRestored,
    "budget probe must restore the actual prior active element",
  );
  (metrics.reminderBudgets ??= []).push(bounds);
  screenshots.push(
    await shot(
      `m2-attention-bounded-reminders-${metrics.reminderBudgets.length}-${bounds.theme}-${bounds.density}-${bounds.viewport}`,
    ),
  );
}

async function validateAppearance({
  evaluate,
  wait,
  call,
  shot,
  screenshots,
  metrics,
}) {
  await evaluate(
    "document.querySelector('button[aria-label=\"切换为浅色主题\"]').click()",
  );
  await wait(() =>
    evaluate(
      "!!document.querySelector('button[aria-label=\"切换为深色主题\"]')",
    ),
  );
  await evaluate(
    "[...document.querySelectorAll('.toolbar button')].find(el=>el.textContent.trim()==='紧凑密度').click()",
  );
  await wait(() =>
    evaluate("document.documentElement.dataset.density==='compact'"),
  );
  screenshots.push(await shot("m2-attention-preferences-light-compact"));
  await validateReminderBudget({ evaluate, wait, shot, screenshots, metrics });
  await evaluate(
    "(()=>{const el=document.querySelector('.toolbar select');el.value='en-US';el.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await wait(() =>
    evaluate(
      "document.querySelector('details[data-attention-preferences]')?.textContent.toLowerCase().includes('notification')",
    ),
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 560,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const bounds = await evaluate(
    "(()=>{const el=document.querySelector('details[data-attention-preferences]');const r=el.getBoundingClientRect();return {x:r.x,right:r.right,viewport:innerWidth,scroll:el.scrollWidth,client:el.clientWidth,text:el.textContent}})()",
  );
  assert.ok(bounds.x >= 0 && bounds.right <= bounds.viewport + 1);
  assert.ok(bounds.scroll <= bounds.client + 2);
  assert.ok(
    bounds.text.includes("notification") ||
      bounds.text.includes("Notification"),
  );
  metrics.narrowViewport = bounds;
  screenshots.push(await shot("m2-attention-preferences-english-narrow"));
  await validateReminderBudget({ evaluate, wait, shot, screenshots, metrics });
  await call("Emulation.clearDeviceMetricsOverride");
  await evaluate(
    "(()=>{const el=document.querySelector('.toolbar select');el.value='zh-CN';el.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await wait(() =>
    evaluate(
      "!!document.querySelector('button[aria-label=\"切换为深色主题\"]')",
    ),
  );
  await evaluate(
    "document.querySelector('button[aria-label=\"切换为深色主题\"]').click()",
  );
  await evaluate(
    "[...document.querySelectorAll('.toolbar button')].find(el=>el.textContent.trim()==='正常密度').click()",
  );
  await wait(() =>
    evaluate("document.documentElement.dataset.density==='normal'"),
  );
}

export async function validateAttentionCold({
  evaluate,
  wait,
  checks,
  root,
  metrics,
}) {
  await wait(() => evaluate("!!window.desktop?.attention"));
  const cold = await snapshot(evaluate);
  assert.deepEqual(cold.preferences, metrics.persistedPreferences);
  assert.notEqual(cold.instanceId, metrics.snapshots.initial.instanceId);
  assert.equal(cold.openRequest, null);
  metrics.snapshots.cold = cold;
  checks.push(
    "notification preferences persist through a real cold App restart; no obsolete native click is replayed and the existing cold Thread remains read-only",
  );
  writeFileSync(
    join(root, "attention-result.json"),
    JSON.stringify(metrics, null, 2) + "\n",
  );
}
