import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCdpClient } from "./cdp.mjs";

const root = process.env.D_PI_PERFORMANCE_ROOT;
assert(root);
const ready = JSON.parse(
  readFileSync(join(root, "production-probe-ready.json"), "utf8"),
);
const dataset = JSON.parse(readFileSync(join(root, "dataset.json"), "utf8"));
const source = readFileSync(join(root, "out/preload/index.cjs"), "utf8");
const socket = new WebSocket(ready.target);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
const { call } = createCdpClient(socket);
const evaluate = async (expression) => {
  const result = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
// This probe deliberately adds read demand. Run only after the continuous
// hidden interval, with the actual production conversation visible.
assert.equal(await evaluate("document.visibilityState"), "visible");
await evaluate(
  `window.__coverageConsumers=[];window.__coverageArrivals=0;window.__coverageDeliveries=0;window.__coverageBase=window.desktop.conversation.connect(${JSON.stringify(dataset.records[0].threadId)},()=>window.__coverageArrivals++);true`,
);
await call("Profiler.enable");
await call("Profiler.startPreciseCoverage", {
  callCount: true,
  detailed: true,
});
const phases = [];
try {
  for (const extraConsumers of [0, 10]) {
    if (extraConsumers)
      await evaluate(
        `for(let i=0;i<10;i++)window.__coverageConsumers.push(window.desktop.conversation.connect(${JSON.stringify(dataset.records[0].threadId)},()=>window.__coverageDeliveries++));true`,
      );
    await call("Profiler.takePreciseCoverage");
    const before = await evaluate(
      "({at:Date.now(),runtimeEvents:window.__productionProbe.runtimeEvents,arrivals:window.__coverageArrivals,extraDeliveries:window.__coverageDeliveries,visibility:document.visibilityState})",
    );
    await new Promise((resolve) => setTimeout(resolve, 15000));
    const coverage = await call("Profiler.takePreciseCoverage");
    const after = await evaluate(
      "({at:Date.now(),runtimeEvents:window.__productionProbe.runtimeEvents,arrivals:window.__coverageArrivals,extraDeliveries:window.__coverageDeliveries,visibility:document.visibilityState})",
    );
    const preload = coverage.result.find((s) =>
      s.url.endsWith("/out/preload/index.cjs"),
    );
    assert(
      preload,
      "Actual production Preload script missing from V8 coverage",
    );
    const functions = preload.functions
      .filter((f) => f.ranges[0].count > 0)
      .map((f) => ({
        name: f.functionName,
        count: f.ranges[0].count,
        start: f.ranges[0].startOffset,
        end: f.ranges[0].endOffset,
        source: source.slice(
          f.ranges[0].startOffset,
          Math.min(f.ranges[0].endOffset, f.ranges[0].startOffset + 200),
        ),
      }));
    const arrivals = after.arrivals - before.arrivals;
    const deliveries = after.extraDeliveries - before.extraDeliveries;
    assert(arrivals > 0, "Actual conversation stream delivered no events");
    assert.equal(deliveries, arrivals * extraConsumers);
    const handler = functions.find((f) => f.name === "port.onmessage");
    const parse = functions.find(
      (f) =>
        f.name === "safeParse" &&
        f.source.includes("return safeParse(this, data, params)"),
    );
    assert(handler, "Actual conversation handler missing");
    assert(parse, "Actual schema safeParse method missing");
    assert.equal(handler.count, arrivals);
    // With no tool readers and no changing control facts, these arrivals are the
    // only safeParse callers. Fail instead of conflating unrelated IPC traffic.
    assert.equal(after.runtimeEvents, before.runtimeEvents);
    assert.equal(parse.count, arrivals);
    phases.push({
      extraConsumers,
      arrivals,
      deliveries,
      before,
      after,
      functions,
    });
  }
  writeFileSync(
    join(root, "production-preload-coverage.json"),
    JSON.stringify(
      {
        applicationPid: ready.applicationPid,
        sourceRunStartAt: ready.startAt,
        method:
          "V8 actual call-count coverage; bounded observation can affect optimization and is not input-latency measurement",
        phases,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      phases.map((p) => ({
        extraConsumers: p.extraConsumers,
        before: p.before,
        after: p.after,
        functions: p.functions.filter(
          (f) =>
            f.source.includes("schema.safeParse") ||
            f.name === "safeParse" ||
            f.name === "deliver",
        ),
      })),
      null,
      2,
    ),
  );
} finally {
  try {
    await evaluate(
      "window.__coverageConsumers.forEach(release=>release());window.__coverageBase();delete window.__coverageConsumers;delete window.__coverageBase;true",
    );
    await call("Profiler.stopPreciseCoverage");
    await call("Profiler.disable");
  } finally {
    socket.close();
  }
}
