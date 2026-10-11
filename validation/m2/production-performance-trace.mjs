import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCdpClient } from "./cdp.mjs";

// Connect only to the explicitly recorded, owned production fixture. Chrome's
// native trace is observational; it does not change App/OMP execution policy.
const root = process.env.D_PI_PERFORMANCE_ROOT;
assert(root, "Missing owned performance root");
const ready = JSON.parse(
  readFileSync(join(root, "production-probe-ready.json"), "utf8"),
);
const seconds = Number(process.argv[2] ?? 45);
assert(Number.isInteger(seconds) && seconds >= 1 && seconds <= 60);
const label = process.argv[3] ?? "background";
assert(/^[a-z-]+$/.test(label));
const socket = new WebSocket(ready.target);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
const { call } = createCdpClient(socket);
async function visibility() {
  const result = await call("Runtime.evaluate", {
    expression:
      "({at:Date.now(),state:document.visibilityState,event:window.__productionProbe.visibility.at(-1)??null})",
    returnByValue: true,
  });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const visibilityBefore = await visibility();
if (label.startsWith("hidden")) assert.equal(visibilityBefore.state, "hidden");
let completed;
const completion = new Promise((resolve) => {
  completed = resolve;
});
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Tracing.tracingComplete") completed(message.params);
});
const categories = [
  "toplevel",
  "ipc",
  "electron",
  "devtools.timeline",
  "blink.user_timing",
  "v8",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-v8.cpu_profiler",
];
await call("Tracing.start", {
  categories: categories.join(","),
  transferMode: "ReturnAsStream",
  options: "record-until-full",
});
const startAt = Date.now();
console.log(
  `Actual production ${label} trace started ${new Date(startAt).toISOString()}`,
);
await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
await call("Tracing.end");
const result = await completion;
assert(result.stream, "Missing actual Chrome trace stream");
assert(!result.dataLossOccurred, "Trace buffer lost events");
let trace = "";
while (true) {
  const chunk = await call("IO.read", {
    handle: result.stream,
    size: 1024 * 1024,
  });
  trace += chunk.base64Encoded
    ? Buffer.from(chunk.data, "base64").toString()
    : chunk.data;
  if (chunk.eof) break;
}
await call("IO.close", { handle: result.stream });
const path = join(root, `production-${label}-trace.json`);
writeFileSync(path, trace);
const events = JSON.parse(trace).traceEvents;
const visibilityAfter = await visibility();
const counts = {};
for (const event of events) counts[event.name] = (counts[event.name] ?? 0) + 1;
assert(
  events.some(
    (event) =>
      event.name === "process_name" &&
      event.args?.name === "Browser" &&
      event.pid === ready.applicationPid,
  ),
  "Actual trace belongs to a different Main process",
);
const summary = {
  applicationPid: ready.applicationPid,
  sourceRunStartAt: ready.startAt,
  label,
  startAt,
  endAt: Date.now(),
  seconds,
  categories,
  bytes: Buffer.byteLength(trace),
  events: events.length,
  dataLossOccurred: result.dataLossOccurred ?? false,
  visibilityBefore,
  visibilityAfter,
  processNames: events
    .filter((e) => e.name === "process_name")
    .map((e) => ({ pid: e.pid, name: e.args?.name })),
  counts,
};
writeFileSync(
  join(root, `production-${label}-trace-summary.json`),
  JSON.stringify(summary, null, 2),
);
console.log(
  JSON.stringify({
    path,
    bytes: summary.bytes,
    events: summary.events,
    dataLossOccurred: summary.dataLossOccurred,
  }),
);
socket.close();
if (label.startsWith("hidden")) {
  assert.equal(visibilityAfter.state, "hidden");
  assert.deepEqual(
    visibilityAfter.event,
    visibilityBefore.event,
    "Window visibility changed during trace",
  );
}
