import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { assertProbeRun } from "./production-performance-run-identity.mjs";

const root = process.env.D_PI_PERFORMANCE_ROOT;
assert(root);
const read = (name) => JSON.parse(readFileSync(join(root, name)));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ready = read("production-probe-ready.json");
const background = read("production-background.json");
const progress = read("production-performance-progress.json");
const cleanup = read("production-cleanup.json");
const input = read("production-input-paint.json");
const coverage = read("production-preload-coverage.json");
const rendering = read("production-react-visible.json");
const hidden = read("production-resources-hidden-end.json");
const traceLabel =
  process.env.D_PI_PERFORMANCE_TRACE_LABEL ?? "hidden-native-hide";
assert(/^hidden-[a-z-]+$/.test(traceLabel));
const trace = read(`production-${traceLabel}-trace-summary.json`);
const projection = read("native-projection-cost.json");
const rendererPhase = read("production-renderer-phase.json");
const inputBeforeRepair = read("production-input-paint-before-repair.json");
for (const report of [
  background,
  cleanup,
  input,
  coverage,
  rendering,
  hidden,
  trace,
  rendererPhase,
  inputBeforeRepair,
])
  assertProbeRun(report, ready);
assert.equal(progress.applicationPid, ready.applicationPid);
assert.equal(progress.startAt, ready.startAt);
assertProbeRun(read("production-resources-hidden-after-warm.json"), ready);
assert.equal(background.completed, true);
assert.equal(progress.scope.complete, true);
assert.equal(cleanup.applicationPid, ready.applicationPid);
assert.equal(cleanup.sourceRunStartAt, ready.startAt);
assert.equal(cleanup.processFamilyAbsent, true);
assert(Number.isSafeInteger(cleanup.verifiedAt));
assert.equal(cleanup.leases.length, 3);
assert(cleanup.leases.every((lease) => lease.exclusiveLockAcquired));
assert.equal(
  cleanup.allNativeCold,
  cleanup.leases.every((lease) => lease.owners === 0),
);
// Evidence includes a failed initial latency target; do not discard or label
// that measurement as passing simply because the other budgets passed.
assert.equal(input.passed, input.p95UpperBoundMs <= input.targetMs);
assert.equal(coverage.phases.length, 2);
assert.equal(rendering.composerMutationDelta, 0);
assert.equal(hidden.visibility, "hidden");
assert.equal(trace.dataLossOccurred, false);
assert.equal(trace.visibilityBefore.event.at, trace.visibilityAfter.event.at);
assert(
  background.visibilityIntervals.some(
    (interval) =>
      interval.state === "hidden" &&
      interval.startAt === trace.visibilityBefore.event.at &&
      interval.startAt <= trace.startAt &&
      interval.endAt >= trace.endAt,
  ),
  "Trace is outside an actually observed hidden interval",
);
const buildSource = readFileSync(join(root, "out/main/index.js"), "utf8");
const embedded = buildSource.match(
  /var define_D_PI_BUILD_default = (\{[^\n]+\});/,
);
assert(embedded, "Actual embedded build identity missing");
const commit = embedded[1].match(/commit: "([a-f0-9]{40})"/)[1];
assert.equal(
  rendererPhase.sourceCommit,
  "716b82067b06ca2ca39462aaa642e08b73349b23",
);
assert.deepEqual(
  execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      commit,
      "HEAD",
      "--",
      "src",
      "runtime",
      ":(exclude)**/*.test.*",
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean),
  ["src/app/renderer/reading/markdown.tsx"],
  "Only the explicitly measured Renderer repair may differ from the background sources",
);
for (const file of rendererPhase.sourceFiles) {
  assert(
    [
      "src/app/renderer/reading/markdown.tsx",
      "src/app/renderer/reading/reading-anchor.ts",
    ].includes(file.name),
  );
  assert.equal(sha(readFileSync(file.name)), file.sha256);
}
assert(
  rendererPhase.sourceFiles.some(
    (file) => file.name === "src/app/renderer/reading/markdown.tsx",
  ),
);
for (const asset of rendererPhase.assets) {
  assert.equal(asset.name, asset.name.split("/").at(-1));
  assert.equal(
    sha(readFileSync(join(root, "out/renderer/assets", asset.name))),
    asset.sha256,
  );
}
assert(rendererPhase.loadedEntry.length === 1);
assert(
  rendererPhase.assets.some((asset) =>
    rendererPhase.loadedEntry[0].endsWith(`/assets/${asset.name}`),
  ),
);
assert(input.actual.startAt >= rendererPhase.at);
assert(rendering.before.at >= rendererPhase.at);
assert.equal(
  execFileSync(
    "git",
    [
      "diff",
      rendererPhase.sourceCommit,
      "HEAD",
      "--",
      "src",
      "runtime",
      ":(exclude)**/*.test.*",
    ],
    {
      encoding: "utf8",
    },
  ),
  "",
  "Current production sources differ from the measured foreground Renderer phase",
);
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    total: values.reduce((sum, x) => sum + x, 0),
    max: sorted.at(-1),
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
};
const seconds = (text) =>
  text
    .split(":")
    .map(Number)
    .reduce((sum, x) => sum * 60 + x, 0);
