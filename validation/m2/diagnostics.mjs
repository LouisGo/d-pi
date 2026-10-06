import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { captureClipboard } from "./clipboard.mjs";
import { waitForEnabledAction } from "./wait.mjs";

const secret = "M2_DIAGNOSTIC_PRIVATE_SECRET";
const panel = "[data-diagnostics-panel]";
const field = (name) => `[data-diagnostics-filter=${name}]`;
const action = (name) =>
  name === "open"
    ? '[data-diagnostics-trigger="global"]'
    : name === "close"
      ? "[data-diagnostics-close]"
      : `[data-diagnostics-${name}]`;

/** Fixtures are labelled synthetic; real operation trace assertions use existing App logs. */
export function createDiagnosticFixture(threadA, threadB) {
  const traceId = randomUUID();
  const writer = randomUUID();
  const otherWriter = randomUUID();
  const time = new Date().toISOString();
  const record = (override = {}) => ({
    schemaVersion: 1,
    time,
    process: "main",
    processInstanceId: writer,
    build: {
      version: "fixture",
      commit: "fixture",
      dirty: false,
      id: "fixture",
    },
    traceId,
    requestId: "fixture-request",
    connectionId: "fixture-connection",
    operation: "fixture-diagnostic",
    stage: "completed",
    threadId: threadA,
    ...override,
  });
  const records = [
    record({ stage: "received" }),
    record(),
    record({ threadId: threadB, processInstanceId: otherWriter }),
    record({
      stage: "failed",
      code: `Bearer ${secret}`,
      causeCode: `/Users/private/${secret}`,
      businessText: secret,
      token: secret,
      url: `https://private.invalid/?token=${secret}`,
      build: {
        version: "fixture",
        commit: "fixture",
        dirty: false,
        id: `/Users/private/${secret}`,
      },
    }),
  ];
  return {
    traceId,
    writer,
    otherWriter,
    time,
    records,
    text:
      records.map((record) => JSON.stringify(record)).join("\n") +
      "\n{broken-json\n[]\n",
  };
}

function scope(traceId, overrides = {}) {
  return {
    since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    until: new Date(Date.now() + 60_000).toISOString(),
    limit: 500,
    ...(traceId ? { traceId } : {}),
    ...overrides,
  };
}

async function query(evaluate, filter) {
  const traceId = randomUUID();
  const reply = await evaluate(
    `window.desktop.diagnostics.request(${JSON.stringify({ kind: "query", traceId, filter })})`,
  );
  assert.equal(
    reply.traceId,
    traceId,
    "shipped bridge must retain request identity",
  );
  assert.equal(reply.kind, "snapshot", JSON.stringify(reply));
  assert.deepEqual(reply.snapshot.filter, filter);
  return reply.snapshot;
}

async function open(evaluate, wait, trigger = action("open")) {
  await wait(() => evaluate(`!!document.querySelector('${trigger}')`));
  await evaluate(`document.querySelector('${trigger}').click()`);
  await wait(() => evaluate(`!!document.querySelector('${panel}')`));
}

async function close(evaluate, wait) {
  await evaluate(`document.querySelector('${action("close")}').click()`);
  await wait(() => evaluate(`!document.querySelector('${panel}')`));
}

async function setField(evaluate, name, value) {
  await evaluate(`(()=>{
    const el=document.querySelector('${field(name)}');
    if(!el) throw Error('Missing diagnostic field: ${name}');
    const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});
    el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
  })()`);
}

async function refresh(evaluate, wait) {
  await waitForEnabledAction(
    evaluate,
    wait,
    action("refresh"),
    "diagnostics refresh available",
  );
  const previous = await evaluate(
    "document.querySelector('[data-diagnostics-snapshot]')?.textContent",
  );
  await evaluate(`document.querySelector('${action("refresh")}').click()`);
  await wait(
    () =>
      evaluate(
        `!!document.querySelector('[data-diagnostics-snapshot]') && document.querySelector('${action("refresh")}')?.disabled === false && document.querySelector('[data-diagnostics-snapshot]').textContent!==${JSON.stringify(previous)}`,
      ),
    30000,
    "diagnostics refreshed snapshot",
  );
}

