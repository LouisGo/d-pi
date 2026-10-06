import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { readDiagnosticSnapshot } from "../src/platform/main/diagnostics/public";
it("measures bounded near-budget scan and verifies no retained descriptor with macOS lsof", async () => {
  const directory = await mkdtemp(join(tmpdir(), "d-pi-reader-measure-"));
  try {
    await writeFile(join(directory, "main.jsonl"), "x".repeat(9 * 1024 * 1024) + "\n");
    const memory = process.memoryUsage();
    const started = performance.now();
    const snapshot = await readDiagnosticSnapshot(directory, { since: "2000-01-01T00:00:00.000Z", until: "2100-01-01T00:00:00.000Z", limit: 500 });
    const durationMs = performance.now() - started;
    const after = process.memoryUsage();
    const { stdout } = await promisify(execFile)("/usr/sbin/lsof", ["-p", String(process.pid), "-Fn"], { maxBuffer: 4 * 1024 * 1024 });
    expect(stdout).not.toContain(directory);
    expect(snapshot.coverage.bytes).toBe(8 * 1024 * 1024);
    expect(snapshot.coverage.truncated).toBe(true);
    await writeFile(join(import.meta.dirname, "benchmark.json"), JSON.stringify({ durationMs, scanBytes: snapshot.coverage.bytes, rssDelta: after.rss - memory.rss, heapUsedDelta: after.heapUsed - memory.heapUsed, externalDelta: after.external - memory.external, retainedDescriptorsForFixture: 0, platform: process.platform, node: process.version, sampling: "one near-budget synthetic file; no B6 A/B claim" }, null, 2));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