const first = background.samples[0],
  last = background.samples.at(-1);
const processMetrics = last.processes.map((process) => {
  const initial = first.processes.find((p) => p.pid === process.pid);
  return {
    pid: process.pid,
    executable: process.executable,
    initialRssKiB: initial?.rssKiB ?? null,
    finalRssKiB: process.rssKiB,
    cpuSecondsDuringSamples: initial
      ? seconds(process.cpuTime) - seconds(initial.cpuTime)
      : null,
  };
});
const rawTrace = readFileSync(
  join(root, `production-${traceLabel}-trace.json`),
);
const compressed = gzipSync(rawTrace, { level: 9 });
const output = resolve(
  ".scratch/session-components/evidence/production-performance.json",
);
const traceOutput = resolve(
  ".scratch/session-components/evidence/production-hidden-trace.json.gz",
);
const dataset = read("dataset.json");
const currentNative = dataset.records.map((record) => {
  const bytes = readFileSync(record.sessionFile);
  return {
    threadId: record.threadId,
    sessionId: record.sessionId,
    bytes: bytes.length,
    sha256: sha(bytes),
    messages: bytes
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.type === "message").length,
  };
});
const manifest = read("resources/sdk/manifest.json");
const validationFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "validation/m2"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter((path) => path.startsWith("validation/m2/production-"));
const report = {
  recordedAt: new Date().toISOString(),
  method:
    "Actual minified production Renderer, formal Main/Preload/Host and fixed OMP, isolated synthetic history and loopback supplier; no real provider or release candidate.",
  identity: {
    sourceCommit: commit,
    embedded: embedded[1],
    sourceDirty: true,
    headAtEvidence: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    applicationPid: ready.applicationPid,
    startAt: ready.startAt,
    productionBuild: progress.productionBuild,
    preloadSha256: sha(readFileSync(join(root, "out/preload/index.cjs"))),
    validationLoaderSha256: sha(
      readFileSync(join(root, "out/main/performance-loader.cjs")),
    ),
    rendererAssets: readdirSync(join(root, "out/renderer/assets"))
      .filter((name) => /\.(js|css)$/.test(name))
      .map((name) => ({
        name,
        sha256: sha(readFileSync(join(root, "out/renderer/assets", name))),
      })),
    rendererPhase,
    sdkManifest: manifest,
    sdkManifestSha256: sha(
      readFileSync(join(root, "resources/sdk/manifest.json")),
    ),
    validation: validationFiles.map((path) => ({
      path,
      sha256: sha(readFileSync(path)),
    })),
  },
  machine: {
    ...progress.machine,
    macOS: execFileSync("sw_vers", ["-productVersion"], {
      encoding: "utf8",
    }).trim(),
    electron: manifest.electron ?? "44.4.5",
    viewport: progress.samples[0].browser.viewport,
  },
  dataset: {
    initial: dataset,
    currentNative,
    note: "10,000 is the initial seeded cumulative history; legitimate tool and stream records were subsequently appended. Initial hashes describe the seed, not current files.",
  },
  tool: progress.toolEvidence,
  background: {
    startAt: background.startAt,
    endAt: background.endAt,
    durationMs: background.durationMs,
    wallClockDurationMs: background.wallClockDurationMs,
    continuousHidden: background.continuousHidden,
    longestContinuousHiddenMs: background.longestContinuousHiddenMs,
    visibilityIntervals: background.visibilityIntervals,
    targetDurationMs: background.targetDurationMs,
    completed: background.completed,
    nativeExecutionDurationMs: progress.endAt - progress.startAt,
    nativeExecutionSampleCount: progress.samples.length,
    allSourceNativeSamplesBusy: progress.samples.every(
      (sample) =>
        Object.values(sample.browser.views).filter(
          (view) => view.control.streaming,
        ).length === 3 &&
        Object.values(sample.streams).every(
          (stream) => stream.endedAt === null,
        ),
    ),
    sampleCount: background.samples.length,
    allThreeStreaming: background.samples.every(
      (s) => s.browser.views.filter((v) => v.control.streaming).length === 3,
    ),
    visibilityEvents: last.browser.visibilityEvents,
    domNodes: stats(background.samples.map((s) => s.browser.domNodes)),
    familyRssKiB: stats(
      background.samples.map((s) =>
        s.processes.reduce((sum, p) => sum + p.rssKiB, 0),
      ),
    ),
    processMetrics,
    browserMetrics: { first: first.metrics, last: last.metrics },
    longTasks: last.browser.longTasks,
    finalSupplierStreams: progress.samples.at(-1).streams,
    observationOverhead:
      "30-second CDP metrics, process-family ps and scalar page observation; separate 45-second tracing interval included. No React DevTools or V8 precise coverage during the background run.",
  },
  hiddenResources: {
    afterWarm: read("production-resources-hidden-after-warm.json"),
    end: hidden,
  },
  hiddenTrace: {
    ...trace,
    zeroCounts: Object.fromEntries(
      [
        "Layout",
        "Paint",
        "Commit",
        "FunctionCall",
        "EventDispatch",
        "UpdateLayoutTree",
      ].map((name) => [name, trace.counts[name] ?? 0]),
    ),
    rawSha256: sha(rawTrace),
    gzipSha256: sha(compressed),
    gzipBytes: compressed.length,
    path: "production-hidden-trace.json.gz",
  },
  inputPaint: input,
  inputBeforeRepair: {
    ...inputBeforeRepair,
    scope:
      "Earlier foreground phase on the original 5a Renderer, before the 716 repair; body length continued growing, so this is not an identical-dataset speedup comparison.",
  },
  nativeIme: {
    ...read("run5-native-ime.json"),
    scope:
      "Separate earlier run on identical 5a production source and same initial fixture, three actual busy streams and >20,000-character Composer; proves real system composition, not Event Timing p95.",
  },
  preloadCoverage: coverage,
  react: rendering,
  hostProjection: {
    source: projection.source,
    method: projection.method,
    nativeUpdates: projection.nativeUpdates,
    totalNativeBytes: projection.totalNativeBytes,
    totalAppPayloadJsonBytes: projection.totalAppPayloadJsonBytes,
    appendTextBytes: projection.appendTextBytes,
    finalProjectionBytes: projection.finalProjectionBytes,
    incomingCosts: Object.fromEntries(
      ["encodeMs", "decodeWithoutProjectionMs", "projectionMs"].map((key) => [
        key,
        stats(projection.incoming.map((item) => item[key])),
      ]),
    ),
    serializationCosts: stats(
      projection.outbound.map((item) => item.serializationMs),
    ),
    bodyModes: projection.outbound.reduce((counts, item) => {
      const previous = counts[item.kind] ?? { events: 0, bytes: 0 };
      counts[item.kind] = {
        events: previous.events + 1,
        bytes: previous.bytes + item.bytes,
      };
      return counts;
    }, {}),
    supplier: read("native-projection-run.json"),
    scope:
      "Independent actual native RPC forwarder with default full snapshots → actual encoder/decoder/projection, encoded frames in memory. Counts the necessary cumulative native snapshots; does not measure 30-minute OS pipe traffic.",
  },
  cleanup,
  acceptance: {
    inputLatencyTargetMet: input.passed,
    normalQuitColdConfirmed: cleanup.allNativeCold,
    complete: input.passed && cleanup.allNativeCold,
    remaining: [
      ...(input.passed
        ? []
        : [
            "Large growing Markdown paragraph input latency exceeds the initial 50ms target; WB03 full acceptance remains open.",
          ]),
      ...(cleanup.allNativeCold
        ? []
        : [
            "All owned processes exited, but execution lease owners remain after normal Quit; clean cold shutdown is not confirmed.",
          ]),
    ],
  },
  limits: [
    "Loopback supplier and synthetic initial history, not real-provider acceptance.",
    "10 MiB is the actual native complete artifact, not inline payload or wire size.",
    "Event Timing bounds describe trusted browser injected input to next rendering update, not physical keyboard or CUA transport.",
    "React root commits and unchanged idle Composer DOM do not prove zero Composer function renders.",
    "Hidden presentation can stop while three busy native runtimes retain legitimate execution resources; RSS is not cache-policy bytes.",
    "Measured production build has embedded dirty=true; this is engineering evidence, not a clean packaged release.",
    "Previous background attempts with restored visibility and retained stale lease owners are excluded from passing evidence; root causes of OS restores remain unknown.",
  ],
};
assert(report.background.allThreeStreaming);
writeFileSync(traceOutput, compressed);
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    output,
    traceOutput,
    durationMs: background.durationMs,
    p95UpperBoundMs: input.p95UpperBoundMs,
  }),
);