async function apply(evaluate, wait, traceId) {
  // A newly opened panel samples automatically. Wait for that read before
  // issuing another scope: Main deliberately bounds concurrent diagnostics.
  await waitForEnabledAction(
    evaluate,
    wait,
    action("refresh"),
    "diagnostics initial sampling",
  );
  await setField(
    evaluate,
    "until",
    await evaluate(
      "(()=>{const d=new Date(Date.now()+60000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19)})()",
    ),
  );
  await evaluate("document.querySelector('[data-diagnostics-apply]').click()");
  await wait(
    () =>
      evaluate(
        `document.querySelector('[data-diagnostics-feedback]')?.value.includes(${JSON.stringify(traceId)}) && !!document.querySelector('[data-diagnostics-snapshot]') && document.querySelector('${action("refresh")}')?.disabled === false`,
      ),
    30000,
    "diagnostics applied scope snapshot",
  );
}

export async function validateDiagnosticsEntry({
  evaluate,
  wait,
  checks,
  startupFailure = false,
}) {
  if (startupFailure)
    await wait(() => evaluate("!!document.querySelector('.startup.failure')"));
  await open(
    evaluate,
    wait,
    startupFailure ? '[data-diagnostics-trigger="trace"]' : action("open"),
  );
  await refresh(evaluate, wait);
  if (startupFailure) {
    const failedTrace = await evaluate(
      "document.querySelector('[data-diagnostics-filter=traceId]').value",
    );
    assert.match(failedTrace, /^[a-f0-9-]{36}$/);
    await wait(async () => {
      const sample = await query(evaluate, scope(failedTrace));
      return sample.records.some((record) => record.stage === "failed");
    });
    await refresh(evaluate, wait);
    assert.ok(
      await evaluate(
        `document.querySelector('[data-diagnostics-snapshot]')?.textContent.includes(${JSON.stringify(failedTrace)})`,
      ),
    );
    assert.ok(
      await evaluate(
        "document.querySelector('[data-diagnostics-snapshot]')?.textContent.includes('failed')",
      ),
    );
    checks.push(
      "actual startup error trace shortcut scopes the shipped panel to the same failed Main/preload operation",
    );
  }
  await close(evaluate, wait);
  checks.push(
    startupFailure
      ? "packaged startup failure from isolated corrupt SQLite retains global diagnostics and readable Main logs without deleting or repairing the failed database"
      : "packaged global diagnostics opens and queries before project execution is granted",
  );
}

