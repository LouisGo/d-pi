import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCdpClient } from "./cdp.mjs";
import { assertProbeRun } from "./production-performance-run-identity.mjs";

const root = process.env.D_PI_PERFORMANCE_ROOT;
assert(root);
assert.equal(
  JSON.parse(readFileSync(join(root, "production-background.json"))).completed,
  true,
);
const ready = JSON.parse(
  readFileSync(join(root, "production-probe-ready.json")),
);
const socket = new WebSocket(ready.target);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
const { call } = createCdpClient(socket);
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
try {
  assertProbeRun(
    JSON.parse(readFileSync(join(root, "production-background.json"))),
    ready,
  );
  const setup = await evaluate(
    `(${function setupInputTiming() {
      const editor = document.querySelector("[contenteditable=true]");
      if (
        document.hidden ||
        !editor?.editor ||
        !PerformanceObserver.supportedEntryTypes.includes("event")
      )
        throw Error("Visible actual Composer and Event Timing required");
      const probe = (window.__inputPaint = {
        entries: [],
        keys: [],
        inputCount: 0,
        startAt: Date.now(),
        beforeLength: editor.editor.getText().length,
      });
      probe.observer = new PerformanceObserver((list) =>
        probe.entries.push(
          ...list.getEntries().map((e) => ({
            name: e.name,
            startTime: e.startTime,
            processingStart: e.processingStart,
            processingEnd: e.processingEnd,
            duration: e.duration,
            interactionId: e.interactionId,
          })),
        ),
      );
      probe.observer.observe({ type: "event", durationThreshold: 16 });
      probe.keyListener = (event) => {
        if (event.target.closest("[contenteditable=true]") !== editor) return;
        probe.keys.push({
          name: event.type,
          key: event.key,
          timeStamp: event.timeStamp,
          trusted: event.isTrusted,
        });
      };
      probe.inputListener = (event) => {
        if (event.target.closest("[contenteditable=true]") === editor)
          probe.inputCount++;
      };
      editor.addEventListener("keydown", probe.keyListener, true);
      editor.addEventListener("keyup", probe.keyListener, true);
      editor.addEventListener("input", probe.inputListener, true);
      probe.sentinel = (event) => {
        if (event.key !== "F24") return;
        event.preventDefault();
        const until = performance.now() + 80;
        while (performance.now() < until) {}
      };
      editor.addEventListener("keydown", probe.sentinel, true);
      editor.editor.commands.focus("end");
      return {
        length: probe.beforeLength,
        streaming: Object.values(window.__productionProbe.views).filter(
          (v) => v.control.streaming,
        ).length,
      };
    }.toString()})()`,
  );
  assert(setup.length >= 20000);
  assert.equal(setup.streaming, 3);
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "F24",
    code: "F24",
    windowsVirtualKeyCode: 135,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "F24",
    code: "F24",
    windowsVirtualKeyCode: 135,
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const sentinel = await evaluate(
    "window.__inputPaint.entries.filter(e=>e.name==='keydown'&&Math.abs(e.startTime-window.__inputPaint.keys.find(k=>k.key==='F24'&&k.name==='keydown').timeStamp)<1)",
  );
  assert.equal(
    sentinel.length,
    1,
    "Event Timing positive control was not reported",
  );
  assert(sentinel[0].duration >= 64);
  await evaluate(
    "document.querySelector('[contenteditable=true]').removeEventListener('keydown',window.__inputPaint.sentinel,true);window.__inputPaint.entries=[];window.__inputPaint.keys=[];window.__inputPaint.inputCount=0;window.__inputPaint.sampleStart=Date.now();true",
  );
  for (let index = 0; index < 60; index++) {
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "x",
      code: "KeyX",
      text: "x",
      unmodifiedText: "x",
      windowsVirtualKeyCode: 88,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "x",
      code: "KeyX",
      windowsVirtualKeyCode: 88,
    });
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const actual = await evaluate(
    `(${function finishInputTiming() {
      const probe = window.__inputPaint,
        editor = document.querySelector("[contenteditable=true]");
      probe.observer.disconnect();
      editor.removeEventListener("keydown", probe.keyListener, true);
      editor.removeEventListener("keyup", probe.keyListener, true);
      editor.removeEventListener("input", probe.inputListener, true);
      return {
        entries: probe.entries,
        keys: probe.keys,
        inputCount: probe.inputCount,
        beforeLength: probe.beforeLength,
        afterLength: editor.editor.getText().length,
        startAt: probe.sampleStart,
        endAt: Date.now(),
        visibility: document.visibilityState,
        streaming: Object.values(window.__productionProbe.views).filter(
          (v) => v.control.streaming,
        ).length,
      };
    }.toString()})()`,
  );
  assert.equal(actual.visibility, "visible");
  assert.equal(actual.streaming, 3);
  assert.equal(actual.inputCount, 60);
  assert.equal(actual.afterLength - actual.beforeLength, 60);
  assert.equal(actual.keys.length, 120);
  assert(actual.keys.every((key) => key.trusted));
  const selectionBefore = await evaluate(
    `(()=>{const element=document.querySelector('[contenteditable=true]');window.__inputPaint.editorElement=element;element.editor.commands.setTextSelection({from:20,to:80});return {at:Date.now(),from:element.editor.state.selection.from,to:element.editor.state.selection.to,focused:element.contains(document.activeElement)};})()`,
  );
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const selectionAfter = await evaluate(
    `(()=>{const element=document.querySelector('[contenteditable=true]');return {at:Date.now(),from:element.editor.state.selection.from,to:element.editor.state.selection.to,focused:element.contains(document.activeElement),sameElement:element===window.__inputPaint.editorElement,streaming:Object.values(window.__productionProbe.views).filter(v=>v.control.streaming).length};})()`,
  );
  assert.equal(selectionBefore.focused, true);
  assert.equal(selectionAfter.focused, true);
  assert.equal(selectionAfter.sameElement, true);
  assert.equal(selectionAfter.streaming, 3);
  assert.equal(selectionAfter.from, selectionBefore.from);
  assert.equal(selectionAfter.to, selectionBefore.to);
  const samples = actual.keys
    .filter((key) => key.name === "keydown")
    .map((key) => {
      const pair = actual.keys.find(
        (other) => other.name === "keyup" && other.timeStamp >= key.timeStamp,
      );
      const entries = [key, pair]
        .map((event) =>
          actual.entries.find(
            (entry) =>
              entry.name === event.name &&
              Math.abs(entry.startTime - event.timeStamp) < 1,
          ),
        )
        .filter(Boolean);
      // Unreported future entries are below the 16ms observation threshold.
      // Use 24ms conservatively for censoring and +8ms for reported rounding;
      // never present the censored values as exact latency samples.
      return {
        startTime: key.timeStamp,
        reported: entries,
        upperBoundMs: Math.max(
          24,
          ...entries.map((entry) => entry.duration + 8),
        ),
      };
    });
  const bounds = samples
    .map((sample) => sample.upperBoundMs)
    .sort((a, b) => a - b);
  const p95UpperBoundMs = bounds[Math.ceil(bounds.length * 0.95) - 1];
  const report = {
    applicationPid: ready.applicationPid,
    sourceRunStartAt: ready.startAt,
    method:
      "Browser trusted keydown/keyup Event Timing to next rendering update, CDP injected input; 16ms censoring and conservative 8ms rounding allowance. Excludes host transport and physical keyboard latency.",
    reference: "https://www.w3.org/TR/event-timing/",
    positiveControl: sentinel,
    idleComposerSelection: {
      before: selectionBefore,
      after: selectionAfter,
      scope:
        "Actual ProseMirror selection and focus while native streams advance; not reading-window scroll or OS selection proof.",
    },
    actual,
    samples,
    p95UpperBoundMs,
    targetMs: 50,
    passed: p95UpperBoundMs <= 50,
  };
  writeFileSync(
    join(root, "production-input-paint.json"),
    JSON.stringify(report, null, 2),
  );
  assert(
    report.passed,
    `Input-to-next-paint p95 upper bound ${p95UpperBoundMs}ms exceeds 50ms`,
  );
  console.log(
    JSON.stringify({
      p95UpperBoundMs,
      samples: samples.length,
      reportedEntries: actual.entries.length,
      composerLength: actual.afterLength,
    }),
  );
} finally {
  socket.close();
}
