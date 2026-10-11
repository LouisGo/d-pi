import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCdpClient } from "./cdp.mjs";

const root = process.env.D_PI_PERFORMANCE_ROOT;
assert(root, "Missing owned performance root");
const ready = JSON.parse(
  readFileSync(join(root, "production-probe-ready.json"), "utf8"),
);
const mode = process.argv[2] ?? "continuous";
assert(["continuous", "cumulative"].includes(mode));
const socket = new WebSocket(ready.target);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
const { call } = createCdpClient(socket);
await call("Performance.enable");
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const initial = await evaluate(
  "({visibility:document.visibilityState,events:window.__productionProbe.visibility,views:window.__productionProbe.views})",
);
assert.equal(initial.visibility, "hidden");
const startAt =
  mode === "continuous"
    ? initial.events.at(-1)?.at
    : initial.events.find((event) => event.state === "hidden")?.at;
assert.equal(initial.events.at(-1)?.state, "hidden");
const report = {
  applicationPid: ready.applicationPid,
  sourceRunStartAt: ready.startAt,
  startAt,
  targetDurationMs: 30 * 60 * 1000,
  completed: false,
  method: `${mode} actual document hidden; independent CDP and owned process-family samples; every visible interruption is retained`,
  samples: [],
};
if (mode === "cumulative" && existsSync(join(root, "background-prior.json"))) {
  const prior = JSON.parse(
    readFileSync(join(root, "background-prior.json"), "utf8"),
  );
  assert.equal(prior.applicationPid, ready.applicationPid);
  assert.equal(prior.sourceRunStartAt, ready.startAt);
  assert(
    prior.samples.every(
      (sample) =>
        sample.processes.some(
          (process) => process.pid === ready.applicationPid,
        ) &&
        sample.browser.views.filter((view) => view.control.streaming).length ===
          3,
    ),
  );
  report.samples = prior.samples;
}
function processes() {
  const lines = execFileSync("ps", ["-axo", "pid=,ppid=,rss=,time=,comm="], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  const entries = lines.map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    assert(match);
    return {
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rssKiB: Number(match[3]),
      cpuTime: match[4],
      executable: match[5],
    };
  });
  const owned = new Set([ready.applicationPid]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const entry of entries)
      if (owned.has(entry.ppid) && !owned.has(entry.pid)) {
        owned.add(entry.pid);
        changed = true;
      }
  }
  return entries.filter((entry) => owned.has(entry.pid));
}
while (true) {
  const browser = await evaluate(
    `(()=>{const probe=window.__productionProbe;return {at:Date.now(),visibility:document.visibilityState,visibilityEvents:probe.visibility,domNodes:document.querySelectorAll('*').length,runtimeEvents:probe.runtimeEvents,views:Object.values(probe.views).map(v=>({threadId:v.threadId,phase:v.phase,connectionGeneration:v.connectionGeneration,control:v.control})),longTasks:probe.longTasks,inputSamples:probe.inputSamples,composition:probe.composition};})()`,
  );
  if (mode === "continuous")
    assert.equal(
      browser.visibility,
      "hidden",
      "Window restored during continuous background measurement",
    );
  if (mode === "continuous")
    assert.equal(
      browser.visibilityEvents.at(-1)?.at,
      startAt,
      "Visibility changed during continuous background measurement",
    );
  assert.equal(
    browser.views.filter((v) => v.control?.streaming).length,
    3,
    "Actual native streams are not all busy",
  );
  const metrics = await call("Performance.getMetrics");
  const family = processes();
  assert(
    family.some((p) => p.pid === ready.applicationPid),
    "Owned application exited",
  );
  report.samples.push({
    browser,
    metrics: Object.fromEntries(
      metrics.metrics.map(({ name, value }) => [name, value]),
    ),
    processes: family,
  });
  report.endAt = browser.at;
  report.visibilityIntervals = browser.visibilityEvents
    .filter((event) => event.at >= startAt)
    .map((event, index, events) => ({
      state: event.state,
      startAt: event.at,
      endAt: events[index + 1]?.at ?? browser.at,
      durationMs: (events[index + 1]?.at ?? browser.at) - event.at,
    }));
  assert(
    report.visibilityIntervals.every((interval) => interval.durationMs >= 0),
  );
  report.wallClockDurationMs = browser.at - startAt;
  report.continuousHidden = report.visibilityIntervals.every(
    (interval) => interval.state === "hidden",
  );
  report.durationMs = report.visibilityIntervals
    .filter((interval) => interval.state === "hidden")
    .reduce((sum, interval) => sum + interval.durationMs, 0);
  report.longestContinuousHiddenMs = Math.max(
    ...report.visibilityIntervals
      .filter((interval) => interval.state === "hidden")
      .map((interval) => interval.durationMs),
  );
  report.completed = report.durationMs >= report.targetDurationMs;
  writeFileSync(
    join(root, "production-background.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `${mode} hidden ${Math.round(report.durationMs / 1000)}s; actual streams ${browser.views.filter((v) => v.control?.streaming).length}; DOM ${browser.domNodes}; family RSS ${family.reduce((s, p) => s + p.rssKiB, 0)}KiB`,
  );
  if (report.completed) break;
  await new Promise((resolve) => setTimeout(resolve, 30000));
}
socket.close();