export async function validateDiagnostics({
  data,
  root,
  env,
  threadA,
  threadB,
  evaluate,
  wait,
  call,
  shot,
  screenshots,
  checks,
  nativeInspection = false,
}) {
  const logDirectory = join(data, "logs");
  const logFile = join(logDirectory, "main.jsonl");
  const actual = await wait(() => {
    const records = readFileSync(logFile, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    return records.find(
      (record) =>
        record.threadId === threadA &&
        record.operation === "submit" &&
        record.stage === "acknowledged",
    );
  });
  const actualSnapshot = await query(evaluate, scope(actual.traceId));
  assert.ok(actualSnapshot.records.length >= 3);
  assert.ok(
    actualSnapshot.records.every((record) => record.traceId === actual.traceId),
  );
  for (const stage of ["prepared", "dispatching", "acknowledged"])
    assert.ok(
      actualSnapshot.records.some((record) => record.stage === stage),
      `Missing real submit stage: ${stage}`,
    );
  const metadata = {
    actualTrace: actual.traceId,
    actualThread: threadA,
    actualStages: actualSnapshot.records.map((record) => record.stage),
    initialWriter: actualSnapshot.writer,
    fixtureKind:
      "synthetic malformed/redaction/bounded-reader input, never provider or operation proof",
    snapshots: {},
  };
  writeFileSync(
    join(root, "diagnostics-real-trace.json"),
    JSON.stringify(actualSnapshot, null, 2),
  );
  checks.push(
    "shipped Main/preload diagnostics bridge retrieves existing real packaged submission trace and its prepared/dispatching/acknowledged stages",
  );

  const fixture = createDiagnosticFixture(threadA, threadB);
  writeFileSync(join(root, "diagnostics-synthetic-log.jsonl"), fixture.text, {
    mode: 0o600,
  });
  writeFileSync(
    join(root, "diagnostics-progress.json"),
    JSON.stringify({ kind: "in-progress", ...metadata }, null, 2),
  );
  const fixtureFile = join(logDirectory, `main-${Date.now()}.jsonl`);
  writeFileSync(fixtureFile, fixture.text, { mode: 0o600 });
  try {
    const all = await query(evaluate, scope(fixture.traceId));
    assert.ok(all.records.length >= 3);
    assert.ok(all.coverage.malformed >= 2);
    assert.ok(all.coverage.redacted >= 1);
    assert.ok(!JSON.stringify(all).includes(secret));
    assert.ok(!JSON.stringify(all).includes("private.invalid"));
    assert.ok(!JSON.stringify(all).includes("businessText"));
    metadata.snapshots.sanitized = all;
    const filters = [
      [
        "thread",
        { threadId: threadB },
        (record) => record.threadId === threadB,
      ],
      [
        "writer",
        { processInstanceId: fixture.otherWriter },
        (record) => record.processInstanceId === fixture.otherWriter,
      ],
      ["stage", { stage: "received" }, (record) => record.stage === "received"],
    ];
    for (const [name, filter, matches] of filters) {
      const snapshot = await query(evaluate, scope(fixture.traceId, filter));
      assert.ok(snapshot.records.length > 0);
      assert.ok(snapshot.records.every(matches));
      metadata.snapshots[name] = snapshot;
    }
    const noMatch = await query(evaluate, scope(randomUUID()));
    assert.equal(noMatch.records.length, 0);
    const before = await query(
      evaluate,
      scope(fixture.traceId, {
        since: "2000-01-01T00:00:00.000Z",
        until: "2000-01-02T00:00:00.000Z",
      }),
    );
    assert.equal(before.records.length, 0);
    const limited = await query(evaluate, scope(fixture.traceId, { limit: 1 }));
    assert.equal(limited.records.length, 1);
    assert.equal(limited.coverage.truncated, true);
    metadata.snapshots.limited = limited;
    writeFileSync(
      join(root, "diagnostics-progress.json"),
      JSON.stringify({ kind: "in-progress", ...metadata }, null, 2),
    );
    checks.push(
      "shipped reader filters trace/time/Thread/Writer/stage, distinguishes no match and result limit, reports malformed/redacted rows, and excludes injected secrets, paths, URLs and business fields",
    );

    await open(evaluate, wait);
    await setField(evaluate, "traceId", fixture.traceId);
    await apply(evaluate, wait, fixture.traceId);
    await wait(() =>
      evaluate(
        `document.querySelector('[data-diagnostics-snapshot]' )?.textContent.includes(${JSON.stringify(fixture.traceId)})`,
      ),
    );
    for (const [name, value, expected] of [
      ["threadId", threadB, threadB],
      ["processInstanceId", fixture.otherWriter, fixture.otherWriter],
      ["stage", "received", "received"],
    ]) {
      await setField(evaluate, name, value);
      await apply(evaluate, wait, fixture.traceId);
      const shown = await evaluate(
        "[...document.querySelectorAll('[data-diagnostics-record]')].map(el=>el.textContent)",
      );
      assert.ok(
        shown.length > 0 && shown.every((text) => text.includes(expected)),
      );
      await setField(evaluate, name, "");
    }
    const emptyTrace = randomUUID();
    await setField(evaluate, "traceId", emptyTrace);
    await apply(evaluate, wait, emptyTrace);
    assert.equal(
      await evaluate(
        "document.querySelectorAll('[data-diagnostics-record]').length",
      ),
      0,
    );
    assert.ok(
      !(await evaluate(
        `document.querySelector('[data-diagnostics-snapshot]' )?.textContent.includes(${JSON.stringify(fixture.traceId)})`,
      )),
    );
    await setField(evaluate, "traceId", fixture.traceId);
    await setField(evaluate, "limit", "1");
    await apply(evaluate, wait, fixture.traceId);
    assert.equal(
      await evaluate(
        "document.querySelectorAll('[data-diagnostics-record]').length",
      ),
      1,
    );
    assert.ok(
      await evaluate(
        "!![...document.querySelectorAll('[data-diagnostics-snapshot] [role=status]')].find(el=>el.textContent.includes('范围'))",
      ),
    );
    await setField(evaluate, "limit", "500");
    await apply(evaluate, wait, fixture.traceId);
    assert.ok(
      await evaluate(
        "document.querySelector('[data-diagnostics-coverage]')?.textContent.includes('脱敏') && document.querySelector('[data-diagnostics-coverage]')?.textContent.includes('坏行')",
      ),
    );
    screenshots.push(await shot("m2-diagnostics-redacted-dark-normal"));
    checks.push(
      "packaged GUI refresh removes old-scope rows and explicitly renders bounded/truncated, malformed and redacted coverage",
    );

    await close(evaluate, wait);
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
      evaluate(
        "[...document.querySelectorAll('.toolbar button')].some(el=>el.textContent.trim()==='正常密度')",
      ),
    );
    await open(evaluate, wait);
    await setField(evaluate, "traceId", fixture.traceId);
    await apply(evaluate, wait, fixture.traceId);
    screenshots.push(await shot("m2-diagnostics-light-compact"));
    await close(evaluate, wait);
    await evaluate(
      "(()=>{const el=document.querySelector('.toolbar select');el.value='en-US';el.dispatchEvent(new Event('change',{bubbles:true}))})()",
    );
    await wait(() =>
      evaluate(
        "document.querySelector('[data-diagnostics-trigger=global]')?.textContent.trim()==='Diagnostics and feedback'",
      ),
    );
    await open(evaluate, wait);
    await refresh(evaluate, wait);
    assert.ok(
      await evaluate(
        "document.querySelector('[data-diagnostics-feedback]').value.includes('d-pi') && document.querySelector('[data-diagnostics-panel]')?.textContent.includes('Export')",
      ),
    );
    await call("Emulation.setDeviceMetricsOverride", {
      width: 560,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const narrow = await evaluate(
      `(()=>{const el=document.querySelector('${panel}');el.focus();const r=el.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,viewport:innerWidth,scroll:el.scrollWidth,client:el.clientWidth,focus:document.activeElement===el}})()`,
    );
    assert.ok(narrow.x >= 0 && narrow.right <= narrow.viewport);
    assert.ok(narrow.scroll <= narrow.client + 2);
    assert.equal(narrow.focus, true);
    metadata.narrowViewport = narrow;
    screenshots.push(await shot("m2-diagnostics-english-narrow"));
    for (const type of ["keyDown", "keyUp"])
      await call("Input.dispatchKeyEvent", {
        type,
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
        nativeVirtualKeyCode: 53,
      });
    await wait(() => evaluate(`!document.querySelector('${panel}')`));
    assert.equal(
      await evaluate(
        "document.activeElement===document.querySelector('[data-diagnostics-trigger=global]')",
      ),
      true,
    );
    await call("Emulation.clearDeviceMetricsOverride");
    await evaluate(
      "(()=>{const el=document.querySelector('.toolbar select');el.value='zh-CN';el.dispatchEvent(new Event('change',{bubbles:true}))})()",
    );
    await wait(() =>
      evaluate(
        "document.querySelector('[data-diagnostics-trigger=global]')?.textContent.trim()==='诊断与反馈'",
      ),
    );
    await evaluate(
      "document.querySelector('button[aria-label=\"切换为深色主题\"]').click()",
    );
    await wait(() =>
      evaluate(
        "!!document.querySelector('button[aria-label=\"切换为浅色主题\"]')",
      ),
    );
    await evaluate(
      "[...document.querySelectorAll('.toolbar button')].find(el=>el.textContent.trim()==='正常密度').click()",
    );
    await wait(() =>
      evaluate(
        "[...document.querySelectorAll('.toolbar button')].some(el=>el.textContent.trim()==='紧凑密度')",
      ),
    );
    await open(evaluate, wait);
    await setField(evaluate, "traceId", fixture.traceId);
    await apply(evaluate, wait, fixture.traceId);
    checks.push(
      "actual packaged diagnostic controls retain queries across theme/density/language changes; narrow Chromium viewport stays bounded and trusted Escape returns focus to the global trigger",
    );

    const feedback = await evaluate(
      "document.querySelector('[data-diagnostics-feedback]').value",
    );
    assert.ok(feedback.includes(fixture.traceId));
    assert.ok(!feedback.includes(secret));
    const clipboard = captureClipboard({ env, temporary: root });
    try {
      await call("Page.bringToFront");
      const point = await evaluate(
        `(()=>{const el=document.querySelector('${action("copy")}');el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
      );
      clipboard.beforeCopy();
      for (const type of ["mousePressed", "mouseReleased"])
        await call("Input.dispatchMouseEvent", {
          type,
          button: "left",
          clickCount: 1,
          ...point,
        });
      await wait(() => {
        const copied = spawnSync("/usr/bin/pbpaste", [], {
          env,
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        });
        assert.equal(copied.status, 0);
        return copied.stdout === feedback;
      });
      clipboard.markOwnedCopy(feedback);
      metadata.feedback = {
        length: feedback.length,
        sha256: createHash("sha256").update(feedback).digest("hex"),
      };
      checks.push(
        "trusted packaged Copy writes the reviewed sanitized feedback template to native macOS clipboard with safe snapshot and ownership-based restoration",
      );
    } finally {
      metadata.clipboardRestoration = clipboard.restore().kind;
    }

    if (nativeInspection)
      metadata.nativeExport = await inspectNativeExport({
        root,
        evaluate,
        wait,
        checks,
      });
    await close(evaluate, wait);

    const budgetFile = join(logDirectory, `main-${Date.now() + 1}.jsonl`);
    writeFileSync(
      budgetFile,
      "x".repeat(9 * 1024 * 1024) +
        "\n" +
        JSON.stringify(fixture.records[0]) +
        "\n",
      { mode: 0o600 },
    );
    try {
      const started = performance.now();
      const bounded = await query(evaluate, scope(fixture.traceId));
      assert.equal(bounded.coverage.truncated, true);
      assert.ok(bounded.coverage.bytes <= 8 * 1024 * 1024);
      assert.ok(bounded.records.length <= 500);
      metadata.readBudget = {
        sourceBytes: 9 * 1024 * 1024,
        elapsedMs: performance.now() - started,
        coverage: bounded.coverage,
      };
      await open(evaluate, wait);
      await setField(evaluate, "traceId", fixture.traceId);
      await apply(evaluate, wait, fixture.traceId);
      assert.ok(
        await evaluate(
          "!![...document.querySelectorAll('[data-diagnostics-snapshot] [role=status]')].find(el=>el.textContent.includes('预算'))",
        ),
      );
      screenshots.push(await shot("m2-diagnostics-scan-budget"));
      await close(evaluate, wait);
      checks.push(
        "a labelled 9 MiB isolated log with an oversized line is scanned within the 8 MiB reader bound, retains bounded records and reports incomplete coverage in the packaged GUI",
      );
    } finally {
      rmSync(budgetFile, { force: true });
    }
  } finally {
    rmSync(fixtureFile, { force: true });
  }

  if (!nativeInspection) {
    metadata.nativeExport = {
      kind: "not-run",
      requiredFlag: "--diagnostics-inspect",
    };
    metadata.writerFailure = {
      kind: "not-run",
      reason:
        "real failure opens native warning, handled by --diagnostics-inspect checkpoint",
    };
    writeFileSync(
      join(root, "diagnostics-result.json"),
      JSON.stringify(metadata, null, 2) + "\n",
    );
    return metadata;
  }
  // Force a real asynchronous Writer error only in this controlled App data root.
  // Preserve all existing logs and restore the path before querying degraded state.
  const preserved = join(data, "logs-before-writer-failure");
  renameSync(logDirectory, preserved);
  writeFileSync(logDirectory, "controlled-writer-failure", { mode: 0o600 });
  try {
    await evaluate(
      `window.desktop.request({kind:'list-threads',traceId:${JSON.stringify(randomUUID())}})`,
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
  } finally {
    rmSync(logDirectory, { force: true });
    renameSync(preserved, logDirectory);
  }
  await nativeCheckpoint({
    root,
    operation: "writer-warning",
    instructions:
      "Inspect the isolated App's actual native Writer failure warning and dismiss it. Do not repair the database or alter the product. Then create resumeFile.",
  });
  const degraded = await query(evaluate, scope(actual.traceId));
  assert.equal(degraded.writer.degraded, true);
  assert.ok(degraded.writer.dropped > 0);
  metadata.snapshots.degraded = degraded;
  await open(evaluate, wait);
  await refresh(evaluate, wait);
  assert.ok(
    await evaluate(
      "document.querySelector('[data-diagnostics-writer]')?.textContent.includes('已退化')",
    ),
  );
  screenshots.push(await shot("m2-diagnostics-writer-degraded"));
  await close(evaluate, wait);
  checks.push(
    "a real isolated Writer path failure preserves App operation and previous logs; shipped query and GUI expose degraded state and dropped evidence",
  );
  writeFileSync(
    join(root, "diagnostics-result.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
  return metadata;
}

async function nativeCheckpoint({
  root,
  operation,
  instructions,
  exportFile,
  beforeWait,
}) {
  const resumeFile = join(root, `diagnostics-${operation}-continue`);
  const checkpoint = join(root, `diagnostics-${operation}-checkpoint.json`);
  const expiresAt = new Date(Date.now() + 300000).toISOString();
  const notice = {
    root,
    operation,
    exportFile,
    resumeFile,
    expiresAt,
    instructions,
  };
  writeFileSync(checkpoint, JSON.stringify(notice, null, 2));
  await beforeWait?.();
  console.log(JSON.stringify({ checkpoint, ...notice }));
  while (!existsSync(resumeFile)) {
    if (Date.now() > Date.parse(expiresAt))
      throw Error(`Native diagnostics ${operation} checkpoint timeout`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function inspectNativeExport({ root, evaluate, wait, checks }) {
  const exportFile = join(root, "diagnostics-export.json");
  const results = {};
  for (const operation of ["save", "cancel"]) {
    await nativeCheckpoint({
      root,
      operation,
      exportFile,
      instructions:
        operation === "save"
          ? "Inspect this isolated App's actual macOS Save dialog; save to exportFile through the native UI, then create resumeFile. Do not patch the product bridge or dialog."
          : "Inspect this isolated App's actual macOS Save dialog and Cancel; confirm the visible cancellation status, then create resumeFile.",
      // .click drives the real product action; the pending native dialog stays intact.
      beforeWait: () =>
        evaluate(`document.querySelector('${action("export")}').click()`),
    });
    await wait(() =>
      evaluate(`!document.querySelector('${action("export")}')?.disabled`),
    );
    results[operation] = await evaluate(
      "document.querySelector('[data-diagnostics-command-result]')?.textContent",
    );
    assert.ok(
      results[operation],
      "native export must leave a visible terminal status",
    );
    assert.ok(
      results[operation].includes(operation === "save" ? "已导出" : "已取消"),
    );
    if (operation === "save") {
      assert.ok(
        existsSync(exportFile),
        "native positive-path save did not create the requested file",
      );
      const bytes = readFileSync(exportFile);
      const exported = JSON.parse(bytes);
      assert.ok(!bytes.includes(Buffer.from(secret)));
      assert.ok(!bytes.includes(Buffer.from("private.invalid")));
      assert.ok(!bytes.includes(Buffer.from("businessText")));
      assert.ok(exported.snapshot?.coverage ?? exported.coverage);
      assert.ok(exported.snapshot.records.length > 0);
      assert.equal(statSync(exportFile).mode & 0o777, 0o600);
      results.sha256 = createHash("sha256").update(bytes).digest("hex");
      results.bytes = bytes.length;
    } else {
      assert.equal(
        createHash("sha256").update(readFileSync(exportFile)).digest("hex"),
        results.sha256,
      );
    }
  }
  checks.push(
    "actual macOS Save and Cancel checkpoints complete through the packaged Main-controlled dialog; saved JSON is sanitized and cancellation preserves the earlier export",
  );
  return results;
}

/** The parent launches the same candidate with this additional isolated failure root. */
export function prepareDiagnosticStartupFailure(root) {
  const data = join(root, "diagnostics-startup-failure");
  mkdirSync(data, { recursive: true });
  writeFileSync(join(data, "drafts.sqlite"), "controlled-invalid-sqlite", {
    mode: 0o600,
  });
  return data;
}
