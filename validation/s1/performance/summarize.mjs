import { readFileSync, writeFileSync } from "node:fs";

const evidence = ".scratch/m1-s1-project-draft/evidence";
const quantile = (a, p) =>
  a.toSorted((x, y) => x - y)[Math.ceil(a.length * p) - 1];
const stats = (a) => {
  const mean = a.reduce((s, n) => s + n, 0) / a.length;
  return {
    n: a.length,
    median: quantile(a, 0.5),
    p95: quantile(a, 0.95),
    mean,
    stddev: Math.sqrt(a.reduce((s, n) => s + (n - mean) ** 2, 0) / a.length),
    min: Math.min(...a),
    max: Math.max(...a),
  };
};
const input = JSON.parse(
  readFileSync(`${evidence}/input-confirm.json`),
).results.filter((r) => !r.warmup);
const task = JSON.parse(
  readFileSync(`${evidence}/task-performance.json`),
).results;
const result = {};
for (const mode of ["off", "on"]) {
  const rows = input.filter((r) => r.mode === mode);
  result[mode] = {
    inputMs: stats(rows.flatMap((r) => r.samples)),
    perRunP95Ms: stats(rows.map((r) => quantile(r.samples, 0.95))),
    rssMiB: stats(rows.map((r) => r.rssMiB)),
    taskMs: stats(task.filter((r) => r.mode === mode).map((r) => r.durationMs)),
  };
}
result.delta = {
  inputP95Ms: result.on.inputMs.p95 - result.off.inputMs.p95,
  taskMedianPercent:
    (result.on.taskMs.median / result.off.taskMs.median - 1) * 100,
  rssMedianMiB: result.on.rssMiB.median - result.off.rssMiB.median,
};
writeFileSync(
  `${evidence}/performance-summary.json`,
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
